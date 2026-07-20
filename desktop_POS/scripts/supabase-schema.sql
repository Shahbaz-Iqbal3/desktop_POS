-- ============================================================================
-- POS App — Supabase Cloud Schema (regenerated to match src/main/db.ts)
-- ============================================================================
-- Run this in your Supabase project's SQL editor (or via the CLI).
--
-- One Supabase project serves ALL shop installations. Each shop's rows are
-- separated by `shop_id`, which the app injects on every insert/select.
--
-- IMPORTANT — how sync works:
--   The app reads rows with `SELECT *` (snake_case local columns), camelCases
--   them for the renderer, then converts the keys BACK to snake_case before
--   sending to Supabase (see src/main/sync.ts: camelKeysToSnake). Therefore the
--   column names below MUST match the LOCAL SQLite columns in src/main/db.ts
--   EXACTLY (e.g. actual_paid_price, change_amount, created_at, sale_id).
--
-- Type mapping (local SQLite -> Postgres):
--   TEXT   -> text
--   REAL   -> numeric
--   INTEGER-> integer
--   items  -> text  (JSON string; the app stores/inserts it as text)
--   *_at   -> timestamptz (ISO strings from the app insert fine)
--
-- RLS: enabled on every synced table. The app uses the PUBLIC anon key (no
-- per-user auth), so policies are permissive (allow all). True per-shop
-- isolation is enforced by `shop_id` in every app query, not at the DB layer.
-- For stronger isolation, front the anon key with a backend proxy that injects
-- a service_role key and validates shop_id. See SECURITY note at the bottom.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RESET (optional) — DROP EVERYTHING, then re-create from scratch.
-- Uncomment ONLY if you want to wipe all cloud data and start clean.
-- ----------------------------------------------------------------------------
-- drop policy if exists "anon_all_shops"         on public.shops;
-- drop policy if exists "anon_all_branches"      on public.branches;
-- drop policy if exists "anon_all_tills"         on public.tills;
-- drop policy if exists "anon_all_categories"    on public.categories;
-- drop policy if exists "anon_all_products"      on public.products;
-- drop policy if exists "anon_all_stock"         on public.stock_movements;
-- drop policy if exists "anon_all_sales"         on public.sales;
-- drop policy if exists "anon_all_returns"       on public.returns;
-- drop policy if exists "anon_all_shifts"        on public.shifts;
-- drop policy if exists "anon_all_error_logs"    on public.error_logs;
-- drop policy if exists "anon_all_feedback"      on public.feedback;
-- drop table if exists public.shops cascade;
-- drop table if exists public.branches cascade;
-- drop table if exists public.tills cascade;
-- drop table if exists public.categories cascade;
-- drop table if exists public.products cascade;
-- drop table if exists public.stock_movements cascade;
-- drop table if exists public.sales cascade;
-- drop table if exists public.returns cascade;
-- drop table if exists public.shifts cascade;
-- drop table if exists public.error_logs cascade;
-- drop table if exists public.feedback cascade;

-- ============================ TABLES =======================================

