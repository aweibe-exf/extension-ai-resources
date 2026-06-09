/**
 * notify-user — fires when a resource status changes to approved or rejected
 * Deploy: supabase functions deploy notify-user
 * Trigger: Database webhook on resources UPDATE where status changed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAILGUN_API_KEY  = Deno.env.get('MAILGUN_API_KEY')!;
const MAILGUN_DOMAIN   = Deno.env.get('MAILGUN_DOMAIN')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL         = Deno.env.get('SITE_URL') ?? 'https://aweibe-exf.github.io/extension-ai-resources';

serve(async (req) => {
  try {
    const payload  = await req.json();
    const record   = payload.record;
    const old      = payload.old_record;

    // Only act when status actually changes to approved or rejected
    if (!record || !old) return new Response('skipped', { status: 200 });
    if (record.status === old.status) return new Response('no change', { status: 200 });
    if (!['approved', 'rejected'].includes(record.status)) return new Response('skipped', { status: 200 });
    if (!record.submitted_by) return new Response('no submitter', { status: 200 });

    // Look up submitter email
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: profile } = await sb
      .from('profiles')
      .select('email, full_name')
      .eq('id', record.submitted_by)
      .single();

    if (!profile?.email) return new Response('no email found', { status: 200 });

    const approved = record.status === 'approved';
    const name     = profile.full_name ?? profile.email;

    const subject = approved
      ? `Your submission "${record.title}" has been approved`
      : `Your submission "${record.title}" was not approved`;

    const html = approved ? `
      <p style="font-family:sans-serif">Hi ${name},</p>
      <p style="font-family:sans-serif">
        Great news — your resource <strong>${record.title}</strong> has been reviewed and approved.
        It's now live in the Cooperative Extension AI Assets directory.
      </p>
      <a href="${SITE_URL}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-family:sans-serif;font-weight:600">
        View the Directory →
      </a>
      <p style="font-family:sans-serif;font-size:12px;color:#94a3b8;margin-top:24px">
        Cooperative Extension AI Assets · <a href="${SITE_URL}">extension-ai-resources</a>
      </p>
    ` : `
      <p style="font-family:sans-serif">Hi ${name},</p>
      <p style="font-family:sans-serif">
        Thank you for submitting <strong>${record.title}</strong> to the Cooperative Extension AI Assets directory.
        After review, we were unable to approve this submission at this time.
      </p>
      ${record.rejection_reason ? `
      <p style="font-family:sans-serif"><strong>Reason:</strong> ${record.rejection_reason}</p>
      ` : ''}
      <p style="font-family:sans-serif">
        You can edit and resubmit your resource from your
        <a href="${SITE_URL}/my-submissions.html">submissions page</a>.
        If you have questions, reply to this email.
      </p>
      <p style="font-family:sans-serif;font-size:12px;color:#94a3b8;margin-top:24px">
        Cooperative Extension AI Assets · <a href="${SITE_URL}">extension-ai-resources</a>
      </p>
    `;

    const form = new FormData();
    form.append('from',    `Extension Foundation <noreply@${MAILGUN_DOMAIN}>`);
    form.append('to',      profile.email);
    form.append('subject', subject);
    form.append('html',    html);

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: form,
    });

    if (!mgRes.ok) {
      const err = await mgRes.text();
      console.error('Mailgun error:', err);
      return new Response(`Mailgun error: ${err}`, { status: 500 });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
