# Bilhuset Sommer — Flådestyring

A fleet-management web app: see all dealership cars at a glance, click into any car
to change its status (painting, body work, service, etc.), add notes, and view a full
history. Data lives in a shared cloud database, so it stays in sync across your phone,
the workshop computer, and the office — and updates live, in real time.

**Stack:** React + Vite (frontend) · Supabase (shared database) · Netlify (hosting)

---

## What you'll end up with

- A private URL (e.g. `bilhuset-sommer.netlify.app`) you can open on any device
- One shared fleet that everyone sees the same version of
- Changes appear on other devices within a second or two, automatically

Total setup time: about 20–30 minutes. No prior deployment experience needed —
just follow the steps in order.

---

## Step 1 — Create the database (Supabase)

1. Go to **https://supabase.com** and sign up (free tier is plenty).
2. Click **New project**. Give it a name (e.g. `bilhuset-sommer`), choose a region
   close to Denmark (Frankfurt / EU Central), and set a database password (save it somewhere).
3. Wait ~2 minutes for it to provision.
4. In the left sidebar go to **SQL Editor → New query**. Paste the entire contents of
   `supabase-schema.sql` (included in this project) and click **Run**. This creates the
   `cars` table and turns on live sync.
5. In the left sidebar go to **Project Settings → API**. Copy these two values — you'll
   need them in Step 3:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

---

## Step 2 — Put the code on GitHub

Netlify deploys from a Git repository. If you don't have a GitHub account, create one
at github.com (free).

1. Create a new **empty** repository on GitHub (e.g. `bilhuset-sommer-fleet`), private.
2. Upload this project folder to it. Easiest way without the command line: on the new
   repo page click **uploading an existing file** and drag in all the files from this
   folder (everything except `node_modules`, which isn't included anyway).

   If you prefer the command line:
   ```bash
   git init
   git add .
   git commit -m "Initial fleet app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/bilhuset-sommer-fleet.git
   git push -u origin main
   ```

---

## Step 3 — Deploy on Netlify

1. Go to **https://netlify.com** and sign up (you can log in with your GitHub account).
2. Click **Add new site → Import an existing project → GitHub**, and pick your repo.
3. Netlify auto-detects the settings from `netlify.toml`, so the build command (`npm run build`)
   and publish directory (`dist`) should already be filled in. Leave them.
4. Before the first deploy, click **Add environment variables** (or do it afterwards under
   **Site configuration → Environment variables**) and add these two, using the values you
   copied from Supabase in Step 1:

   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

5. Click **Deploy**. After a minute or two you'll get your live URL.
   > If you added the environment variables *after* the first deploy, trigger one more
   > deploy (**Deploys → Trigger deploy → Deploy site**) so they take effect.

That's it — open the URL on any device and you're running.

---

## Using it day to day

- **Add a car:** click "Tilføj bil", fill in the details, save.
- **Change status:** click a car → "Skift status" → pick the new status (e.g. Lakering)
  → optionally add a note → "Bekræft ændring". The change is logged with today's date.
- **Notes:** edit the notes field; it saves when you click out of it.
- **Search / filter:** use the search box and the status chips at the top.

Everything syncs automatically. No save button for the whole app — each action writes
straight to the shared database.

---

## Keeping it updated

Because Netlify is connected to GitHub, any change you push to the repo redeploys the
site automatically. If you want me to add features later (photo uploads, cost tracking,
staff logins, a "total fleet value" figure), I can update the code and you just push it.

---

## A note on access & security

The current setup uses Supabase's anon key with an open policy, which is fine for an
internal tool behind a URL you don't share publicly. It does mean anyone who has both
the URL **and** would need the embedded key could read/write data. For a small internal
fleet tool this is a common, pragmatic choice.

If you'd rather lock it down with proper staff logins (email + password, so only your
team can access it), that's a worthwhile upgrade — tell me and I'll wire up Supabase Auth.

---

## Local development (optional)

If you ever want to run it on your own machine to test changes:

```bash
npm install
# create a file named .env.local with:
#   VITE_SUPABASE_URL=your-url
#   VITE_SUPABASE_ANON_KEY=your-key
npm run dev
```

Then open the address it prints (usually http://localhost:5173).
