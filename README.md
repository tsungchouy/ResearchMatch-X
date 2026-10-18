# ResearchMatch

A course prototype (CMU 05-318/518, Human-AI Interaction) that helps an undergraduate go from a resume to a reviewed, editable outreach email for a research lab:

**resume → editable profile → preferences → sourced matches → evidence review → editable email**

Two modes, always labeled in the header:

- **Demo · Sample data** — works with no API key. Uses clearly fictional people, labs and sources (every source says "Sample source — not a live university page"). No resume is analyzed and no live search runs.
- **Live** — the backend calls the OpenAI Responses API with the built-in `web_search` tool, restricted to one university domain per search (CMU `cmu.edu`, Stanford `stanford.edu`, UW `washington.edu`). If Live is not configured or fails, the UI says so; it never falls back to sample data silently.

The app never sends email or guesses professor addresses. The current workflow is saved in this browser so refreshes keep the profile, matches, selections and draft. Uploaded PDF bytes are not saved; pasted text is stored locally with the workflow. The backend keeps session data only in memory.

## Light blue workspace

The frontend uses a light blue canvas, white content surfaces and dark text, including when the operating system uses dark mode. On desktop, compact matches sit beside a persistent evidence inspector; smaller screens use a full-width review dialog. Citations open the corresponding source summary, while the Overview and Sources tabs separate the decision summary from supporting detail.

Preparing outreach opens an explicit review step before continuing to the draft. Profile experience editors, optional preferences and evidence explanations expand on request. Existing Live/Demo adapters, source validation, draft protection and browser storage remain in place.

See [design rationale and scope](docs/frontend-redesign.md) and [AI-assisted implementation briefs](docs/frontend-prompts.md). No external application code or design assets were copied for this refresh.

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

This frontend refresh was verified with **Node 24.19.0** and **Python 3.12.14** on macOS. The current React Router dependency requires **Node ≥ 22.22.0**; use Node 24 LTS. Backend requirements specify Python ≥ 3.11. Scanned PDFs use Tesseract when it is installed (recommended for English resumes), with bundled RapidOCR models as a fallback.

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
| `OPENAI_REASONING_EFFORT` | no | Reasoning effort for supported models; `low` saves latency and tokens. |
| `OPENAI_TIMEOUT_SECONDS` | no | Per-request timeout, default `180`. Provider calls are not retried implicitly. |
| `OPENAI_BASE_URL` | no | Alternative API base URL (used by the tests to point at a local stub). |
| `CORS_ORIGINS` | no | Comma-separated origins, only needed if the frontend is served from another origin. |

Live is enabled only when both `OPENAI_API_KEY` and `OPENAI_MODEL` are set. `GET /api/health` reports `{"status":"ok","liveConfigured":true|false}`.

Frontend: `API_PROXY_TARGET` (dev server only) proxies `/api` somewhere other than `http://localhost:8000`; `VITE_API_BASE_URL` (build time) makes the built app call an API on another origin.

## Using Demo mode

1. On the Profile page choose **Try a sample profile**, then one of the HCI, Machine learning or Robotics samples.
2. Edit anything, tick "I have reviewed my background and preferences.", then **Find research matches**.
3. Filter matches, choose **Review match** to inspect the reasons and sources, then **Prepare outreach**. Tick the review checkbox and choose **Continue to draft**.
4. Pick which experiences the email may use, confirm, **Generate draft**, edit, then **Copy email** or **Download .txt**.
5. Optionally choose **Save to tracker**, then open **Tracker** in the navigation to record status, dates and notes.

## Outreach tracker

`/tracker` keeps a list of emails you chose to save, so you can follow up later:

