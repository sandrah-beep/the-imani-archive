import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Sign in to the admin dashboard first." }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const auth = await supabase.auth.getUser(token);
    const user = auth.data.user;
    const allowedAdminEmail = (process.env.ADMIN_AUTH_EMAIL || "theimaniarchive@gmail.com").trim().toLowerCase();
    if (auth.error || !user?.email || user.email.toLowerCase() !== allowedAdminEmail) return NextResponse.json({ error: "Please sign in with the authorised Imani Archive admin account." }, { status: 403 });
    const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || "sandrahgidudu@gmail.com").trim();
    const requestBody = await request.json().catch(() => ({}));
    const customerPhone = String(requestBody?.customerPhone || "").trim();
    if (customerPhone && !/^\\+?[0-9]{8,15}$/.test(customerPhone)) {
      return NextResponse.json({ error: "Enter a valid phone number in international format." }, { status: 400 });
    }
    const outcomes: Record<string, string> = {};
    const phones = (process.env.ADMIN_NOTIFICATION_PHONES || process.env.ADMIN_NOTIFICATION_PHONE || "+256709473300,+256731405966").split(",").map((x) => x.trim()).filter(Boolean);
    if (process.env.AT_API_KEY && process.env.AT_USERNAME && phones.length) {
      const endpoint = process.env.AT_ENVIRONMENT === "sandbox" ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging";
      const body = new URLSearchParams({ username: process.env.AT_USERNAME, to: phones.join(","), message: "THE IMANI ARCHIVE TEST: Notification setup check. No order or payment was made." });
      const sms = await fetch(endpoint, { method: "POST", headers: { Accept: "application/json", Apikey: process.env.AT_API_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
      outcomes.sms = sms.ok ? "Accepted by Africa\u0027s Talking." : "Africa\u0027s Talking HTTP " + sms.status + ": " + (await sms.text()).slice(0, 400);
    } else outcomes.sms = "Skipped: Africa\u0027s Talking settings are incomplete.";
    if (customerPhone && process.env.AT_API_KEY && process.env.AT_USERNAME) {
      const endpoint = process.env.AT_ENVIRONMENT === "sandbox" ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging";
      const body = new URLSearchParams({
        username: process.env.AT_USERNAME,
        to: customerPhone,
        message: "THE IMANI ARCHIVE: Your payment is confirmed! Order: TEST-ORDER. Items: Sample accessories. Total paid: UGX 6,000. Thank you for shopping with us. This is a test only; no order or payment was made."
      });
      const sms = await fetch(endpoint, { method: "POST", headers: { Accept: "application/json", Apikey: process.env.AT_API_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
      outcomes.customerSms = sms.ok ? "Accepted by Africa's Talking." : "Africa's Talking HTTP " + sms.status + ": " + (await sms.text()).slice(0, 400);
    } else if (customerPhone) outcomes.customerSms = "Skipped: Africa's Talking settings are incomplete.";
    if (process.env.RESEND_API_KEY && adminEmail) {
      const email = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: "The Imani Archive <onboarding@resend.dev>", to: [adminEmail], subject: "The Imani Archive — notification test", html: "<div style=\"font-family:Arial,sans-serif;color:#222\"><h2 style=\"color:#a64d79\">The Imani Archive</h2><p>This is a test notification. If you received this, the email connection is working.</p><p>No order was created and no payment was made.</p></div>" }), cache: "no-store" });
      outcomes.email = email.ok ? "Accepted by Resend." : "Resend HTTP " + email.status + ": " + (await email.text()).slice(0, 400);
    } else outcomes.email = "Skipped: RESEND_API_KEY is missing.";
    const message = "Test completed. " + Object.entries(outcomes).map(([key, value]) => key + ": " + value).join(" | ");
    return NextResponse.json({ message, outcomes });
  } catch (error) {
    console.error("Notification test failed:", error);
    return NextResponse.json({ error: "The notification test could not be completed." }, { status: 500 });
  }
}