# ResearchMatch

A course prototype (CMU 05-318/518, Human-AI Interaction) that helps an undergraduate go from a resume to a reviewed, editable outreach email for a research lab:

**resume → editable profile → preferences → sourced matches → evidence review → editable email**

Two modes, always labeled in the header:

- **Demo · Sample data** — works with no API key. Uses clearly fictional people, labs and sources (every source says "Sample source — not a live university page"). No resume is analyzed and no live search runs.
- **Live** — the backend calls the OpenAI Responses API with the built-in `web_search` tool, restricted to one university domain per search (CMU `cmu.edu`, Stanford `stanford.edu`, UW `washington.edu`). If Live is not configured or fails, the UI says so; it never falls back to sample data silently.

The app never sends email, guesses professor addresses, or stores resumes beyond the in-memory session. The only thing kept after you leave is what you explicitly save to the outreach tracker (see below).

## Repository layout

```
backend/            FastAPI app (Python)
  app/              routes, services (OpenAI gateway, profile, search, matching, draft), in-memory store
  tests/            pytest suite, OpenAI response stub + stub server for e2e
frontend/           React + TypeScript + Vite (plain CSS tokens, no UI framework)
  src/              pages, components, state (Context + useReducer), live/demo service adapters
  tests/e2e/        Playwright specs
```

## Requirements

Tested with **Node v25.9.0 / npm 11.12.1** and **Python 3.14.4** on macOS. Node ≥ 20 and Python ≥ 3.11 should work but were not tested.

## Install from a clean directory

```bash
git clone https://github.com/tsungchouy/ResearchMatch-X.git
cd researchmatch-x

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt          # add -r requirements-dev.txt to run tests
cp .env.example .env                     # optional; leave the key empty for Demo only
cd ..

# Frontend
cd frontend
npm ci
cd ..
```

## Run (two processes)

Terminal 1 — API on port 8000:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Terminal 2 — web app on port 5173 (Vite proxies `/api` to `localhost:8000`):

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>.

## Environment variables (`backend/.env`)

| Variable | Required | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | Live only | Server-side key. Never sent to the browser. |
| `OPENAI_MODEL` | Live only | A model your account can use **with the `web_search` tool**. |
| `OPENAI_TIMEOUT_SECONDS` | no | Per-request timeout, default `90`. The SDK retries at most once. |
| `OPENAI_BASE_URL` | no | Alternative API base URL (used by the tests to point at a local stub). |
| `CORS_ORIGINS` | no | Comma-separated origins, only needed if the frontend is served from another origin. |

Live is enabled only when both `OPENAI_API_KEY` and `OPENAI_MODEL` are set. `GET /api/health` reports `{"status":"ok","liveConfigured":true|false}`.

Frontend: `API_PROXY_TARGET` (dev server only) proxies `/api` somewhere other than `http://localhost:8000`; `VITE_API_BASE_URL` (build time) makes the built app call an API on another origin.

## Using Demo mode

1. On the Profile page choose **Try a sample profile**, then one of the HCI, Machine learning or Robotics samples.
2. Edit anything, tick "I have reviewed my background and preferences.", then **Find research matches**.
3. Filter matches, open **Review match** to read the reasons, recruitment evidence and sources, tick the review checkbox and choose **Prepare outreach**.
4. Pick which experiences the email may use, confirm, **Generate draft**, edit, then **Copy email** or **Download .txt**.
5. Optionally choose **Save to tracker**, then open **Outreach tracker** (next to the steps) to record status, dates and notes.

## Outreach tracker

`/tracker` keeps a list of emails you chose to save, so you can follow up later:

- Each record holds the professor or lab, university, first source link (Live only), the email subject and body, a status (Not sent yet, Sent, Replied, Meeting scheduled, Declined, No response), sent date, follow-up date and notes. Choosing **Sent** fills in today's date if none is set. Records past their follow-up date while still waiting for a reply are marked **Follow-up due**.
- Saving the same professor again updates the saved email but keeps status, dates and notes. Demo records are labeled **Sample** and kept apart from Live records.
- Records are stored **only in this browser's localStorage** (`researchmatch.tracker.v1`), including the email text. Nothing is sent to the backend. **Start over** does not clear them; use **Remove** or **Clear tracker**. **Download CSV** exports the list (cells starting with `=`, `+`, `-` or `@` are escaped so spreadsheets don't run them).
- If the browser refuses to store data (some private modes), the page says changes aren't being saved.

## Testing Live

