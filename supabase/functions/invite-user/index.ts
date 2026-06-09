/**
 * invite-user — creates a new user account and sends a Mailgun invitation
 * Deploy: supabase functions deploy invite-user
 * Called by: admin.html invite modal (requires admin JWT)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAILGUN_API_KEY          = Deno.env.get('MAILGUN_API_KEY')!;
const MAILGUN_DOMAIN           = Deno.env.get('MAILGUN_DOMAIN')!;
const SITE_URL                 = Deno.env.get('SITE_URL') ?? 'https://aweibe-exf.github.io/extension-ai-resources';

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Authenticate caller ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Verify caller is admin ───────────────────────────────────────────
    const { data: callerProfile } = await adminClient
      .from('profiles').select('role, full_name').eq('id', caller.id).single();
    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse request ────────────────────────────────────────────────────
    const { email, role = 'user', full_name = '' } = await req.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['user', 'admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'role must be user or admin' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Generate invite link (so we can send via Mailgun) ────────────────
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${SITE_URL}/auth.html` },
    });
    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const invitedUserId = linkData.user.id;
    const inviteLink    = linkData.properties.action_link;

    // ── Upsert profile with desired role ─────────────────────────────────
    await adminClient.from('profiles').upsert({
      id:        invitedUserId,
      email,
      full_name: full_name.trim() || null,
      role,
    }, { onConflict: 'id' });

    // ── Send invite email via Mailgun ────────────────────────────────────
    const inviterName = callerProfile?.full_name || caller.email || 'An admin';
    const roleLabel   = role === 'admin' ? 'Admin' : 'Contributor';

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1e293b">You're invited to Cooperative Extension AI Assets</h2>
        <p style="color:#475569;line-height:1.6">
          ${inviterName} has invited you to join the Cooperative Extension AI Assets directory
          as a <strong>${roleLabel}</strong>. Click the button below to set your password
          and get started.
        </p>
        <a href="${inviteLink}"
           style="display:inline-block;margin:20px 0;padding:12px 24px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
          Accept invitation →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
          This link expires in 24 hours. If you didn't expect this invitation, you can ignore it.
        </p>
        <p style="color:#94a3b8;font-size:12px">
          Cooperative Extension AI Assets · <a href="${SITE_URL}" style="color:#94a3b8">${SITE_URL}</a>
        </p>
      </div>
    `;

    const form = new FormData();
    form.append('from',    `Cooperative Extension AI Assets <noreply@${MAILGUN_DOMAIN}>`);
    form.append('to',      email);
    form.append('subject', `You've been invited to Cooperative Extension AI Assets`);
    form.append('html',    html);

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });

    if (!mgRes.ok) {
      const mgErr = await mgRes.text();
      console.error('Mailgun error:', mgErr);
      // Don't fail the whole request — user was created, email just didn't send
      return new Response(JSON.stringify({
        success: true,
        warning: 'User created but email failed to send: ' + mgErr,
        userId: invitedUserId,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, userId: invitedUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
