# Gazelle — Hosting Plan

## Architecture

```text
Frontend (React)         → Vercel
Backend (FastAPI)        → Render
Metadata DB (Postgres)   → Supabase
Vector DB (Qdrant)       → Qdrant Cloud (free tier) or Docker on Render
```

---

## Backend — Render

### Setup

1. Create account at render.com
2. Connect GitHub repo (the application code repo, not this planning repo)
3. Create a new **Web Service**
   - Runtime: Python
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Set environment variables:
   - `OPENAI_API_KEY`
   - `GROQ_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `QDRANT_URL`
   - `QDRANT_API_KEY`

### Plan

- Free tier for prototype (spins down after 15 min inactivity — acceptable for demo)
- Upgrade to Starter ($7/mo) if cold starts become a problem during the interview demo

### Notes

- Render supports background workers, but for V1 `FastAPI BackgroundTasks` handles async processing within the web service
- 500 MB upload limit aligns with Render's free tier (which allows up to 512 MB request size)

---

## Database — Supabase

### Setup

1. Create account at supabase.com
2. Create a new project (region: closest to Render deployment)
3. Create the `jobs` table (schema defined in Stage 0 TRD)
4. Copy the project URL and anon/service key into Render env vars

### Plan

- Free tier: 500 MB storage, unlimited API requests — sufficient for prototype

---

## Vector DB — Qdrant

### Option A: Qdrant Cloud (Recommended for demo)

1. Create account at cloud.qdrant.io
2. Create a free-tier cluster (1 GB storage, 1M vectors)
3. Copy the cluster URL and API key into Render env vars

### Option B: Docker on Render (Alternative)

- Deploy Qdrant as a separate Render service using the official Docker image
- More control, but requires managing a separate service

### Plan

- Qdrant Cloud free tier is sufficient for prototype scale
- Single collection: `transcript_chunks`

---

## Frontend — Vercel

### Setup

1. Create account at vercel.com
2. Connect the frontend repo (or frontend directory)
3. Framework preset: React (Vite or Next.js depending on implementation choice)
4. Set environment variable:
   - `VITE_API_URL` (or `NEXT_PUBLIC_API_URL`) → Render backend URL

### Plan

- Free tier: unlimited deployments, automatic HTTPS, preview deploys on PRs

---

## Domain

Not required for V1 / demo. Use default Vercel + Render URLs.

---

## Deployment Order

1. Supabase project + `jobs` table
2. Qdrant Cloud cluster
3. Render backend (with all env vars pointing to Supabase + Qdrant)
4. Vercel frontend (pointing to Render backend)
5. Smoke test: upload a short video, verify the full pipeline

---

## Cost Estimate (Prototype)

| Service | Tier | Cost |
|---|---|---|
| Render | Free | $0 |
| Supabase | Free | $0 |
| Qdrant Cloud | Free | $0 |
| Vercel | Free | $0 |
| OpenAI API | Pay-as-you-go | ~$1–5/mo at prototype volume |
| Groq API | Free tier | $0 |
| **Total** | | **~$1–5/mo** |
