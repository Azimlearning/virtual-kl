# Environment Setup — Virtual KL

> **Security:** never commit a real value from this file. `.env*` is gitignored; `.env.example` carries the *names* with blank values and is committed.
> Never paste a real token into a plan, an execution doc, a changelog entry, or a chat transcript. If one leaks, rotate it — don't just delete the message.

Last updated: 2026-10-22 (MVP)

---

## Required variables

| Variable | Required | Where to get it | Read by | Notes |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | For live Claude text and the photo check (the demo runs without it, on labelled templates) | Anthropic Console → API Keys: https://console.anthropic.com/settings/keys | **Demo app:** `frontend/lib/kl/llm.ts` (set in `frontend/.env.local`, or Vercel Environment Variables). **CISE engine:** `app/config.py` → `app/intelligence/llm_client.py` (`.env`) | Server-side only. Never prefix with `NEXT_PUBLIC_`. Live calls verified 2026-10-22 with `claude-sonnet-5-5`. |
| `DATABASE_URL` | Only for the CISE engine | Local: the default in `.env.example` (Docker Compose sets its own inside the stack). Hosted: Supabase https://supabase.com or Neon https://neon.tech connection string, `postgresql+asyncpg://` scheme | `app/config.py`, `app/database.py` | Tests use in-memory SQLite and don't need it, but importing `app.database` builds an asyncpg engine — `asyncpg` must be installed |

## Optional variables

| Variable | Default if unset | What it changes |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` (A-05, unverified live) | Model for advisories, interviews, vision (demo app and engine) |
| `ANTHROPIC_MODEL_FAST` | `claude-haiku-5-5` (engine only, unused so far) | Reserved for high-volume tasks |
| `NEXT_PUBLIC_ENGINE_ENABLED` | `false` | Shows the CISE engine pages in the demo nav (needs the FastAPI backend) |
| `NEXT_DIST_DIR` | `.next` | Build output folder; use `.next-verify` for verification builds next to a running `next dev` (D-26) |
| `POLL_INTERVAL_MINUTES_FAST` / `_SLOW` | `5` / `30` | Ingestion cadence (fast: USGS, GDACS; slow: GDELT, GNews, Open-Meteo, ACLED) |
| `HTTP_TIMEOUT_SECONDS` / `HTTP_MAX_RETRIES` | `15` / `3` | Outbound HTTP behaviour for workers |
| `LOG_LEVEL` | `INFO` | Logging |
| `CHROMA_HOST` / `CHROMA_PORT` | `localhost` / `8001` | Vector DB when running natively (Compose overrides) |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | `bolt://localhost:7687` / `neo4j` / dev password | Graph DB when running natively (Compose overrides). Change the password for any non-local use. |
| `ACLED_API_KEY` / `ACLED_EMAIL` | blank → ACLED worker skips | Register at https://acleddata.com |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | blank → Telegram delivery skipped | Create a bot with @BotFather in Telegram (https://t.me/BotFather); setup steps in the `app/alerts.py` docstring |
| `ALERT_MIN_LEVEL` | `Red` | Lowest level that triggers an alert (`Orange` or `Red`) |
| `PUBLIC_APP_URL` | blank | Adds an "open in app" link to alerts |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURITY` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `ALERT_EMAIL_TO` | host `smtp.gmail.com`, port `587`, `starttls`; blank user/recipients → email skipped | Gmail needs an app password: https://myaccount.google.com/apppasswords |
| `GNEWS_API_KEY` | blank → news worker skipped | Free key (non-commercial): https://gnews.io |
| `API_BASE_URL` (frontend) | blank | Only for the CISE engine pages: where the Next.js server calls the FastAPI backend; Compose sets `http://app:8000` |

---

## Setup

```bash
# Demo app (no database, no Docker):
cp frontend/.env.example frontend/.env.local     # then add ANTHROPIC_API_KEY
cd frontend && npm install --legacy-peer-deps && npm run dev

# CISE engine (optional):
cp .env.example .env                              # fill in ANTHROPIC_API_KEY and anything optional
python -m venv .venv && . .venv/Scripts/activate  # Windows Git Bash (.venv/bin/activate elsewhere)
pip install -r requirements.txt                   # Python 3.12 recommended (chromadb)
docker compose up --build                         # reads .env for the ${VAR} entries
```

The two surfaces read configuration differently: the **demo app** reads `frontend/.env.local` (Next.js, server-side only — the key never reaches the browser bundle); the **engine** reads `.env` at the repo root (pydantic-settings, `app/config.py`) or the variables Docker Compose injects. On Vercel, set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) under Project → Settings → Environment Variables.

---

## Rules

- **Client-side bundles are public.** Anything inlined into a browser build is readable by anyone who opens devtools. A key that must stay secret goes through a server-side route, never into client code — no exceptions, no "it's just a prototype".
- **`.env.example` is the documentation.** Add the variable name there the moment you add the variable, or the next person's setup silently half-works.
- **A missing required variable should fail loudly at startup**, with a message naming the variable and pointing here. Silent fallbacks to a broken state cost hours. (CISE's optional integrations deliberately skip when blank — keep that for optional ones only.)
- **Rotate on exposure, not on suspicion of exposure.** If you can't prove a key never left the machine, treat it as leaked.

## When a variable changes

Adding, renaming, or removing one means updating, in the same session: this file, `.env.example`, `docker-compose.yml` (the `app` service's `environment:` block), `app/config.py`, and a changelog entry. Miss one and the next environment breaks in a way that looks like a code bug.
