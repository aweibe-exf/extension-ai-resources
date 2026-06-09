/**
 * notify-admin — fires when a new resource is submitted (status = pending)
 * Deploy: supabase functions deploy notify-admin
 * Trigger: Database webhook on resources INSERT where status = pending
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY')!;
const MAILGUN_DOMAIN  = Deno.env.get('MAILGUN_DOMAIN')!;
const ADMIN_EMAIL     = Deno.env.get('ADMIN_EMAIL')!;
const SITE_URL        = Deno.env.get('SITE_URL') ?? 'https://aweibe-exf.github.io/extension-ai-resources';

serve(async (req) => {
  try {
    const payload = await req.json();
    const record  = payload.record;

    if (!record || record.status !== 'pending') {
      return new Response('skipped', { status: 200 });
    }

    const subject = `New AI asset submission: "${record.title}"`;
    const html = `
      <h2>New Resource Pending Review</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 12px;font-weight:600;color:#64748b">Title</td>
            <td style="padding:6px 12px">${record.title}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#64748b">Category</td>
            <td style="padding:6px 12px">${record.category ?? '—'} / ${record.subcategory ?? '—'}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#64748b">Institution</td>
            <td style="padding:6px 12px">${record.institution ?? '—'}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#64748b">Submitted by</td>
            <td style="padding:6px 12px">${record.contact_person ?? '—'}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#64748b">Link</td>
            <td style="padding:6px 12px">${record.link ? `<a href="${record.link}">${record.link}</a>` : '—'}</td></tr>
      </table>
      <br>
      <a href="${SITE_URL}/admin.html" style="display:inline-block;padding:10px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-family:sans-serif;font-weight:600">
        Review in Admin Panel →
      </a>
      <p style="font-family:sans-serif;font-size:12px;color:#94a3b8;margin-top:24px">
        Cooperative Extension AI Assets
      </p>
    `;

    const form = new FormData();
    form.append('from',    `Extension Foundation <noreply@${MAILGUN_DOMAIN}>`);
    form.append('to',      ADMIN_EMAIL);
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
