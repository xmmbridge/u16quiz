// Supabase/PostgREST caps unfiltered selects at 1000 rows by default (db.max_rows).
// Any query that can outgrow that as the class accumulates data over time — attempts,
// answers, accepted_answers, etc. across the whole roster/quiz history — needs to page
// through results instead of trusting a single .select() to return everything.
//
// `build` is called fresh for each page since a query builder is spent after it's awaited:
//   fetchAll((q) => q.from('answers').select('*'))
const PAGE_SIZE = 1000;

export async function fetchAll(build) {
  let all = [];
  let from = 0;
  for (;;) {
    // Without an explicit order, Postgres doesn't guarantee the same row order
    // across separate requests (a plain seq scan can shuffle between calls once
    // a table's big enough to go parallel) — so paging with .range() alone can
    // silently return some rows twice and drop others between pages. Every table
    // here has a uuid `id` primary key; ordering by it (appended after whatever
    // order the caller already set, since .order() composes) makes every page
    // boundary stable regardless of what the call site sorts by.
    const { data, error } = await build().order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    all = all.concat(data);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

// A `.in('col', ids)` filter puts every id straight into the request URL. Once a class's
// history grows to hundreds/thousands of ids (e.g. one student's answers across a whole
// year of quizzes), that URL blows past what Supabase's edge proxy accepts and the
// request fails outright with a 400 — no row ever comes back, unlike the row-count cap
// fetchAll() handles. Split the id list into chunks and merge the results instead.
//
//   fetchInChunks(questionIds, (chunk) =>
//     supabase.from('accepted_answers').select('quiz_question_id, bid').in('quiz_question_id', chunk)
//   )
const CHUNK_SIZE = 150;

export async function fetchInChunks(ids, build) {
  if (ids.length === 0) {
    return fetchAll(() => build(['00000000-0000-0000-0000-000000000000']));
  }
  let all = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { data, error } = await fetchAll(() => build(chunk));
    if (error) return { data: null, error };
    all = all.concat(data);
  }
  return { data: all, error: null };
}
