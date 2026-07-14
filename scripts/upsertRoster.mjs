// Loads scripts/roster.json (copy from roster.example.json and fill in real names)
// and upserts those users into Supabase.
//
// Usage: node scripts/upsertRoster.mjs

import fs from 'node:fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
  process.exit(1);
}

const rosterPath = fs.existsSync('scripts/roster.json') ? 'scripts/roster.json' : null;
if (!rosterPath) {
  console.error('Copy scripts/roster.example.json to scripts/roster.json and fill in real names first.');
  process.exit(1);
}

const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
const supabase = createClient(url, serviceKey);

async function main() {
  const { data, error } = await supabase
    .from('users')
    .upsert(roster.users, { onConflict: 'name' })
    .select();
  if (error) throw error;
  console.log(`Upserted ${data.length} users:`);
  data.forEach((u) => console.log(`  - ${u.name} (${u.role})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
