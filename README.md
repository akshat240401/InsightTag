# InsightTag

InsightTag is an AI content assistant. It summarizes submitted notes, articles, or meeting transcripts, generates exactly three relevant tags, and stores each result in a persistent local SQLite database for later review.

![InsightTag end-to-end dashboard](docs/insighttag-demo.png)

## Tech stack

- **Frontend:** React 19, Vite 8, JavaScript, CSS
- **Backend:** Python, FastAPI, Pydantic
- **AI:** OpenRouter Chat Completions API, `httpx`, structured JSON output
- **Database:** SQLite using Python's built-in `sqlite3`
- **Testing:** pytest, Vitest, React Testing Library, Playwright Chromium, mocked network/provider responses

## Prerequisites

- Python 3.10 or newer
- Node.js `^20.19.0` or `>=22.12.0`
- An OpenRouter API key

## Configuration

From the repository root, copy the example environment file and replace the placeholder with your OpenRouter API key.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Configure `.env` at the repository root:

**Recommended default:**

```dotenv
OPENROUTER_API_KEY=your-real-openrouter-api-key
LLM_MODEL=openai/gpt-4.1-mini
```

The application uses OpenRouter exclusively. The configurable default model is the verified fixed `openai/gpt-4.1-mini` model.

**Optional free model:**

```dotenv
OPENROUTER_API_KEY=your-real-openrouter-api-key
LLM_MODEL=openrouter/free
```

A valid OpenRouter API key is still required. The free configuration was successfully tested through the real FastAPI endpoint, but model availability and rate limits may vary, so GPT-4.1 Mini remains recommended for consistent evaluation. InsightTag asks OpenRouter to route free requests only to endpoints supporting the submitted parameters, then independently validates the summary and exactly three distinct tags.

Only create `.env` during initial setup; preserve an existing configured file.

API credentials remain on the backend. `.env`, local SQLite databases, and the assignment PDF are excluded from Git.

## Run locally

### Backend

From the repository root:

**Windows PowerShell:**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

**macOS / Linux:**

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements-dev.txt
./.venv/bin/python -m uvicorn app.main:app --reload
```

Backend: http://127.0.0.1:8000

Interactive API documentation: http://127.0.0.1:8000/docs

SQLite is initialized automatically at `backend/data/insighttag.db` on first startup. Restarting the application reuses the existing database rather than resetting saved records.

### Frontend

Open a second terminal and navigate to the repository's `frontend` directory:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite, normally http://localhost:5173.

Vite proxies `/entries` requests to the FastAPI backend on port 8000. The OpenRouter API key is not required in or exposed to the frontend.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/entries` | Validate text, generate and validate AI output, save it to SQLite, and return HTTP 201 |
| `GET` | `/entries?page=1&page_size=10` | Retrieve one newest-first page; `page` must be at least 1 and `page_size` must be 1–100 |
| `GET` | `/entries/{entry_id}` | Retrieve a saved entry by ID or return HTTP 404 |
| `DELETE` | `/entries/{entry_id}` | Permanently delete one entry and return HTTP 204, or HTTP 404 when it does not exist |

List responses use `{ "items": [], "total": 0, "page": 1, "page_size": 10, "total_pages": 0 }`. Pagination uses SQL `LIMIT`/`OFFSET`; the Saved Insights controls request pages from the server rather than slicing records in React. Deletion requires confirmation, preserves the entry after failures, and refreshes the current valid page after success.

The backend validates requests before contacting the provider and saves records only after validating the generated output.

Application-controlled failures use `{ "error": { "code": "...", "message": "..." } }`. Stable codes distinguish configuration, authentication, rate-limit, timeout, availability, invalid-model-output, missing-entry, database, and unexpected-server failures. FastAPI request-validation failures retain the standard HTTP 422 field-level `detail` structure.

## Verification

**Backend tests — Windows PowerShell:**

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

**Backend tests — macOS / Linux:**

```bash
./.venv/bin/python -m pytest -q
```

