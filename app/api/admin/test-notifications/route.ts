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
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (auth.error || !user || !adminEmail || user.email?.toLowerCase() !== adminEmail.toLowerCase()) return NextResponse.json({ error: "You are not authorized to run this test." }, { status: 403 });
    const outcomes: Record<string, string> = {};
    const phones = (process.env.ADMIN_NOTIFICATION_PHONES || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (process.env.AT_API_KEY && process.env.AT_USERNAME && phones.length) {
      const endpoint = process.env.AT_ENVIRONMENT === "sandbox" ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging";
      const body = new URLSearchParams({ username: process.env.AT_USERNAME, to: phones.join(","), message: "THE IMANI ARCHIVE TEST: Notification setup check. No order or payment was made." });
      const sms = await fetch(endpoint, { method: "POST", headers: { Accept: "application/json", Apikey: process.env.AT_API_KEY, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
      outcomes.sms = sms.ok ? "Accepted by Africa\u0027s Talking." : "Africa\u0027s Talking HTTP " + sms.status + ": " + (await sms.text()).slice(0, 400);
    } else outcomes.sms = "Skipped: Africa\u0027s Talking settings are incomplete.";
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