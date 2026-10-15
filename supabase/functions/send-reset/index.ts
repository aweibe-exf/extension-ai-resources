/**
 * send-reset — generates a password-recovery link and sends it via Mailgun
 * Deploy: supabase functions deploy send-reset --no-verify-jwt
 * Called by: auth.html "Forgot password" form (no session) and admin.html "Send reset"
 *
 * Always responds { success: true } whether or not the email belongs to a user,
 * so the endpoint can't be used to discover which addresses have accounts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAILGUN_API_KEY           = Deno.env.get('MAILGUN_API_KEY')!;
const MAILGUN_DOMAIN            = Deno.env.get('MAILGUN_DOMAIN')!;
const SITE_URL                  = Deno.env.get('SITE_URL') ?? 'https://ai-resources.extension.org';

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return json({ error: 'A valid email is required' }, 400);
    }
    const to = email.trim();

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: to,
      options: { redirectTo: `${SITE_URL}/auth.html` },
    });
    // Unknown email: pretend success
    if (linkErr || !linkData?.properties?.action_link) return json({ success: true });

    const resetLink = linkData.properties.action_link;
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1e293b">Reset your password</h2>
        <p style="color:#475569;line-height:1.6">
          We received a request to reset the password for your Cooperative Extension AI Assets account.
          Click the button below to choose a new password.
        </p>
        <a href="${resetLink}"
           style="display:inline-block;margin:20px 0;padding:12px 24px;background:#006837;color:#fff;
                  text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
          Reset password →
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">
          This link expires in 1 hour. If you didn't request a reset, you can ignore this email.
        </p>
        <p style="color:#94a3b8;font-size:12px">
          Cooperative Extension AI Assets · <a href="${SITE_URL}" style="color:#94a3b8">${SITE_URL}</a>
        </p>
      </div>
    `;

    const form = new FormData();
    form.append('from',    `Cooperative Extension AI Assets <noreply@${MAILGUN_DOMAIN}>`);
    form.append('to',      to);
    form.append('subject', 'Reset your Cooperative Extension AI Assets password');
    form.append('html',    html);

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
      body: form,
    });
    if (!mgRes.ok) {
      console.error('Mailgun error:', await mgRes.text());
      return json({ error: 'Email could not be sent. Please try again later.' }, 502);
    }
    return json({ success: true });
  } catch (err) {
    console.error('send-reset error:', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
