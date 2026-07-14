# Getting Your Bridge Quiz Online — Complete Beginner's Guide

Good news: you can do this entire thing using only websites — no programs to install, no terminal/command line. Follow **Path A** below top to bottom.

(If you ever become comfortable with a terminal later, Path B at the bottom is the "normal developer" way — but you don't need it.)

If you get stuck or see an error at any point, copy the exact error text back to me.

---

# PATH A — Websites only, no installs

## Phase 1 — Supabase (the database)

### 1a. Create your account and project
1. Go to **https://supabase.com** → **Start your project** → sign up (easiest: "Continue with GitHub" if you have a GitHub account already, otherwise use email)
2. Click **New project**
3. Fill in:
   - **Name**: `bridge-quiz`
   - **Database password**: click "Generate a password", then copy it into a notes app somewhere safe (you probably won't need it again for this project, but keep it)
   - **Region**: pick whichever is closest to you
4. Click **Create new project**. Wait 1-2 minutes.

### 1b. Run the database setup script
1. In the left sidebar, click **SQL Editor** (icon looks like `</>`)
2. Click **New query**
3. Open the file `supabase/schema.sql` from the zip I gave you, in any text editor (Notepad, TextEdit) — just to view it
4. Copy everything in that file, paste it into the Supabase SQL editor
5. Click **Run** (green button). You should see "Success. No rows returned."

### 1c. Get your three keys — copy each into a notes app
1. Click the gear icon **Project Settings** → **API**
2. Copy these three somewhere safe (a Notes app, not shared anywhere public):
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long string)
   - **service_role** key (long string, marked secret — never post this publicly)

---

## Phase 2 — Get the project onto GitHub

### 2a. Create a GitHub account
Go to **https://github.com** and sign up, if you don't have an account.

### 2b. Unzip the project
Find `bridge-quiz.zip` (probably in Downloads). Right-click → "Extract All" (Windows) or double-click (Mac). You get a `bridge-quiz` folder.

### 2c. Make sure hidden files are visible — important!
The project includes a folder called `.github` (starts with a dot), which your computer hides by default. You need to see it before the next step, or it'll silently get left out.
- **Windows**: open the `bridge-quiz` folder in File Explorer → click the **View** tab at the top → check **Hidden items**
- **Mac**: open the `bridge-quiz` folder in Finder → press **Cmd + Shift + .** (period)

Confirm you can now see a `.github` folder and a `.gitignore` file inside `bridge-quiz`. If not, repeat the step above.

### 2d. Add your roster (names) before uploading
1. Inside `bridge-quiz/scripts/`, find `roster.example.json`
2. Make a copy, rename it to `roster.json` (in the same `scripts` folder)
3. Open `roster.json` in a text editor, replace the placeholder names with real ones, keeping the same format:
   ```json
   {
     "users": [
       { "name": "Mrs. Tan", "role": "teacher" },
       { "name": "Aiden", "role": "student" },
       { "name": "Bella", "role": "student" }
     ]
   }
   ```
4. Save it.

### 2e. Create the repository and upload everything
1. On GitHub, click the **+** icon (top right) → **New repository**
2. Name it `bridge-quiz`, leave everything else default, **don't** check "Add a README"
3. Click **Create repository**
4. On the next page, look for a link that says **uploading an existing file** — click it
   (If you don't see it: go to your new repo's page → click **Add file** → **Upload files**)
5. Open the `bridge-quiz` folder on your computer, select **everything inside it** (Ctrl+A on Windows, Cmd+A on Mac) — this should include `.github`, `.gitignore`, `src`, `scripts`, `supabase`, `package.json`, etc.
6. Drag all of that into the browser's upload area
7. Wait for the upload list to populate (may take a minute), then scroll down and click **Commit changes**
8. Once it's done, check the repo's file list on GitHub — confirm you can see a `.github` folder listed. If you don't, the hidden-files step didn't work — go back to 2c and re-upload.

⚠️ Do **not** create or upload a file called `.env` anywhere on GitHub — your secret keys go somewhere safer in the next phase.

---

## Phase 3 — Populate the database (roster + all the quizzes)

### 3a. Add your secret keys to GitHub
1. In your `bridge-quiz` repo on GitHub, click **Settings** (top menu of the repo, not your account settings)
2. In the left sidebar, click **Secrets and variables** → **Actions**
3. Click **New repository secret**, add:
   - Name: `VITE_SUPABASE_URL` → Value: your Project URL from step 1c
   - Click **Add secret**
4. Click **New repository secret** again, add:
   - Name: `SUPABASE_SERVICE_ROLE_KEY` → Value: your service_role key from step 1c
   - Click **Add secret**

### 3b. Run the setup
1. Click the **Actions** tab (top menu of the repo)
2. You should see a workflow called **Set up roster and generate quizzes** in the left sidebar — click it
3. Click **Run workflow** (button on the right) → **Run workflow** again to confirm
4. Wait ~30-60 seconds, then refresh the page. You'll see a run appear with either:
   - a green checkmark = it worked — your database now has your roster and every quiz through September
   - a red X = something went wrong — click into it, click the step that failed, copy the red error text and send it to me

---

## Phase 4 — Put it online with Netlify

1. Go to **https://app.netlify.com**, sign up (easiest: "Sign up with GitHub")
2. Click **Add new site** → **Import an existing project**
3. Choose **GitHub**, authorize if asked, pick your `bridge-quiz` repository
4. Build settings should auto-fill (`npm run build`, publish directory `dist`) — leave as-is
5. Before deploying, add environment variables (there's a section for this on the same page, or under **Site configuration → Environment variables** afterward):
   - `VITE_SUPABASE_URL` → your Project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon public key
   
   (Do **not** add the service_role key here — that one stays only in GitHub Secrets.)
6. Click **Deploy**. Wait 1-2 minutes.
7. You'll get a web address like `https://something-random-123.netlify.app` — that's your live quiz site! Share it with your students. You can rename it under **Site configuration → Change site name**.

From now on: any time you edit a file on GitHub, Netlify automatically re-deploys the site.

---

## Ongoing tasks — all doable from the GitHub website

- **Extending past Sept 30**: go to Actions tab → "Set up roster and generate quizzes" → Run workflow → type a new end date (e.g. `2026-12-31`) in the box → Run workflow
- **Adding/removing a student**: edit `scripts/roster.json` directly on GitHub (click the file → pencil/edit icon → make your change → Commit), then re-run the Action (Phase 3b)
- **Editing the question bank**: the folder `question-bank/` in your repo holds all 47 XML files. To update one:
  1. On GitHub, go to `question-bank/`, click the file you want to change, click the pencil (edit) icon, make your edit, commit
     — or use the visual XML editor tool to make bigger changes locally, then upload the replacement file via "Add file → Upload files" in that same folder
  2. Go to the **Actions** tab → **Update question bank** → **Run workflow**
  3. Once it's green, future quizzes generated from that template will use your updated ranges/shapes — quizzes already generated are untouched

## You're done! What to bookmark:
- **Your live quiz site** — the netlify.app address, share with students
- **Supabase dashboard** — supabase.com → your project, for checking data
- **GitHub repo** — for roster changes and re-running quiz generation

---

# PATH B — If you ever want the terminal-based way instead

See the commands in the project's `README.md`. This is the standard developer workflow (installing Node.js and Git, running commands locally) — only worth it if Path A feels too limiting later on.
