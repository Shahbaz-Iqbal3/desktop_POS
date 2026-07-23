import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all shops with low-stock products
    const { data: lowStock, error } = await supabaseAdmin.rpc('get_low_stock_products');
    if (error) throw error;

    if (!lowStock || lowStock.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No low stock items' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by shop_id
    const byShop = new Map<string, typeof lowStock>();
    for (const item of lowStock) {
      if (!byShop.has(item.shop_id)) byShop.set(item.shop_id, []);
      byShop.get(item.shop_id)!.push(item);
    }

    // Configure web-push
    webPush.setVapidDetails(
      'mailto:your-email@example.com',
      Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
      Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    );

    let sent = 0;
    for (const [shopId, items] of byShop) {
      // Get push subscriptions for this shop
      const { data: subs } = await supabaseAdmin
        .from('push_subscriptions')
        .select('subscription')
        .eq('shop_id', shopId);

      if (!subs || subs.length === 0) continue;

      const payload = JSON.stringify({
        title: 'Low Stock Alert',
        body: `${items.length} product(s) below threshold`,
        data: { type: 'low_stock', shop_id: shopId, items: items.map(i => ({ id: i.id, name: i.name, stock: i.stock, threshold: i.low_stock_threshold })) },
      });

      for (const sub of subs) {
        try {
          await webPush.sendNotification(sub.subscription, payload);
          sent++;
        } catch (e) {
          // If subscription invalid (410), delete it
          if ((e as any).statusCode === 410) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('subscription.endpoint', sub.subscription.endpoint);
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent, shops: byShop.size }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});