The automated tests use mocked OpenRouter responses rather than requiring real API calls. They exercise request validation, the verified request payload, entry creation, malformed AI output, structured failure mapping, database persistence, and all entry endpoints.

The validation and SQLite persistence logic are exercised with the real application code; the external provider boundary is mocked.

The application was also manually verified through a real OpenRouter request and browser-based creation, retrieval, and persistence checks.

**Frontend automated tests:**

From `frontend/`:

```bash
npm test
```

Twenty-one Vitest/React Testing Library tests cover submission, loading and disabled states, summary and three-tag rendering, selection, structured/validation/network errors, deletion, pagination visibility, empty state, mutation refreshes, and stale-response protection. Frontend network requests are mocked with `fetch`; these are component tests, not browser-level end-to-end tests.

**Chromium browser tests:**

From `frontend/`, install the browser once and run Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```

Eleven Playwright tests exercise the running Vite interface with mocked API routes. They cover submission, selection, deletion, pagination, structured errors, deterministic race conditions, dialog keyboard behavior, and desktop/mobile layout without contacting FastAPI, SQLite, or OpenRouter.

**Frontend production build:**

From `frontend`:

```bash
npm run build
```

Final verification: **56 backend tests, 21 frontend component tests, and 11 Chromium Playwright tests passed; the frontend production build also succeeded**. A separate live `openrouter/free` request returned HTTP 201 and passed output, retrieval, and persistence checks using a temporary database.

Detailed verification evidence: [Verification report](docs/verification.md).

## Engineering decisions

### 1. Architecture

1. React submits user text to FastAPI through `POST /entries`.
2. Pydantic normalizes and validates input before calling the AI provider.
3. The backend sends structured-output instructions directly to OpenRouter over HTTPS.
4. The AI response is independently validated for a nonblank summary and exactly three distinct tags.
5. Only successfully validated results are persisted to file-backed SQLite with the original text and timestamp.
6. React retrieves server-paginated records and individual details while ignoring stale asynchronous responses.
7. Confirmed deletes remove one SQLite record, then refresh the last valid list page.

### 2. AI choice

OpenRouter with the fixed `openai/gpt-4.1-mini` model provides more consistent routing than the free-model router at a low per-request cost.
The model supports structured JSON Schema output for the required summary and exactly three tags.
Pydantic independently validates every generated response before SQLite persistence.
`openrouter/free` is an optional live-tested setting with variable availability and lower rate limits; the fixed paid model remains recommended.

### 3. Reliability

Provider requests use explicit connection and response timeouts, with stable structured errors for timeouts, rate limits, authentication issues, and provider failures.
Malformed JSON, blank summaries, and invalid or duplicate tags are rejected by Pydantic validation.
Failed AI generation does not create database records; the frontend provides loading and error feedback without fabricating results.
No automatic provider retries are implemented; clients should check saved entries before retrying an uncertain POST because creation is not idempotent.

### 4. Privacy

Submitted text is sent to OpenRouter and may be processed by its selected model provider; the API key remains backend-only.
Original text, summaries, and tags are stored in local SQLite, while provider error handling avoids logging submitted content or sensitive provider messages.
Do not submit customer PII, PAN/Aadhaar, account details, credentials, or confidential financial records to this prototype.
Production deployment requires approved provider terms, redaction, access controls, retention policies, and appropriate data protection.

### 5. Production next steps

- Add authentication, entry ownership, sensitive-data redaction, encryption, and retention/deletion controls.
- Introduce bounded retries, idempotency protection, and monitoring of latency, failures, and token costs.
- Run the component and Playwright suites in CI, then evaluate PostgreSQL with migrations for concurrent production usage.

### 6. AI coding tools

OpenAI Codex helped with requirement analysis, implementation, tests, UI refinement, and documentation.
Generated code was reviewed for secret handling, prompt boundaries, parameterized SQL queries, input/output validation, and failure handling.
Automated backend and frontend tests cover the API/provider boundary, SQLite persistence, and core React interactions; the frontend was also built and manually browser-tested.
A separate live end-to-end test verified the OpenRouter integration, AI-generated summary, exactly three tags, and saved-entry retrieval.
