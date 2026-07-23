import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: shop, error } = await supabaseAdmin
      .from('shops')
      .select('id, name, currency, user_id, auth_password, pairing_code_expires_at')
      .eq('pairing_code', code)
      .single();

    if (error || !shop) {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (shop.pairing_code_expires_at && new Date(shop.pairing_code_expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Code expired' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!shop.user_id || !shop.auth_password) {
      return new Response(JSON.stringify({ error: 'Shop not configured on desktop app' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      email: `shop-${shop.id}@internal.pos`,
      password: shop.auth_password,
      shop: {
        id: shop.id,
        name: shop.name,
        currency: shop.currency,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