-- ---------- shops (one row per installed shop) ----------
create table if not exists public.shops (
  id           text primary key,
  name         text not null,
  currency     text not null default 'Rs',
  access_token text not null unique,
  pairing_code text unique,
  pairing_code_expires_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- NOTE: the pairing_code index is created in the MIGRATIONS block below (after
-- the column is guaranteed to exist) so re-running on an existing shops table
-- does not fail with "column pairing_code does not exist".

-- NOTE on FOREIGN KEYS:
--   The app only syncs TRANSACTIONAL rows (sales, stock_movements, returns,
--   error_logs, feedback) plus a `shops` upsert. The master tables
--   (branches, tills, categories, products) are NOT pushed to the cloud (the
--   local DB has no `synced` tracking for them either). Enforcing FKs here
--   would make every child insert fail with 23503. Integrity is already
--   guaranteed locally by SQLite FKs; Supabase is only a per-shop_id cloud
--   backup, so we OMIT all foreign-key constraints below.
--
-- ---------- branches ----------
create table if not exists public.branches (
  id       text primary key,
  name     text not null,
  shop_id  text not null
);

-- ---------- tills ----------
create table if not exists public.tills (
  id         text primary key,
  name       text not null,
  branch_id  text not null,
  shop_id    text not null
);

-- ---------- categories ----------
create table if not exists public.categories (
  id         text primary key,
  name       text not null,
  sort_order integer not null default 0,
  shop_id    text not null,
  updated_at timestamptz not null default now()
);

-- ---------- products ----------
create table if not exists public.products (
  id                  text primary key,
  name                text not null,
  category_id         text not null,
  sku                 text,
  barcode             text,
  unit_type           text not null default 'piece',
  default_price       numeric not null default 0,
  default_discount    numeric not null default 0,
  low_stock_threshold integer not null default 5,
  image_path          text,
  created_at          timestamptz not null default now(),
  shop_id             text not null,
  active              integer not null default 1,
  updated_at          timestamptz not null default now()
);

-- ---------- stock_movements (stock = SUM of these) ----------
create table if not exists public.stock_movements (
  id            text primary key,
  product_id    text not null,
  category      text not null,
  change_amount numeric not null,
  reason        text not null,
  created_at    timestamptz not null default now(),
  synced        integer not null default 0,
  shop_id       text not null,
  updated_at    timestamptz not null default now()
);

-- ---------- sales ----------
create table if not exists public.sales (
  id                 text primary key,
  branch_id          text not null,
  till_id            text not null,
  shift_id           text,
  items              text not null,   -- JSON array of SaleItem (stored as text)
  total              numeric not null,
  order_discount     numeric not null default 0,  -- order-level discount % (0-100)
  actual_paid_price  numeric not null,
  payment_method     text not null default 'cash',
  created_at         timestamptz not null default now(),
  synced             integer not null default 0,
  shop_id            text not null
);

-- ---------- returns (refunds) ----------
create table if not exists public.returns (
  id              text primary key,
  sale_id         text not null,
  branch_id       text not null,
  till_id         text not null,
  shift_id        text,
  items           text not null,   -- JSON array of refunded SaleItem (stored as text)
  total           numeric not null,
  refund_amount   numeric not null,
  payment_method  text not null default 'cash',
  created_at      timestamptz not null default now(),
  synced          integer not null default 0,
  shop_id         text not null
);

-- ---------- shifts ----------
create table if not exists public.shifts (
  id            text primary key,
  till_id       text not null,
  opening_cash  numeric not null,
  closing_cash  numeric,
  expected_cash numeric,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  shop_id       text not null
);

-- ---------- error_logs ----------
create table if not exists public.error_logs (
  id         text primary key,
  message    text not null,
  stack      text,
  context    text,
  created_at timestamptz not null default now(),
  synced     integer not null default 0,
  shop_id    text not null
);

-- ---------- feedback ----------
create table if not exists public.feedback (
  id         text primary key,
  message    text not null,
  rating     integer,
  created_at timestamptz not null default now(),
  synced     integer not null default 0,
  shop_id    text not null
);

-- ============================ MIGRATIONS ===================================
-- Idempotent safety: if you created these tables from an OLDER schema, add any
-- columns that may be missing without dropping data. No-ops when already present.
--
-- alter table public.sales         add column if not exists actual_paid_price numeric not null default 0;
-- alter table public.stock_movements add column if not exists change_amount numeric not null default 0;
-- alter table public.error_logs    add column if not exists created_at timestamptz not null default now();
-- alter table public.returns       add column if not exists sale_id text not null default '';

-- Add the `bookmarked` column (History tab star toggle) — must match the local
-- migration in src/main/db.ts so Supabase sync stops failing with PGRST204.
alter table public.sales add column if not exists bookmarked integer not null default 0;
-- Order-level discount % (0-100) — must match the local sales table so sale
-- sync stops failing with PGRST204.
alter table public.sales add column if not exists order_discount numeric not null default 0;

-- Drop OLD foreign-key constraints (data is preserved). The app does not push
-- the master tables (branches/products/tills/categories) to the cloud, so the
-- child FKs can never be satisfied. Run this ONCE if you previously applied a
-- schema version that had FKs. Safe to re-run (IF EXISTS guards).
alter table public.sales           drop constraint if exists sales_branch_id_fkey;
alter table public.sales           drop constraint if exists sales_till_id_fkey;
alter table public.sales           drop constraint if exists sales_shop_id_fkey;
alter table public.returns         drop constraint if exists returns_branch_id_fkey;
alter table public.returns         drop constraint if exists returns_till_id_fkey;
alter table public.returns         drop constraint if exists returns_shop_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_product_id_fkey;
alter table public.stock_movements drop constraint if exists stock_movements_shop_id_fkey;
alter table public.tills           drop constraint if exists tills_branch_id_fkey;
alter table public.tills           drop constraint if exists tills_shop_id_fkey;
alter table public.branches        drop constraint if exists branches_shop_id_fkey;
alter table public.categories      drop constraint if exists categories_shop_id_fkey;
alter table public.products        drop constraint if exists products_category_id_fkey;
alter table public.products        drop constraint if exists products_shop_id_fkey;
alter table public.shifts          drop constraint if exists shifts_till_id_fkey;
alter table public.shifts          drop constraint if exists shifts_shop_id_fkey;
alter table public.error_logs      drop constraint if exists error_logs_shop_id_fkey;
alter table public.feedback        drop constraint if exists feedback_shop_id_fkey;

-- Add `updated_at` (two-way sync watermark) to synced master tables + `active`
-- on products. Idempotent. The app bumps updated_at on every write; Supabase's
-- maintenance trigger (below) keeps it authoritative on inserts/updates too.
alter table public.categories      add column if not exists updated_at timestamptz not null default now();
alter table public.products        add column if not exists updated_at timestamptz not null default now();
alter table public.products        add column if not exists active     integer     not null default 1;
alter table public.products        add column if not exists default_discount numeric     not null default 0;
alter table public.products        add column if not exists image_path text;
alter table public.stock_movements add column if not exists updated_at timestamptz not null default now();
alter table public.shops           add column if not exists updated_at timestamptz not null default now();
alter table public.shops           add column if not exists currency    text        not null default 'Rs';
alter table public.shops           add column if not exists pairing_code text;
alter table public.shops           add column if not exists pairing_code_expires_at timestamptz;

-- Indexes that depend on columns added above (safe to re-run).
create index if not exists idx_shops_pairing on public.shops (pairing_code);

-- Maintain `updated_at` server-side so it is the authoritative clock for
-- last-write-wins conflict resolution, regardless of client clock skew.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_categories_updated_at  on public.categories;
drop trigger if exists trg_products_updated_at    on public.products;
drop trigger if exists trg_stock_updated_at       on public.stock_movements;
drop trigger if exists trg_shops_updated_at       on public.shops;

create trigger trg_categories_updated_at  before update on public.categories
  for each row execute function public.touch_updated_at();
create trigger trg_products_updated_at    before update on public.products
  for each row execute function public.touch_updated_at();
create trigger trg_stock_updated_at       before update on public.stock_movements
  for each row execute function public.touch_updated_at();
create trigger trg_shops_updated_at       before update on public.shops
  for each row execute function public.touch_updated_at();

-- ============================ INDEXES ======================================
create index if not exists idx_branches_shop   on public.branches(shop_id);
create index if not exists idx_tills_shop      on public.tills(shop_id);
create index if not exists idx_categories_shop on public.categories(shop_id);
create index if not exists idx_products_shop   on public.products(shop_id);
create index if not exists idx_products_shop_upd on public.products(shop_id, updated_at);
create index if not exists idx_categories_shop_upd on public.categories(shop_id, updated_at);
create index if not exists idx_stock_shop      on public.stock_movements(shop_id);
create index if not exists idx_stock_shop_upd  on public.stock_movements(shop_id, updated_at);
create index if not exists idx_stock_product   on public.stock_movements(product_id);
create index if not exists idx_sales_shop      on public.sales(shop_id);
create index if not exists idx_sales_created   on public.sales(created_at);
create index if not exists idx_sales_synced    on public.sales(synced);
create index if not exists idx_returns_shop    on public.returns(shop_id);
create index if not exists idx_returns_sale    on public.returns(sale_id);
create index if not exists idx_shifts_shop     on public.shifts(shop_id);
create index if not exists idx_errorlogs_shop  on public.error_logs(shop_id);
create index if not exists idx_feedback_shop   on public.feedback(shop_id);

-- ============================ ROW LEVEL SECURITY ==========================
alter table public.shops          enable row level security;
alter table public.branches       enable row level security;
alter table public.tills          enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales          enable row level security;
alter table public.returns        enable row level security;
alter table public.shifts         enable row level security;
alter table public.error_logs     enable row level security;
alter table public.feedback       enable row level security;

-- Permissive policies for the anon key. The app always includes `shop_id` in
-- every insert/select, so data is separated at the query layer.
-- SECURITY TRADE-OFF: anyone with the anon key (shipped in the app) can read /
-- write any shop's rows. For stronger isolation use a backend proxy with the
-- service_role key that validates shop_id, or require authenticated users.
drop policy if exists "anon_all_shops"         on public.shops;
drop policy if exists "anon_all_branches"      on public.branches;
drop policy if exists "anon_all_tills"         on public.tills;
drop policy if exists "anon_all_categories"    on public.categories;
drop policy if exists "anon_all_products"      on public.products;
drop policy if exists "anon_all_stock"         on public.stock_movements;
drop policy if exists "anon_all_sales"         on public.sales;
drop policy if exists "anon_all_returns"       on public.returns;
drop policy if exists "anon_all_shifts"        on public.shifts;
drop policy if exists "anon_all_error_logs"    on public.error_logs;
drop policy if exists "anon_all_feedback"      on public.feedback;

create policy "anon_all_shops"         on public.shops         for all using (true) with check (true);
create policy "anon_all_branches"      on public.branches      for all using (true) with check (true);
create policy "anon_all_tills"         on public.tills         for all using (true) with check (true);
create policy "anon_all_categories"    on public.categories    for all using (true) with check (true);
create policy "anon_all_products"      on public.products      for all using (true) with check (true);
create policy "anon_all_stock"         on public.stock_movements for all using (true) with check (true);
create policy "anon_all_sales"         on public.sales         for all using (true) with check (true);
create policy "anon_all_returns"       on public.returns       for all using (true) with check (true);
create policy "anon_all_shifts"        on public.shifts        for all using (true) with check (true);
create policy "anon_all_error_logs"    on public.error_logs    for all using (true) with check (true);
create policy "anon_all_feedback"      on public.feedback      for all using (true) with check (true);