1. Put a real key and a web-search-capable model in `backend/.env`, restart uvicorn and check `curl localhost:8000/api/health` shows `"liveConfigured":true`.
2. In the app, upload a text-based PDF resume (≤ 5 MB, ≤ 10 pages) or paste ≥ 100 characters of background.
3. Review the extracted profile (the name field is never sent to search), add interests, confirm and search.
4. For each match, open the source links and check by hand that the person, university and recruitment statement are really on the page.
5. Generate and edit a draft.

How Live search works: each school is searched separately with `tool_choice="required"` and `allowed_domains=[domain]`. A second, tool-free call organizes the results into strict JSON that may only reference retrieved sources by id. The backend then drops any URL whose host is not the domain or a subdomain of it (so `cmu.edu.example.com` is rejected), drops candidates without sourced reasons, forces recruitment to `unknown` when there is no direct evidence, de-duplicates and keeps at most five. Source summaries are paraphrases, not verified quotes.

## Tests

```bash
# Backend (from backend/, venv active, requirements-dev installed)
python -m pytest -q

# Frontend (from frontend/)
npm run lint
npm run build          # includes tsc type checking
npm test               # vitest reducer tests
npx playwright install chromium   # first time only
npm run test:e2e       # Playwright
```

`npm run test:e2e` starts everything it needs: a backend with **no** key on :8000 with Vite on :5173, and a second backend on :8001 whose OpenAI SDK points at a local stub (`backend/tests/stub_openai_server.py`, :8765) with Vite on :5174. The e2e config expects the backend virtualenv at `backend/.venv`. If servers are already running on those ports they are reused outside CI.

The spec suggested `tests/e2e/` at the repo root; the specs live in `frontend/tests/e2e/` so they resolve the frontend's `node_modules`.

### Results on 2026-10-18

| Suite | Result |
| --- | --- |
| Backend pytest | 27 passed (URL domain rules, sources must exist, missing recruitment evidence → unknown, session isolation, profile version mismatch rejects drafts, idempotent job creation, partial/failed/cancel/retry, PDF validation, OpenAI gateway request/response shape via a mock transport) |
| Frontend lint (oxlint) | clean |
| TypeScript + Vite build | clean |
| Vitest | 22 passed (invalidation chain, late responses ignored, mode switch reset, draft edit protection; tracker save/update rules, follow-up logic, storage parsing that skips invalid or unsafe entries, CSV escaping) |
| Playwright | 16 passed (full Demo flow without a key; Live-not-configured message; mobile upload input, drawer and email editing at 390×844; clipboard failure; partial failure + retry via test adapter; draft failure keeps input; cancel; validation focus; route guards and refresh; Live wiring against the OpenAI stub including partial failure; tracker save → status → reload → CSV → remove; Start over keeps the tracker; tracker at 360 px) |

Layouts were also checked by screenshot at 1440×900, 1024×768, 390×844, 360×800 and 320 px (no horizontal scroll), and a runtime contrast scan of the matches, outreach and tracker pages found no enabled text below 4.5:1.

## Verification status (honest)

- **Not verified: Live mode against the real OpenAI API.** No API key was available while building this, so the real `web_search` behavior, the chosen model, the quality of matches, costs and real latency are untested. The Live code path *is* exercised end to end through the real OpenAI Python SDK against a local stub that returns Responses-shaped JSON, which verifies request/response wiring but not model behavior.
- Because of that, these acceptance items are still open: "Live results have real web_search calls and citations" and the manual Live check (one fresh resume through real search to email, sources opened and checked by hand).
- `OPENAI_MODEL` has no default on purpose; pick one after a real smoke test.

## Limitations

- **Single process, in-memory store.** Sessions, confirmed profiles, search jobs and drafts live in memory for 30 minutes. Run one uvicorn worker; restarting the server or refreshing the page loses the session (the app says so after a refresh). Only tracker records survive, and only in the same browser.
- Only three universities, at most three candidates per school and five overall.
- Recruitment status reflects what a page says at retrieval time; it can be stale.
- No login, server-side persistence, cross-device sync, or email sending — by design for this prototype.

## Deployment

Same origin (recommended): build the frontend and let FastAPI serve it.

```bash
cd frontend && npm run build && cd ../backend
uvicorn app.main:app --port 8000      # serves frontend/dist and /api on one port, one worker
```

Separate origins: build with `VITE_API_BASE_URL=https://api.example.edu npm run build`, host `frontend/dist` anywhere that rewrites unknown paths to `index.html`, and set `CORS_ORIGINS=https://app.example.edu` on the backend. Only listed origins receive CORS headers. This prototype has not been deployed.