- Each record holds the professor or lab, university, first source link (Live only), the email subject and body, a status (Not sent yet, Sent, Replied, Meeting scheduled, Declined, No response), sent date, follow-up date and notes. Choosing **Sent** fills in today's date if none is set. Records past their follow-up date while still waiting for a reply are marked **Follow-up due**.
- Saving the same professor again updates the saved email but keeps status, dates and notes. Demo records are labeled **Sample** and kept apart from Live records.
- Records are stored **only in this browser's localStorage** (`researchmatch.tracker.v1`), including the email text. Nothing is sent to the backend. **Start over** does not clear them; use **Remove** or **Clear tracker**. **Download CSV** exports the list (cells starting with `=`, `+`, `-` or `@` are escaped so spreadsheets don't run them).
- If the browser refuses to store data (some private modes), the page says changes aren't being saved.

The active workflow is stored separately in localStorage (`researchmatch.session.v1`). **Start over** clears it. Uploaded PDF files must be selected again if the page is refreshed before extraction.

## Testing Live

1. Put a real key and a web-search-capable model in `backend/.env`, restart uvicorn and check `curl localhost:8000/api/health` shows `"liveConfigured":true`.
2. In the app, upload a text-based or scanned PDF resume (≤ 5 MB, ≤ 10 pages) or paste ≥ 100 characters of background.
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
# Or use an installed Google Chrome:
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:e2e
```

`npm run test:e2e` starts everything it needs: a backend with **no** key on :8000 with Vite on :5173, and a second backend on :8001 whose OpenAI SDK points at a local stub (`backend/tests/stub_openai_server.py`, :8765) with Vite on :5174. The e2e config expects the backend virtualenv at `backend/.venv`. If servers are already running on those ports they are reused outside CI.

The spec suggested `tests/e2e/` at the repo root; the specs live in `frontend/tests/e2e/` so they resolve the frontend's `node_modules`.

### Results on 2026-10-18

| Suite | Result |
| --- | --- |
| Backend pytest | 28 passed (URL domain rules, sources must exist, missing recruitment evidence → unknown, session isolation, profile version mismatch rejects drafts, idempotent job creation, partial/failed/cancel/retry, PDF validation and OCR fallback, OpenAI gateway request/response shape via a mock transport) |
| Frontend lint (oxlint) | clean |
| TypeScript + Vite build | clean |
| Vitest | 25 passed (invalidation chain, late responses ignored, mode switch reset, draft edit protection; tracker save/update rules, follow-up logic, storage parsing that skips invalid or unsafe entries, CSV escaping) |
| Playwright | 17 passed (full Demo flow without a key; Live-not-configured message; mobile upload input, drawer and email editing at 390×844; clipboard failure; partial failure + retry via test adapter; draft failure keeps input; cancel; validation focus; route guards and refresh; Live wiring against the OpenAI stub including partial failure; tracker save → status → reload → CSV → remove; Start over keeps the tracker; tracker at 360 px; forced light appearance with a dark OS preference, citation navigation, review confirmation and 320 px reflow) |

The refreshed matches, profile and outreach pages were visually checked at 1440 px; mobile evidence review was checked at 390×844, and the automated suite checks horizontal overflow at 320 px. See [desktop and mobile screenshots](docs/frontend-redesign.md#screenshots).

## Baseline Live verification

The following real-provider checks were recorded by the existing project before this frontend refresh. This refresh reverified Live wiring against the local OpenAI stub; it did not repeat real-provider accuracy checks.

- **Verified: text and scanned PDF extraction with `gpt-5-mini`.** On 2026-10-18 a real one-page resume was parsed locally and sent through the OpenAI Responses API. The structured profile preserved its education, majors/minor, six named experiences and quantitative achievements. A generated image-only PDF also passed local OCR.
- **Verified: real `web_search` and complete Live flow.** A CMU-only smoke test returned three sourced matches, including Haiyi Zhu, BIG Lab and CARE Lab, and generated an editable outreach draft. The cited CMU pages were opened manually and supported the displayed research-fit claims. Recruiting remained `unknown` because no cited page clearly stated a current undergraduate opening.
- `OPENAI_MODEL` has no repository default; configure a model after checking current availability and pricing.

## Limitations

- **Single-process backend.** Provider-side session records live in memory for 30 minutes, so run one uvicorn worker. Browser state survives refreshes and keeps completed results and drafts, but after a backend restart a new provider action may require starting a new session.
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
