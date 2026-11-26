import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char] as string));
}

function formatUgx(value: unknown) {
  return `UGX ${Number(value || 0).toLocaleString("en-UG")}`;
}

async function sendAdminNotifications(order: any) {
  const phones = (process.env.ADMIN_NOTIFICATION_PHONES || "")
    .split(",")
    .map((phone) => phone.trim())
    .filter(Boolean);
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  const itemLines = (order.order_items || []).map((item: any) =>
    `${item.product_name} x${item.quantity}`
  );
  const itemsText = itemLines.length ? itemLines.join(", ") : "Order items unavailable";
  const smsMessage = [
    "THE IMANI ARCHIVE: PAYMENT RECEIVED",
    `Order: ${order.order_reference}`,
    `Customer: ${order.customer_name} (${order.customer_phone})`,
    `Items: ${itemsText}`,
    `Total: ${formatUgx(order.total_amount)}`,
    `Delivery: ${order.delivery_address}, ${order.delivery_district}`
  ].join("\n");

  const tasks: Promise<unknown>[] = [];

  if (phones.length && process.env.AT_API_KEY && process.env.AT_USERNAME) {
    const endpoint = process.env.AT_ENVIRONMENT === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";
    const body = new URLSearchParams({
      username: process.env.AT_USERNAME,
      to: phones.join(","),
      message: smsMessage
    });
    tasks.push(fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Apikey: process.env.AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body,
      cache: "no-store"
    }).then(async (response) => {
      const result = await response.text();
      if (!response.ok) throw new Error(`Africa's Talking SMS failed (${response.status}): ${result}`);
      return result;
    }));
  }

  if (adminEmail && process.env.RESEND_API_KEY) {
    const itemRows = (order.order_items || []).map((item: any) =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.product_name)}</td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.quantity)}</td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(formatUgx(item.line_total ?? item.subtotal))}</td></tr>`
    ).join("");
    const html = `<div style="font-family:Arial,sans-serif;color:#222;max-width:640px;margin:auto">
      <h2 style="color:#a64d79">The Imani Archive — Payment received</h2>
      <p>A customer's payment has been verified successfully.</p>
      <p><strong>Order reference:</strong> ${escapeHtml(order.order_reference)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(order.customer_name)}<br/>
      <strong>Phone:</strong> ${escapeHtml(order.customer_phone)}</p>
      <h3>Items</h3>
      <table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th style="padding:8px">Product</th><th style="padding:8px">Qty</th><th style="padding:8px">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
      <p><strong>Total paid:</strong> ${escapeHtml(formatUgx(order.total_amount))}</p>
      <h3>Delivery details</h3>
      <p>${escapeHtml(order.delivery_address)}<br/>${escapeHtml(order.delivery_district)}</p>
      <p><strong>Payment:</strong> ${escapeHtml(order.payment_network || "Mobile Money")} — ${escapeHtml(order.payment_phone || "")}</p>
    </div>`;
    tasks.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "The Imani Archive <onboarding@resend.dev>",
        to: [adminEmail],
        subject: `Paid order received — ${order.order_reference}`,
        html
      }),
      cache: "no-store"
    }).then(async (response) => {
      const result = await response.text();
      if (!response.ok) throw new Error(`Resend email failed (${response.status}): ${result}`);
      return result;
    }));
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.error("Order notification failed:", result.reason);
  }
}

export async function POST(req: Request) {
  try {
    const event = await req.json();
    const reference = event?.transaction?.reference;
    const transactionUuid = event?.transaction?.uuid;
    const eventType = event?.event_type;

    if (!reference || !transactionUuid ||
        !["collection.completed", "collection.failed"].includes(eventType)) {
      return NextResponse.json({ received: true });
    }

    const apiKey = process.env.MARZPAY_API_KEY;
    const apiSecret = process.env.MARZPAY_API_SECRET;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Payment verification is not configured." }, { status: 503 });
    }

    // Verify the callback against MarzPay's authenticated transaction-status endpoint
    // before changing an order's payment status.
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const verification = await fetch(
      `https://wallet.wearemarz.com/api/v1/collect-money/${encodeURIComponent(transactionUuid)}`,
      { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" }, cache: "no-store" }
    );
    const verified = await verification.json().catch(() => ({}));
    const tx = verified?.data?.transaction;

    if (!verification.ok || tx?.reference !== reference) {
      return NextResponse.json({ error: "Could not verify MarzPay transaction." }, { status: 400 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Only the first verified completion can change pending/processing to paid.
    // The returned row acts as the idempotency gate for notification delivery.
    if (eventType === "collection.completed" && ["completed", "successful"].includes(tx?.status)) {
      const { data: paidOrder, error: updateError } = await sb.from("orders")
        .update({ payment_status: "paid", order_status: "confirmed" })
        .eq("order_reference", reference)
        .in("payment_status", ["pending", "processing"])
        .select("id,order_reference,customer_name,customer_phone,total_amount,delivery_address,delivery_district,payment_network,payment_phone,customer:customers(email),order_items(product_name,quantity,unit_price,line_total,subtotal)")
        .maybeSingle();

      if (updateError) {
        console.error("Could not mark order as paid:", updateError);
        return NextResponse.json({ error: "Could not update order." }, { status: 500 });
      }

      if (paidOrder) await sendAdminNotifications(paidOrder);
    } else if (eventType === "collection.failed" && ["failed", "cancelled"].includes(tx?.status)) {
      await sb.from("orders")
        .update({ payment_status: "failed" })
        .eq("order_reference", reference)
        .in("payment_status", ["pending", "processing"]);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Invalid MarzPay callback:", error);
    return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  }
}
