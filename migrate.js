/**
 * migrate.js — One-time data migration from Google Sheets → Supabase
 *
 * Usage:
 *   node migrate.js
 *
 * Requirements:
 *   npm install @supabase/supabase-js papaparse node-fetch
 */

import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import fetch from 'node-fetch';

const SUPABASE_URL    = process.env.SUPABASE_URL    || 'https://afncxrdjgktpphojkzcj.supabase.co';
// Set SUPABASE_SECRET in your environment before running:
//   export SUPABASE_SECRET=sb_secret_...
//   node migrate.js
const SUPABASE_SECRET = process.env.SUPABASE_SECRET;
if (!SUPABASE_SECRET) {
  console.error('ERROR: Set the SUPABASE_SECRET env var to your Supabase service role key.');
  process.exit(1);
}
const SHEET_CSV_URL    = 'https://docs.google.com/spreadsheets/d/1i8PW58wAOYaWn9YU_wH9fPrfACTtmWt8vMtvu0G3Fs0/gviz/tq?tqx=out:csv';

const sb = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false }
});

// ── Helpers ──────────────────────────────────────────────────
function splitField(val) {
  if (!val || val.trim() === '' || val.trim() === 'NA') return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

function nullIfEmpty(val) {
  if (!val || val.trim() === '' || val.trim() === 'NA') return null;
  return val.trim();
}

function parseTimestamp(val, fallback) {
  if (val && val.trim()) {
    const d = new Date(val.trim());
    if (!isNaN(d)) return d.toISOString();
  }
  if (fallback && fallback.trim()) {
    const d = new Date(fallback.trim());
    if (!isNaN(d)) return d.toISOString();
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('Fetching Google Sheet CSV…');
  const res  = await fetch(SHEET_CSV_URL);
  const text = await res.text();

  const { data, errors } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length) {
    console.warn('Parse warnings:', errors.slice(0, 5));
  }

  console.log(`Parsed ${data.length} rows. Importing…`);

  const records = data
    .filter(row => {
      const title = nullIfEmpty(row['Asset Name/Title']);
      return title && title !== 'NA' && title.length > 1;
    })
    .map(row => ({
      status:           'approved',
      category:         nullIfEmpty(row['Category']),
      subcategory:      nullIfEmpty(row['Subcategory']),
      title:            row['Asset Name/Title'].trim(),
      description:      nullIfEmpty(row['Description']),
      programs:         splitField(row['Program/s']),
      knowledge_level:  splitField(row['Knowledge Level']),
      audience:         splitField(row['Audience']),
      contact_person:   nullIfEmpty(row['Contact person for more info']),
      institution:      nullIfEmpty(row['Institution/Unit where asset is housed']),
      link:             nullIfEmpty(row['Link/Resource']),
      service_area:     nullIfEmpty(row['Service Area']),
      notes:            nullIfEmpty(row['Notes']),
      legacy_email:     nullIfEmpty(row['Email Address']),
      legacy_timestamp: parseTimestamp(row['Timestamp'], row['Date added']),
    }));

  console.log(`Inserting ${records.length} valid records…`);

  // Insert in batches of 25
  const BATCH = 25;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await sb.from('resources').insert(batch);
    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  ✓ ${inserted}/${records.length}`);
    }
  }

  console.log(`\nDone. ${inserted} records imported as status=approved.`);
  console.log('\nNext step — promote yourself to admin:');
  console.log('  Run in Supabase SQL Editor:');
  console.log("  update public.profiles set role = 'admin' where email = 'aaronweibe@extension.org';");
}

main().catch(console.error);
