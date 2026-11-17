-- Run this in Supabase SQL Editor after checking your existing products/profiles tables.
-- It deliberately does not recreate products or profiles, which you already set up.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  email text,
  delivery_address text not null,
  district text not null,
  delivery_notes text,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  order_status text not null default 'new' check (order_status in ('new','confirmed','processing','ready_for_delivery','dispatched','delivered','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled','refunded')),
  payment_reference text unique,
  created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "orders_admin_all" on public.orders;
create policy "orders_admin_all" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "order_items_admin_all" on public.order_items;
create policy "order_items_admin_all" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Products: public can read available items; admin can manage.
alter table public.products enable row level security;
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products for select to anon, authenticated using (is_available = true or public.is_admin());
drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public product image bucket. Review existing policies before running if you already configured these.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects for select to anon,authenticated using (bucket_id='product-images');
drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert" on storage.objects for insert to authenticated with check (bucket_id='product-images' and public.is_admin());
drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects for update to authenticated using (bucket_id='product-images' and public.is_admin()) with check (bucket_id='product-images' and public.is_admin());
drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects for delete to authenticated using (bucket_id='product-images' and public.is_admin());
