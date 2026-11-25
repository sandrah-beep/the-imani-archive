import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function ugandaPhone(value: string) {
  const digits = value.replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(digits)) return `+256${digits.slice(1)}`;
  if (/^256\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+256\d{9}$/.test(digits)) return digits;
  return null;
}

function detectedNetwork(phone: string) {
  // phone is normalized to +256XXXXXXXXX, so the leading local 0 is absent.
  const national = phone.slice(4);
  if (/^7[0-5]/.test(national)) return "AIRTEL";
  if (/^7[6-8]/.test(national) || /^3[19]/.test(national)) return "MTN";
  return null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.MARZPAY_API_KEY;
    const apiSecret = process.env.MARZPAY_API_SECRET;
    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Payment setup is incomplete. Please contact the shop." }, { status: 503 });
    }

    const body = await req.json();
    const c = body.customer;
    const items = body.items;

    if (!c?.name || !c?.phone || !c?.address || !c?.district ||
        !["MTN", "AIRTEL"].includes(String(c?.paymentNetwork || "").trim().toUpperCase()) ||
        !Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: "Please complete your details, choose MTN or Airtel Money, and check your bag." }, { status: 400 });
    }

    const paymentPhone = ugandaPhone(String(c.paymentPhone || c.phone));
    if (!paymentPhone) {
      return NextResponse.json({ error: "Enter a valid Uganda mobile money number, for example 0771234567." }, { status: 400 });
    }
    const network = detectedNetwork(paymentPhone);
    const selectedNetwork = String(c.paymentNetwork || "").trim().toUpperCase();
    if (!network || network !== selectedNetwork) {
      return NextResponse.json({ error: "The mobile money number does not appear to match the network selected. Please check the number and network." }, { status: 400 });
    }

    const ids = items.map((x: any) => x.product_id);
    if (ids.some((x: any) => typeof x !== "string")) {
      return NextResponse.json({ error: "Invalid products." }, { status: 400 });
    }

    const sb = admin();
    const { data: products, error: productError } = await sb
      .from("products")
      .select("id,name,price,stock_quantity,is_available")
      .in("id", ids);

    if (productError || !products || products.length !== ids.length) {
      return NextResponse.json({ error: "One or more products are no longer available." }, { status: 400 });
    }

    const lines = items.map((item: any) => {
      const product = products.find((p: any) => p.id === item.product_id);
      const quantity = Number(item.quantity);
      if (!product || !product.is_available || !Number.isInteger(quantity) ||
          quantity < 1 || quantity > product.stock_quantity) {
        throw new Error("A product is unavailable or has insufficient stock.");
      }
      return {
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: Number(product.price),
        line_total: Number(product.price) * quantity
      };
    });

    const subtotal = lines.reduce((sum: number, line: any) => sum + line.line_total, 0);
    if (!Number.isFinite(subtotal) || subtotal < 500) {
      return NextResponse.json({ error: "The minimum MarzPay payment amount is UGX 500." }, { status: 400 });
    }

    // MarzPay requires a unique UUID v4 reference. We also use it to match callbacks to this order.
    const reference = randomUUID();

    const { data: customer, error: customerError } = await sb
      .from("customers")
      .insert({ full_name: c.name, phone: c.phone, email: c.email || null })
      .select("id")
      .single();

    if (customerError || !customer) {
      console.error("Checkout customer insert failed:", customerError);
      return NextResponse.json({ error: "We couldn't save your customer details. Please try again." }, { status: 500 });
    }

    const { data: order, error: orderError } = await sb
      .from("orders")
      .insert({
        order_reference: reference,
        customer_id: customer.id,
        customer_name: c.name,
        customer_phone: c.phone,
        subtotal,
        total_amount: subtotal,
        payment_network: network,
        payment_phone: paymentPhone,
        delivery_address: c.address,
        delivery_district: c.district,
        payment_status: "pending"
      })
      .select("id,order_reference")
      .single();

    if (orderError || !order) {
      console.error("Checkout order insert failed:", orderError);
      return NextResponse.json({ error: "We couldn't create your order. Please try again." }, { status: 500 });
    }

    const { error: itemError } = await sb.from("order_items").insert(
      lines.map((line: any) => ({ ...line, order_id: order.id }))
    );

    if (itemError) {
      console.error("Checkout order_items insert failed:", itemError);
      await sb.from("orders").delete().eq("id", order.id);
      return NextResponse.json({ error: "We couldn't save your order items." }, { status: 500 });
    }

    const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const payment = await fetch("https://wallet.wearemarz.com/api/v1/collect-money", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: subtotal,
        phone_number: paymentPhone,
        country: "UG",
        reference,
        method: "mobile_money",
        description: `The Imani Archive order ${reference}`,
        callback_url: `${site}/api/webhook`,
        metadata: [{ orderId: order.id }]
      })
    });

    const result = await payment.json().catch(() => ({}));
    if (!payment.ok || result?.status !== "success" || !result?.data?.transaction) {
      console.error("MarzPay collection request failed:", result);
      return NextResponse.json({
        order_id: order.id,
        order_reference: reference,
        error: result?.message || "Your order was saved, but MarzPay could not start the payment. Please contact the shop before trying again."
      }, { status: 502 });
    }

    await sb.from("orders").update({ payment_status: "processing" }).eq("id", order.id);

    return NextResponse.json({
      order_id: order.id,
      order_reference: reference,
      payment_status: result.data.transaction.status || "processing",
      message: "Payment request sent. Please check your phone and approve the Mobile Money prompt. Your order will be confirmed after MarzPay verifies the payment."
    });
  } catch (error) {
    console.error("Checkout unexpected error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unexpected checkout error."
    }, { status: 400 });
  }
}
