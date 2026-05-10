# Gazelle — Hosting & Deployment Guide

> **Audience:** someone who has never deployed a web app before. Read this top-to-bottom on your first run-through. Skim it as a checklist after that.

---

## 1. The Mental Model (Read This First)

Gazelle is **four separate things** living in **four separate places** on the internet, all talking to each other. The whole job of "hosting" is wiring them up so they can find each other.

```text
┌─────────────────┐         HTTPS           ┌──────────────────┐
│   Frontend      │ ─────────────────────▶ │   Backend         │
│   (React app)   │ ◀───────────────────── │   (FastAPI)       │
│   Vercel        │                         │   Render          │
└─────────────────┘                         └─────────┬────────┘
   what users see                                     │
                                              ┌──────┴──────┐
                                              ▼              ▼
                                     ┌──────────────┐  ┌──────────────┐
                                     │   Supabase   │  │   Qdrant     │
                                     │  (Postgres)  │  │  (Vectors)   │
                                     │ jobs table   │  │ chunks       │
                                     └──────────────┘  └──────────────┘
                                       metadata DB        vector DB

External APIs the backend calls:
  • OpenAI  — embeddings, GPT-4o-mini, TTS
  • Groq    — Whisper (audio transcription)
```

| Piece | What it does | Where it lives | Why we picked it |
|---|---|---|---|
| Frontend | Renders the UI in the user's browser | **Vercel** | Free, Vite-native, automatic HTTPS, PR previews |
| Backend | API: ingest, RAG, STT, TTS endpoints | **Render** | Free Python web service, simplest "git push to deploy" |
| Metadata DB | Stores the `jobs` table (status, titles, transcripts) | **Supabase** | Hosted Postgres, free 500 MB, dashboard for SQL |
| Vector DB | Stores embeddings for retrieval | **Qdrant Cloud** | Free 1 GB / 1M vectors, no infra to run |
| OpenAI / Groq | Pure API services — no hosting needed | their cloud | API keys only |

**Key insight for a first-timer:** none of these "talk" to each other automatically. You connect them by giving each service the **URL and credentials** of the others via **environment variables**. That's 90% of what this guide is about.

---

## 2. Repository Layout (Assumed)

This guide assumes a single GitHub monorepo with this layout:

```text
gazelle/
├── plan/             # planning docs (this file lives here)
├── web-ui/           # original design prototype — DO NOT deploy this
├── app/              # frontend (Vite + React) — deploys to Vercel
│   ├── package.json
│   ├── src/
│   ├── .env          # ⚠ git-ignored — local only
│   └── .env.example  # ✅ committed — template
└── gaz-server/       # backend (FastAPI + Python) — deploys to Render
    ├── requirements.txt
    ├── runtime.txt   # python-3.11.9
    ├── src/
    │   └── main.py   # FastAPI app entry — uvicorn target is `src.main:app`
    ├── .env          # ⚠ git-ignored — local only
    └── .env.example  # ✅ committed — template
```

Both `app/` and `gaz-server/` get deployed from the **same repo**. You'll tell Render and Vercel which subdirectory to use ("root directory" setting). One repo, two deployments.

> **If you're using two separate repos instead:** the guide still works — just point Render at the backend repo and Vercel at the frontend repo. Skip the "root directory" steps.

---

## 3. Prerequisites — Accounts and Tools

### Accounts to create (free tier on all)

Open these in tabs and sign up before starting. Use your work email or GitHub login where possible.

| Service | Sign-up URL | What you'll need from it later |
|---|---|---|
| GitHub | https://github.com | Push your code; connect deployments |
| Supabase | https://supabase.com | Project URL + service role key |
| Qdrant Cloud | https://cloud.qdrant.io | Cluster URL + API key |
| OpenAI | https://platform.openai.com/signup | API key + billing |
| Groq | https://console.groq.com | API key (free) |
| Render | https://render.com | Hosts the backend |
| Vercel | https://vercel.com | Hosts the frontend |

### Tools to install locally (exist ✅)

```bash
# macOS via Homebrew (or use the installers)
brew install git node python@3.11
```

- **git** — version control
- **node** ≥ 18 — for the frontend (Vite)
- **python** 3.11 — for the backend (FastAPI)

Verify:
```bash
git --version && node --version && python3 --version
```

---

## 4. The Order Matters (Don't Skip Around)

Build **bottom-up**: databases → backend → frontend. Each layer needs the layer below it to be already running with credentials handy.

