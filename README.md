# The Imani Archive

A mobile-first Next.js shop for The Imani Archive, with Supabase products, private admin sign-in, product image uploads, order management, and a Flutterwave checkout starting point.

## What is included
- Premium pink boutique storefront inspired by the supplied original HTML.
- Live product catalogue from `public.products`.
- Category filters and shopping bag.
- Supabase Auth admin page at `/admin`.
- Product create/edit/delete, stock, availability, UGX price and image upload.
- Order and order-item tables, admin order status controls.
- Server-side checkout order creation and Flutterwave payment-link initiation.
- Flutterwave webhook signature and transaction verification route.

## Important before launch
This is a deployable project foundation, not a live payment deployment. You must configure and test provider accounts, environment variables, database policies, and deployment before accepting money. Flutterwave Uganda Mobile Money options depend on your merchant account being enabled and approved. Africa's Talking SMS credentials and sender ID are not included; add them only after account verification and then implement/test notification delivery.

## Supabase preparation
1. Keep your existing project and admin Auth user.
2. In Supabase SQL Editor, inspect your existing `products` table. This app expects columns: `id` (uuid), `name`, `short_description`, `description`, `category`, `price`, `stock_quantity`, `is_available`, `image_url`, and `created_at`.
3. If your `products` table does not have `image_url`, add it:
   `alter table public.products add column if not exists image_url text;`
4. Review `supabase/schema.sql` carefully before running it. It creates `orders` and `order_items` and configures RLS/storage policies. It assumes your existing `public.is_admin()` function correctly checks the signed-in user's `profiles.role = 'admin'`.
5. Confirm the profile row for your admin Auth user has `role='admin'`.
6. If your products table uses a different category constraint or price type, adjust it to match the app before launch.

## Environment variables
Copy `.env.example` to `.env.local` for local development. In Vercel, add the same variables in Project Settings → Environment Variables.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (your Supabase publishable key can be used here)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose or commit)
- `FLW_SECRET_KEY` (server-only)
- `FLW_SECRET_HASH` (server-only webhook verification hash)
- `NEXT_PUBLIC_SITE_URL` (your live site URL)

Never put service-role or payment secrets in a `NEXT_PUBLIC_` variable, and never paste them into chats or commit them to Git.

## Run locally
```bash
npm install
cp .env.example .env.local
# fill in values locally
npm run dev
```
Open http://localhost:3000.

## Admin
Visit `/admin` and sign in with the admin email/password for the Auth user in Supabase. The app does not use the old HTML demo PIN.

## Payment and SMS
Checkout creates an order and order items, then requests a Flutterwave payment link if `FLW_SECRET_KEY` is set. Configure the Flutterwave webhook URL as `https://YOUR_DOMAIN/api/webhook` and the webhook secret hash. Test with low-value/sandbox transactions before going live. Verify the merchant account supports the Uganda MTN/Airtel Mobile Money methods you intend to offer.

Africa's Talking SMS is not yet enabled in this build because no account credentials/sender ID were provided. Do not add the API key to browser code. Add SMS sending only in server routes or trusted server-side jobs after verifying the account and consent/message flow.

## Known next checks
- Confirm exact current products schema and category constraint.
- Add/verify customer-facing order confirmation page and payment return handler.
- Add stock reservation/decrement with concurrency protection.
- Add idempotent webhook event logging and payment failure handling.
- Add Africa's Talking SMS notification queue with deduplication.
- Add privacy/returns/delivery policy pages and test on mobile.
