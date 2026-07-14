import fs from 'node:fs';

/**
 * Upserts rows from a parsed templates.json file into question_templates.
 * Matches on (source_file, template_name, bids, tested_position) so re-running this
 * after editing an XML file updates existing rows in place (same id) rather
 * than duplicating them — quizzes that already used a template keep their
 * originally-dealt hands even if the template's constraints change later.
 *
 * template_name alone isn't reliably unique per file (the question-bank XML
 * reuses names like "HandN_copy" for distinct variants), so bids is part of
 * the key. Exact duplicate rows (same key) are also possible from copy-paste
 * mistakes in the source XML — those are skipped rather than sent to Postgres,
 * since an upsert batch containing the same conflict key twice errors out.
 */
export async function upsertTemplatesFromFile(supabase, templatesPath) {
  if (!fs.existsSync(templatesPath)) {
    throw new Error(`${templatesPath} not found — run parseTemplates.mjs first.`);
  }
  const rawRows = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));

  const seen = new Set();
  const rows = [];
  for (const row of rawRows) {
    const key = `${row.source_file}|${row.template_name}|${JSON.stringify(row.bids)}|${row.tested_position}`;
    if (seen.has(key)) {
      console.warn(`Skipping exact duplicate template row: ${key}`);
      continue;
    }
    seen.add(key);
    rows.push(row);
  }

  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('question_templates')
      .upsert(batch, { onConflict: 'source_file,template_name,bids,tested_position' });
    if (error) throw error;
  }

  const { data: allTemplates, error } = await supabase.from('question_templates').select('*');
  if (error) throw error;
  return allTemplates;
}
