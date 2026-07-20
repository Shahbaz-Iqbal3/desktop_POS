// Lifetime Supabase configuration — shared by EVERY shop installation.
//
// This is a backend (main-process) config, NOT a per-shop setting. All shops
// sync to the SAME Supabase project; each shop's rows are separated by the
// auto-generated `shop_id` column (see db.ts initDatabase).
//
// Credential resolution order:
//   1. process.env.SUPABASE_URL / SUPABASE_ANON_KEY  (set at launch, or via .env in dev)
//   2. The FALLBACK constants below (hardcode here if you don't use env vars)
//
// The anon key is PUBLIC by design (it ships in every desktop app). Row-level
// data isolation between shops is enforced by `shop_id` in every query + the
// RLS policies in scripts/supabase-schema.sql. Do NOT put the service_role key here.

const FALLBACK_SUPABASE_URL = 'https://wmwnlcqhbfcclqzyunhg.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtd25sY3FoYmZjY2xxenl1bmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDM1NTYsImV4cCI6MjA5OTYxOTU1Nn0.XTze6Fx_CajG9KpMcaOo4_tVxMrN0mW54NrR_0T8-QI'

export const SUPABASE_URL = process.env.SUPABASE_URL ?? FALLBACK_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? FALLBACK_SUPABASE_ANON_KEY

export const isSupabaseConfigured = (): boolean =>
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20
