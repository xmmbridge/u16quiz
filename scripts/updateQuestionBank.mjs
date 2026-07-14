// Re-imports the XML question bank (question-bank/*.xml) into Supabase's
// question_templates table, without generating or touching any quizzes.
// Use this after editing an XML file (e.g. via the visual template editor).
//
// Usage: node scripts/updateQuestionBank.mjs

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { upsertTemplatesFromFile } from './lib/upsertTemplates.mjs';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
  process.exit(1);
}

execSync('node scripts/parseTemplates.mjs question-bank scripts/templates.json', { stdio: 'inherit' });

const supabase = createClient(url, serviceKey);

upsertTemplatesFromFile(supabase, 'scripts/templates.json')
  .then((all) => console.log(`Done. ${all.length} question templates now in the database.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
