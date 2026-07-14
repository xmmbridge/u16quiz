# Bridge Bidding Quiz

A daily bidding quiz for a small bridge class: 6 students + 1 teacher, name-only login,
20 questions a day pulled from a bank of auction templates, teacher-set answer keys,
and a student challenge/regrade workflow.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is plenty for this scale).
2. Once it's created, open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it.
3. Go to **Project Settings → API**. You'll need three values:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (secret — only used locally for the generation scripts, never shipped to the browser)

> **Security note:** this app has no real authentication (per your requirements — just picking a name from a list). RLS is disabled on every table so the anon key can read/write everything. That's a reasonable trade-off for 7 trusted users, but don't reuse this Supabase project for anything sensitive, and don't share the project outside your class.

## 2. Local setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with the three values from step 1.

## 3. Add your roster

```bash
cp scripts/roster.example.json scripts/roster.json
```

Edit `scripts/roster.json` with your real teacher + 6 student names, then:

```bash
node scripts/upsertRoster.mjs
```

## 4. Import the question bank and generate the quiz sequence

```bash
node scripts/parseTemplates.mjs /path/to/SG_Standard scripts/templates.json
node scripts/generateQuizzes.mjs
```

This:
- Parses every `AuctionModel` XML file in the folder you point it at
- Upserts them into `question_templates` (safe to re-run after editing an XML file — it matches on file+template+testable position, so existing quizzes that already used a template keep their originally-dealt hands even if you later tweak that template's HCP/shape ranges)
- Creates one quiz per calendar day from **today** through **Sept 30** (pass `--end-date=YYYY-MM-DD` to change), 20 questions each, with hands dealt fresh right now

Re-running `generateQuizzes.mjs` later (e.g. to extend past Sept 30) only adds quizzes for dates that don't exist yet — it never touches ones already generated.

## 5. Run it locally to check everything works

```bash
npm run dev
```

## 6. Push to GitHub

```bash
git init
git add .
git commit -m "Bridge bidding quiz app"
```

Create a new empty repo on [github.com/new](https://github.com/new) (don't initialize it with a README), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

## 7. Connect Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Connect your GitHub account, pick the repo you just pushed.
3. Build settings should auto-detect from `netlify.toml` (`npm run build`, publish `dist`) — leave them as-is.
4. Before deploying, go to **Site configuration → Environment variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   
   (Do **not** add `SUPABASE_SERVICE_ROLE_KEY` here — it's only for your local machine.)
5. Deploy. From now on, every push to `main` auto-deploys.

## Ongoing use

- **Editing the question bank**: edit files in `question-bank/*.xml` (with the visual XML editor tool, or directly on GitHub), then run:
  ```bash
  node scripts/updateQuestionBank.mjs
  ```
  (or trigger the **Update question bank** GitHub Action if you're doing everything from the GitHub website — see `SETUP_GUIDE.md`). This re-imports templates without touching any already-generated quizzes.
- **Extending past Sept 30**: just re-run `node scripts/generateQuizzes.mjs --end-date=2026-12-31` whenever you're ready (or the "Set up roster and generate quizzes" Action with an end date input).
- **Adding/removing students**: edit `scripts/roster.json` and re-run `node scripts/upsertRoster.mjs` (or the Action).

If you'd rather do all of this from the GitHub website with no local installs at all (including the initial setup), see **`SETUP_GUIDE.md`** — it includes two GitHub Actions workflows (`.github/workflows/`) that run these scripts in the cloud.

## Project structure

```
supabase/schema.sql         — run once in the Supabase SQL editor
question-bank/*.xml         — the source AuctionModel templates (editable)
scripts/parseTemplates.mjs  — XML bank → templates.json
scripts/generateQuizzes.mjs — templates.json → quizzes + dealt hands in Supabase
scripts/updateQuestionBank.mjs — re-parse + re-upsert templates only, no quiz generation
scripts/upsertRoster.mjs    — roster.json → users table
.github/workflows/          — cloud versions of the above, triggered from GitHub's Actions tab
src/lib/bidding.js          — seat rotation, legal bid calculation, bid formatting
src/lib/dealing.js          — hand-dealing (rejection sampling on HCP + shape)
src/pages/                  — Login, StudentQuizList, QuizTaking, Results, MyChallenges,
                               TeacherDashboard, ChallengeQueue
```
