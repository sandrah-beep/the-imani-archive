import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    // MarzPay's transaction lookup documentation uses "successful"; webhook events
    // use "collection.completed". Accept both successful terminal representations.
    if (eventType === "collection.completed" && ["completed", "successful"].includes(tx?.status)) {
      await sb.from("orders")
        .update({ payment_status: "paid", order_status: "confirmed" })
        .eq("order_reference", reference)
        .in("payment_status", ["pending", "processing"]);
    } else if (eventType === "collection.failed" && ["failed", "cancelled"].includes(tx?.status)) {
      await sb.from("orders")
        .update({ payment_status: "failed" })
        .eq("order_reference", reference)
        .in("payment_status", ["pending", "processing"]);
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  }
}