```text
Step  Phase            What you create / configure
────  ────────────    ─────────────────────────────────────
 1    Get keys        OpenAI + Groq API keys
 2    Supabase        Project + jobs table → URL & key
 3    Qdrant          Cluster + collection → URL & key
 4    Backend local   .env, run uvicorn, smoke test
 5    Push to GitHub
 6    Render          Connect repo, set env vars, deploy
 7    Frontend local  .env, run npm dev, smoke test
 8    Vercel          Connect repo, set env vars, deploy
 9    CORS            Backend allows Vercel origin
10    Smoke test      End-to-end on production URLs
```

If something breaks at step N, the problem is almost certainly in step N-1. Don't move forward until each step works.

---

## 5. Step 1 — Get Your API Keys

### OpenAI
1. Go to https://platform.openai.com/api-keys
2. **Add billing** at https://platform.openai.com/account/billing — you cannot use the API without it. Add $5–10 to start.
3. Click **"Create new secret key"** → name it `gazelle-backend` → **copy it now** (you can't see it again).
4. Save somewhere safe (a password manager). It looks like `sk-proj-...`.

### Groq
1. Go to https://console.groq.com/keys
2. **"Create API Key"** → name it `gazelle-backend` → copy it.
3. Free tier: generous enough for the prototype. No billing needed.

You'll paste both into your backend env vars in Step 4.

---

## 6. Step 2 — Set Up Supabase (Metadata Database)

Supabase = managed Postgres + a nice web dashboard. We use it only for the `jobs` table.

### 6.1 Create the project

1. Sign in at https://supabase.com → **"New Project"**.
2. Fill in:
   - **Name:** `gazelle`
   - **Database password:** click **Generate**, then **save it** in your password manager. You won't normally use it, but if you ever connect with `psql` you'll need it.
   - **Region:** pick the one closest to where you'll deploy Render (US East works well for most).
   - **Pricing plan:** Free.
3. Click **Create**. Wait ~2 minutes for provisioning.

### 6.2 Create the `jobs` table

This is the only table V1 needs. Schema defined in `plan/01-transcription/TRD_AI_Tutor_Transcript_Service.md` §10.

1. In the project dashboard, left sidebar → **SQL Editor** → **"New query"**.
2. Paste and run:

```sql
-- Gazelle V1 jobs table
create table jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending','transcribing','validating','embedding','ready','failed')),
  source_type text not null
    check (source_type in ('youtube','upload','transcript')),
  source text,
  title text,
  detected_language text,
  duration_seconds int,
  used_native_captions boolean,
  transcript_json jsonb,
  full_text text,
  validation_result jsonb,
  error_message text,
  -- Structured failure code (set only when status = 'failed').
  -- Frontend switches on this enum instead of pattern-matching error_message.
  failure_reason text
    check (failure_reason in (
      'non_educational',
      'transcription_failed',
      'embedding_failed',
      'invalid_input',
      'unknown'
    )),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at on row changes
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- Index for sidebar query (GET /sessions sorts by created_at desc)
create index jobs_created_at_idx on jobs (created_at desc);
```

3. Click **Run**. You should see "Success. No rows returned."
4. Verify: left sidebar → **Table Editor** → you should see `jobs` listed.

> 📚 Docs: https://supabase.com/docs/guides/database/tables

### 6.3 Grab the credentials

1. Left sidebar → **Project Settings** (gear icon) → **API**.
2. Copy two values into your password manager:
   - **Project URL** — looks like `https://abcdefghij.supabase.co` → this is your `SUPABASE_URL`
   - **service_role** key (under "Project API keys") — long JWT string → this is your `SUPABASE_KEY`

> ⚠ **Never commit the service_role key** or expose it to the frontend. It bypasses Row Level Security. Backend only.

---

## 7. Step 3 — Set Up Qdrant Cloud (Vector Database)

Qdrant stores the embeddings (1536-dim vectors from OpenAI's `text-embedding-3-small`). Single collection: `transcript_chunks` (per `plan/02-kb-embedding/transcript_grounded_chat_trd.md` §8).

### 7.1 Create a cluster

1. Sign in at https://cloud.qdrant.io → **"Create" → "Cluster"**.
2. Choose:
   - **Cloud provider:** AWS or GCP — pick one near your Render region.
   - **Region:** match Render if possible (e.g., `us-east-1`).
   - **Plan:** **Free Tier** (1 GB / ~1M vectors — fine for the prototype).
   - **Cluster name:** `gazelle`.
3. Click **Create**. Wait ~1 minute.

### 7.2 Get the URL + API key

1. From the cluster overview, copy the **Cluster URL** — looks like `https://abc123.us-east-1-0.aws.cloud.qdrant.io:6333` → this is `QDRANT_URL`.
2. Click **API Keys** → **"Create"** → name it `gazelle-backend` → copy the key → this is `QDRANT_API_KEY`.

> ⚠ Make sure the URL includes the port (`:6333`). Some places display it without — add it back if missing.

### 7.3 Create the collection (one-time)

You can do this from your laptop with curl, or let the backend create it on first run (recommended — the backend code will be set up to do this).

If you want to verify manually, run from your terminal (replace placeholders):

```bash
curl -X PUT "$QDRANT_URL/collections/transcript_chunks" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }'
```

| Field | Value | Why |
|---|---|---|
| `size` | `1536` | OpenAI `text-embedding-3-small` dimension |
| `distance` | `Cosine` | Standard for normalized text embeddings |

> 📚 Docs: https://qdrant.tech/documentation/concepts/collections/

The backend filters by `session_id` on every search (per Stage 1 TRD §9), so all chunks for one job are tagged with `session_id` in the payload.

---

## 8. Step 4 — Backend Local Setup

### 8.1 Create the env file

Inside `gaz-server/`, create a file called `.env` (this stays on your laptop, never committed):

```env
# gaz-server/.env
OPENAI_API_KEY=sk-proj-...                      # from Step 1
GROQ_API_KEY=gsk_...                            # from Step 1
SUPABASE_URL=https://abcdefghij.supabase.co     # from Step 6.3
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...            # service_role key from Step 6.3
QDRANT_URL=https://abc123.us-east-1-0.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=...                              # from Step 7.2

# CORS — local dev origin
ALLOWED_ORIGINS=http://localhost:5173
```

Also create `gaz-server/.env.example` with the **same keys but blank values** (this **is** committed so other devs know what's needed):

```env
# gaz-server/.env.example
OPENAI_API_KEY=
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
QDRANT_URL=
QDRANT_API_KEY=
ALLOWED_ORIGINS=http://localhost:5173
```

Add `.env` to `.gitignore` if it isn't already:
```bash
echo "gaz-server/.env" >> .gitignore
```

### 8.2 Run it locally

```bash
cd gaz-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

Open http://localhost:8000/docs — FastAPI's auto-generated Swagger UI. If you see the endpoint list, the backend is running.

### 8.3 Smoke test

Try the simplest endpoint:
```bash
curl http://localhost:8000/sessions
# Expect: {"sessions": []}
```

If this works, your backend is correctly talking to Supabase. ✅

---

## 9. Step 5 — Push to GitHub

Skip this if your code is already pushed.

```bash
cd /path/to/gazelle
git init                               # if not already
git add .
git commit -m "Initial commit"
gh repo create gazelle --private --source=. --push
# or use the GitHub UI to create a repo, then:
# git remote add origin git@github.com:YOU/gazelle.git
# git branch -M main && git push -u origin main
```

**Critical check before pushing:** make sure your `.gitignore` includes both `gaz-server/.env` and `app/.env`. Run:
```bash
git status --ignored | grep .env
```
You should see them listed as ignored. If not, **stop and fix**, then `git rm --cached` any `.env` you accidentally tracked.

---

## 10. Step 6 — Deploy Backend to Render

### 10.1 Add a Dockerfile (one-time)

The backend shells out to the **`ffmpeg`** system binary in two places: `services/ffmpeg_audio.py` (audio extraction from uploads) and indirectly via `yt-dlp` (muxing YouTube streams). Render's Native Python runtime does **not** include ffmpeg, and its build environment runs as a non-root user — so an `apt-get install` Build Command will fail. Render's official guidance for system packages is **use Docker**.

A small Dockerfile solves it permanently. Create `gaz-server/Dockerfile`:

```dockerfile
FROM python:3.11-slim

# System deps: ffmpeg (audio extraction + yt-dlp muxing), ca-certificates (TLS to Supabase/OpenAI/Qdrant)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so Docker layer-caches them across code changes
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Render injects $PORT at runtime; bind to 0.0.0.0 so the container is reachable
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port $PORT"]
```

> 💡 Once you're on Docker, `runtime.txt` is no longer used by Render — the Python version is pinned by `FROM python:3.11-slim` in the Dockerfile. You can leave `runtime.txt` in the repo for local-tooling reference or delete it; either is fine.

### 10.2 Create the web service

1. Sign in at https://render.com → **"New +" → "Web Service"**.
2. Connect your GitHub account, select the `gazelle` repo.
3. Configure:

| Setting | Value |
|---|---|
| **Name** | `gazelle-backend` |
| **Region** | Match your Supabase / Qdrant region |
| **Branch** | `main` |
| **Root Directory** | `gaz-server` |
| **Runtime** | **Docker** |
| **Dockerfile Path** | `./Dockerfile` *(default — relative to Root Directory)* |
| **Health Check Path** | `/sessions` |
| **Plan** | Free |

> ⚠ **Important:** Render's free tier spins down after 15 min of no traffic. The first request after spin-down takes 30–60 sec to wake up. The frontend handles this gracefully but expect it during your demo. Free Web Services are also capped at **~750 hours/month per workspace** — fine for one always-on service, worth knowing if you spin up a second.

> 💡 The **Health Check Path** tells Render to GET `/sessions` after each deploy and only mark the service "live" if it returns 200. A bad config or missing env var fails the deploy loudly instead of going live and 500ing every request.

### 10.3 Add environment variables

Scroll down to **"Environment Variables"** and add **the same keys from your local `gaz-server/.env`** — but **leave `ALLOWED_ORIGINS` blank for now**, you'll fill it in at Step 13 once you know the Vercel URL.

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | your key |
| `GROQ_API_KEY` | your key |
| `SUPABASE_URL` | your URL |
| `SUPABASE_KEY` | your service_role key |
| `QDRANT_URL` | your cluster URL |
| `QDRANT_API_KEY` | your key |
| `ALLOWED_ORIGINS` | *(leave blank for now)* |

> 💡 No `PYTHON_VERSION` needed — the Dockerfile's `FROM python:3.11-slim` pins it.

### 10.4 Deploy

Click **"Create Web Service"**. Render starts building. Watch the **Logs** tab. First Docker build takes ~4–6 minutes (apt + pip); subsequent builds are faster thanks to layer caching.

When you see `Uvicorn running on http://0.0.0.0:10000` (or similar) and the health check at `/sessions` passes, you're live.

### 10.5 Note your backend URL

Render gives you a URL like `https://gazelle-backend.onrender.com`. **Save this** — the frontend needs it.

Test it from your laptop:
```bash
curl https://gazelle-backend.onrender.com/sessions
# Expect: {"sessions": []}
```

> 📚 Docs: https://render.com/docs/deploy-fastapi

---

## 11. Step 7 — Frontend Local Setup

### 11.1 Create the env file

Inside `app/`, create `.env`:

```env
# app/.env
VITE_API_BASE_URL=http://localhost:8000
```

And `app/.env.example` (committed):
```env
# app/.env.example
VITE_API_BASE_URL=http://localhost:8000
```

> ⚠ **The `VITE_` prefix is mandatory.** Vite only exposes env vars to the browser if they start with `VITE_`. Without the prefix, `import.meta.env.VITE_API_BASE_URL` will be `undefined`.

Add to `.gitignore`:
```bash
echo "app/.env" >> .gitignore
```

### 11.2 Run it locally

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5173. You should see the Gazelle UI. The sidebar should populate (empty list is fine). If you see CORS errors in the browser console, check that `ALLOWED_ORIGINS=http://localhost:5173` is set in `gaz-server/.env` and that the backend is restarted.

### 11.3 Full local smoke test

With backend on `:8000` and frontend on `:5173`:
1. Click "New chat" → paste a short YouTube URL → submit.
2. You should see the processing screen advance through stages (transcribing → validating → embedding → ready).
3. Ask a question → see a grounded response with citations.

If this works locally, deploying to production is just repeating the env-var dance.

---

## 12. Step 8 — Deploy Frontend to Vercel

### 12.1 Create the project

1. Sign in at https://vercel.com → **"Add New" → "Project"**.
2. Import your `gazelle` repo.
3. Configure:

| Setting | Value |
|---|---|
| **Project Name** | `gazelle` |
| **Framework Preset** | **Vite** |
| **Root Directory** | `app` |
| **Build Command** | `npm run build` *(default — leave as is)* |
| **Output Directory** | `dist` *(default — leave as is)* |
| **Install Command** | `npm install` *(default)* |

### 12.2 Add environment variables

Under **"Environment Variables"** add:

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://gazelle-backend.onrender.com` *(your Render URL from Step 10.4)* |

Apply to: **Production**, **Preview**, **Development** (all three checkboxes).

### 12.3 Deploy

Click **"Deploy"**. Vercel builds and deploys in ~1 minute. Note your URL — looks like `https://gazelle.vercel.app`.

> 📚 Docs: https://vercel.com/docs/frameworks/vite

---

## 13. Step 9 — Wire Up CORS (The Easy-to-Miss Step)

Your backend currently rejects requests from your Vercel URL because `ALLOWED_ORIGINS` is empty. Fix it:

1. Go to Render → `gazelle-backend` → **Environment** → edit `ALLOWED_ORIGINS`:

```
https://gazelle.vercel.app,http://localhost:5173
```

(Comma-separated. Include `localhost:5173` so local dev keeps working against the production backend if needed.)

2. Save. Render auto-redeploys (~30 sec).

> 💡 Vercel also creates **preview URLs** for every PR (e.g., `gazelle-git-feature-x.vercel.app`). If you want preview deploys to work against the production backend, either add each one to `ALLOWED_ORIGINS` or use a regex match in your FastAPI CORS middleware. For V1 prototype, the production URL is enough.

### Backend CORS code (for reference)

Your `gaz-server/src/main.py` should have something like:
```python
import os
from fastapi.middleware.cors import CORSMiddleware

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)
```

---

## 14. Step 10 — Production Smoke Test

Visit your Vercel URL. Run through the full flow:

- [ ] **Landing page renders** → primary CTA ("New chat" / "Start a session") transitions to the input view.
- [ ] Sidebar loads (empty is fine on first visit).
- [ ] Click "New chat" → paste a 5–10 minute YouTube URL → submit.
- [ ] Processing view advances through stages (this hits Render → Groq → Supabase → OpenAI → Qdrant in sequence).
- [ ] Status reaches `ready` → auto-transitions to chat.
- [ ] Ask a question → grounded answer appears with `[1]`, `[2]` citations.
- [ ] Click a citation → popover shows the exact transcript chunk + timestamp.
- [ ] Click TTS speaker → audio plays.
- [ ] Refresh the page → session is still in the sidebar (chat history is empty by V1 design).
- [ ] Try voice input (mic button) → text appears in textarea.
- [ ] **Archive a session** (sidebar action) → it leaves the active list; reappears under archived.
- [ ] **Delete a session** → it disappears entirely; refresh confirms it's gone from Supabase too.

If all green, you're shipped. 🦌

---

## 15. Environment Variable Cheat Sheet

The single source of confusion for first-timers. Here's everything in one table.

| Variable | Local file | Render dashboard | Vercel dashboard | Purpose |
|---|---|---|---|---|
| `OPENAI_API_KEY` | `gaz-server/.env` | ✅ | — | OpenAI embeddings, GPT-4o-mini, TTS |
| `GROQ_API_KEY` | `gaz-server/.env` | ✅ | — | Groq Whisper for video + voice transcription |
| `SUPABASE_URL` | `gaz-server/.env` | ✅ | — | Postgres metadata DB |
| `SUPABASE_KEY` | `gaz-server/.env` | ✅ | — | Service role key (backend only — never expose) |
| `QDRANT_URL` | `gaz-server/.env` | ✅ | — | Vector DB cluster URL |
| `QDRANT_API_KEY` | `gaz-server/.env` | ✅ | — | Qdrant auth |
| `ALLOWED_ORIGINS` | `gaz-server/.env` | ✅ | — | CORS allow-list (frontend URLs) |
| `VITE_API_BASE_URL` | `app/.env` | — | ✅ | Frontend → backend URL |

> 💡 No `PYTHON_VERSION` env var — under the Docker runtime (§10.1), Python is pinned by the Dockerfile's base image.

**Rules of thumb:**
- Anything starting with `VITE_` → frontend, lives in `app/.env` and Vercel only.
- Anything else (especially API keys) → backend, lives in `gaz-server/.env` and Render only.
- **No secret should ever appear in `app/.env` or in the frontend code.** Anything in the frontend is visible to anyone who opens DevTools.

---

## 16. Common Pitfalls & Fixes

### "CORS error" in browser console
- Backend `ALLOWED_ORIGINS` doesn't include your frontend URL exactly. Check spelling, scheme (`https` vs `http`), no trailing slash.
- After updating Render env vars, give it 30–60 sec to redeploy.

### Backend works locally but 500s on Render
- Almost always a missing env var. Check Render → Environment tab.
- Check Render → Logs for the actual exception.

### Upload works locally but 500s on Render with `[Errno 2] No such file or directory: 'ffmpeg'`
- The service is on Render's Native Python runtime instead of Docker. Native Python has no ffmpeg. Switch the service to **Docker** runtime per §10.1–10.2 (or recreate it).

### Render free tier "is taking forever to respond"
- It's probably waking up from sleep. First request after 15 min idle takes 30–60s. Subsequent requests are fast.
- If you have a demo, hit the backend once 1 min beforehand to wake it.

### Vercel deploys but page is blank
- Open DevTools → Console. If you see `import.meta.env.VITE_API_BASE_URL is undefined`, you forgot to add the env var to Vercel (or forgot the `VITE_` prefix).
- Re-deploy after adding env vars — Vercel does **not** automatically rebuild on env-var changes.

### Supabase queries return empty even though jobs were created
- You're querying with the wrong key (anon vs service_role). For backend writes, always use **service_role**.

### Qdrant: "collection not found"
- Run the `curl PUT collections/transcript_chunks` from §7.3, or have the backend create it on startup.

### Job stays in `pending` forever
- The backend background task probably crashed. Check Render Logs. Common cause: bad `OPENAI_API_KEY` or no billing.

### `.env` accidentally committed to git
```bash
git rm --cached gaz-server/.env app/.env
echo "gaz-server/.env" >> .gitignore
echo "app/.env" >> .gitignore
git commit -m "Remove .env from tracking"
git push
```
Then **rotate every key** that was in the file (treat them as compromised).

---

## 17. Cost Estimate (Prototype Scale)

| Service | Tier | Monthly cost |
|---|---|---|
| Render | Free | $0 |
| Supabase | Free | $0 |
| Qdrant Cloud | Free | $0 |
| Vercel | Free | $0 |
| OpenAI API | Pay-as-you-go | ~$1–5 |
| Groq API | Free | $0 |
| **Total** | | **~$1–5** |

OpenAI cost breakdown for ~50 short videos + ~200 questions per month:
- Embeddings (`text-embedding-3-small`): ~$0.10
- GPT-4o-mini queries: ~$1–3
- TTS (`tts-1`): ~$0.50–2 depending on usage

If your bill spikes unexpectedly, check OpenAI usage dashboard at https://platform.openai.com/usage.

---

## 18. Optional: Custom Domain

Skip for V1 / demo — the default Vercel + Render URLs are fine.

If you want one later:
1. Buy a domain (Namecheap, Cloudflare, etc.).
2. In Vercel: **Settings → Domains → Add** → follow the DNS instructions.
3. In Render: **Settings → Custom Domains → Add** → follow DNS instructions for the backend (e.g., `api.yourdomain.com`).
4. Update `VITE_API_BASE_URL` in Vercel to the new backend domain.
5. Update `ALLOWED_ORIGINS` in Render to include the new frontend domain.

---

## 19. When Something Goes Wrong — Debugging Order

1. **Check Render Logs** — backend errors show here.
2. **Check Vercel build logs + browser DevTools Console** — frontend errors show here.
3. **Check Supabase → Logs** — DB errors / failed queries.
4. **Try the failing endpoint with curl** — isolates frontend vs backend issues.
5. **Restart things in order:** redeploy backend → redeploy frontend → hard refresh browser.

90% of "it doesn't work" issues are env vars. 9% are CORS. The remaining 1% are real bugs.

---

## 20. One-Page Deployment Checklist

Print this. Tick as you go.

- [ ] OpenAI account + billing + key
- [ ] Groq account + key
- [ ] Supabase project + `jobs` table created (SQL run)
- [ ] Supabase URL + service_role key copied
- [ ] Qdrant cluster + URL + API key copied
- [ ] Qdrant collection `transcript_chunks` created (size 1536, cosine)
- [ ] `gaz-server/.env` populated; `uvicorn src.main:app` runs locally; `/sessions` returns `{"sessions": []}`
- [ ] `app/.env` populated; `npm run dev` runs; can submit a job end-to-end locally
- [ ] `.gitignore` excludes both `.env` files
- [ ] `gaz-server/Dockerfile` committed (Python 3.11-slim + ffmpeg)
- [ ] Code pushed to GitHub
- [ ] Render web service created, runtime = **Docker**, root dir = `gaz-server`, health check path = `/sessions`, all env vars set, deploys green
- [ ] Render URL noted
- [ ] Vercel project created, root dir = `app`, `VITE_API_BASE_URL` set to Render URL, deploys green
- [ ] Vercel URL added to `ALLOWED_ORIGINS` on Render
- [ ] Production smoke test passes end-to-end (§14)

You're done.
