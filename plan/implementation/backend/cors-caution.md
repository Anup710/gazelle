# CORS — Backend Configuration Note

> **Status:** required for V1. Configure on day one of the backend, before the first deploy. Skipping this guarantees the deployed UI breaks the moment FE and BE land on different origins.

---

## 1. Why this document exists

CORS (Cross-Origin Resource Sharing) is the **#1 first-deploy gotcha** for any app with a separate FE and BE. It is:

- **Trivial to fix** (≈5 lines of FastAPI middleware).
- **Easy to miss** because local dev frequently masks it.
- **Confusing to debug** because the request often *succeeds* on the server — the browser just refuses to hand the response back to JavaScript.

If this isn't configured before the first cross-origin deploy, the demo will fail in front of stakeholders. Hence this dedicated doc.

---

## 2. What CORS actually does

When a page served from `https://gazelle.vercel.app` calls `fetch("https://gazelle-api.onrender.com/rag/query")`, the browser sees two different **origins** (origin = scheme + domain + port). By default the browser **blocks JavaScript from reading the response** unless the server opts in via response headers — most importantly:

```
Access-Control-Allow-Origin: https://gazelle.vercel.app
```

For "non-simple" requests (anything with `Content-Type: application/json`, custom headers, or methods other than GET/HEAD/simple-POST), the browser first sends a **preflight `OPTIONS`** request asking the server "are you OK with this?" The server must respond with the right `Access-Control-Allow-*` headers, or the real request never fires.

The pitfall: `curl`, Postman, and integration tests don't enforce CORS — **only browsers do**. So endpoint tests pass, then the deployed UI breaks.

---

## 3. The fix (FastAPI)

Add `CORSMiddleware` once, in the app entry point. This handles preflight automatically — no manual `OPTIONS` routes needed.

```python
# gaz-server/src/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",         # Vite dev server
        "https://gazelle.vercel.app",    # production FE (replace with actual prod domain)
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",  # all Vercel preview deploys
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,             # V1 has no auth/cookies
)
```

That's the entire fix. Place it **before** route registration so preflight requests on every endpoint are covered.

---

## 4. Gazelle-specific origin list

| Environment | Origin | Source |
|---|---|---|
| Local FE dev | `http://localhost:5173` | Vite default port (FE plan §5) |
| Vercel production | `https://gazelle.vercel.app` (or final domain) | FE plan §17 |
| Vercel previews | `https://*.vercel.app` (regex) | One unique URL per PR |
| Local BE dev | n/a — backend serves, not requests | — |

Match origins **exactly** — trailing slashes, scheme mismatches, and `www` prefixes all count as different origins. `https://gazelle.vercel.app` ≠ `https://gazelle.vercel.app/` ≠ `http://gazelle.vercel.app`.

---

## 5. Verification (do this before declaring deploy "done")

After the first cross-origin deploy, run all four checks:

1. **Open the deployed FE in a browser.** Open DevTools → Network tab. Make any real API call (e.g., session list). Confirm:
   - The request shows `Status: 200` (not red).
   - Response headers include `Access-Control-Allow-Origin: <your FE origin>`.
   - The JS actually receives the response (no red CORS error in Console).

2. **Verify the preflight.** For a `POST /rag/query`, the Network tab should show **two** entries: an `OPTIONS` preflight (status 200, no body) followed by the real `POST`. If you only see the `POST` and it's red, preflight is failing.

3. **Try a Vercel preview URL.** Confirm the regex matches — preview URLs look like `https://gazelle-git-feature-x-team.vercel.app`.

4. **Confirm a wrong origin is blocked.** Temporarily edit the deployed page's origin (e.g., open `localhost:3000` and try to hit prod API) — request should be blocked. This confirms the allowlist isn't accidentally `["*"]`.

---

## 6. Common gotchas

| Gotcha | Symptom | Fix |
|---|---|---|
| Wildcard `["*"]` left in for "convenience" | Works initially but breaks if you ever add cookies/auth (browser disallows `*` + credentials) | Use explicit origins or regex |
| Trailing slash mismatch | Specific endpoint fails CORS, others work | Strip trailing slashes from `allow_origins` entries |
| Vercel preview deploys not in allowlist | Production works, PR previews fail | Use `allow_origin_regex` |
| Forgot to redeploy backend after CORS edit | Code says it's fixed; browser still blocks | Backend config must redeploy to take effect |
| Reverse proxy / CDN strips CORS headers | Headers visible from `curl localhost:8000` but missing from public URL | Check Render/Cloudflare settings, not the app |
| `allow_credentials=True` + wildcard origin | Browser silently rejects | Either credentials OR wildcard, never both |
| "I disabled CORS in my browser extension" | Works for you, broken for everyone else | CORS is a **server-side** fix. Never client-side |

---

## 7. What NOT to do

- **Do not "fix" CORS in the frontend.** It is a server-side response-header concern. Browser extensions, proxy hacks, or `mode: "no-cors"` in `fetch()` are not real fixes — they either fool only your machine, or strip the response body entirely.
- **Do not write manual `OPTIONS` route handlers.** `CORSMiddleware` handles preflight. Doing it by hand is duplicate work and a foot-gun.
- **Do not skip the regex for Vercel previews.** Every PR gets a unique deploy URL; enumerating them by hand is impossible.
- **Do not enable `allow_credentials=True` until V1 has auth.** It forces a stricter origin contract (no wildcards) for no benefit while we're stateless.

---

## 8. References

- FE plan §5 — backend CORS expectation: `plan/implementation/frontend/plan.md`
- Hosting plan — deployment topology: `plan/hosting/hosting.md`
- FastAPI docs — `CORSMiddleware`: https://fastapi.tiangolo.com/tutorial/cors/
- MDN — CORS overview: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

---

**TL;DR:** Five lines of `CORSMiddleware` in `gaz-server/src/main.py` before the first deploy. Allow `localhost:5173`, the prod FE domain, and a `*.vercel.app` regex. Verify in a browser, not in `curl`. Don't enable credentials yet.
