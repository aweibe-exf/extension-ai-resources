/**
 * delete-user — removes a user from auth.users (cascades to profiles)
 * Deploy: supabase functions deploy delete-user
 * Called by: admin.html users table (requires admin JWT)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Verify caller is admin ───────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const { data: { user: caller } } = await adminClient.auth.getUser(token);
    if (!caller) return json({ error: 'Invalid token' }, 401);

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role').eq('id', caller.id).single();
    if (callerProfile?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    // ── Parse target user ID ─────────────────────────────────────────────
    const { userId } = await req.json();
    if (!userId) return json({ error: 'userId is required' }, 400);
    if (userId === caller.id) return json({ error: 'You cannot delete your own account' }, 400);

    // ── Delete from auth (profiles row will cascade via FK) ──────────────
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);

    return json({ success: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
