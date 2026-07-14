// One-time (re-runnable) script:
//  1. Upserts question_templates from scripts/templates.json (run parseTemplates.mjs first)
//  2. Creates any missing quizzes from today through --end-date (default: Sept 30 of this year),
//     one per calendar day, 10 questions each, never touching quizzes that already exist.
//
// Usage:
//   node scripts/generateQuizzes.mjs [--end-date=2026-09-30] [--questions-per-quiz=10]

import fs from 'node:fs';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { dealHand, dealVulnerability } from '../src/lib/dealing.js';
import { upsertTemplatesFromFile } from './lib/upsertTemplates.mjs';

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const questionsPerQuiz = Number(args['questions-per-quiz'] || 10);
const endDateStr = args['end-date'] || `${new Date().getFullYear()}-09-30`;

const supabase = createClient(url, serviceKey);

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function dateRange(startDate, endDateStr) {
  const dates = [];
  const end = new Date(endDateStr + 'T00:00:00');
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  while (cur <= end) {
    dates.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A rotating pool: hands out `count` templates at a time, using every template once
// before any repeats, reshuffling as it wraps around.
function makePool(templates) {
  let queue = shuffle(templates);
  return {
    take(count) {
      while (queue.length < count) {
        queue = queue.concat(shuffle(templates));
      }
      const taken = queue.slice(0, count);
      queue = queue.slice(count);
      return taken;
    },
  };
}

async function upsertTemplates() {
  const templatesPath = 'scripts/templates.json';
  const allTemplates = await upsertTemplatesFromFile(supabase, templatesPath);
  console.log(`Upserted templates. ${allTemplates.length} total in database.`);
  return allTemplates;
}

async function main() {
  const templates = await upsertTemplates();
  if (templates.length === 0) {
    console.error('No question templates in the database — nothing to build quizzes from.');
    process.exit(1);
  }

  const { data: existingQuizzes, error: qErr } = await supabase.from('quizzes').select('quiz_number, quiz_date').order('quiz_number');
  if (qErr) throw qErr;

  const existingNumbers = new Set(existingQuizzes.map((q) => q.quiz_number));
  const existingDates = new Set(existingQuizzes.map((q) => q.quiz_date));
  let nextQuizNumber = existingQuizzes.length ? Math.max(...existingQuizzes.map((q) => q.quiz_number)) + 1 : 1;

  const today = new Date();
  const allDates = dateRange(today, endDateStr).filter((d) => !existingDates.has(d));

  if (allDates.length === 0) {
    console.log('No new quiz dates to generate (they already exist, or --end-date is in the past).');
    return;
  }

  const pool = makePool(templates);

  for (const date of allDates) {
    const quizNumber = nextQuizNumber++;
    const { data: quiz, error: insErr } = await supabase
      .from('quizzes')
      .insert({ quiz_number: quizNumber, quiz_date: date })
      .select()
      .single();
    if (insErr) throw insErr;

    const picks = pool.take(questionsPerQuiz);
    const questionRows = picks.map((tpl, idx) => ({
      quiz_id: quiz.id,
      question_template_id: tpl.id,
      position_in_quiz: idx + 1,
      dealt_hand: dealHand(tpl.min_hcp, tpl.max_hcp, tpl.shapes),
      vulnerability: dealVulnerability(),
    }));

    const { error: qqErr } = await supabase.from('quiz_questions').insert(questionRows);
    if (qqErr) throw qqErr;

    console.log(`Quiz ${quizNumber} (${date}): ${questionRows.length} questions created.`);
  }

  console.log(`Done. Generated ${allDates.length} quizzes, ${allDates.length * questionsPerQuiz} questions total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
