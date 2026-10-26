# InsightTag

InsightTag is an AI content assistant. It summarizes submitted notes, articles, or meeting transcripts, generates exactly three relevant tags, and stores each result in a persistent local SQLite database for later review.

![InsightTag end-to-end dashboard](docs/insighttag-demo.png)

## Tech stack

- **Frontend:** React 19, Vite 8, JavaScript, CSS
- **Backend:** Python, FastAPI, Pydantic
- **AI:** OpenRouter Chat Completions API, `httpx`, structured JSON output
- **Database:** SQLite using Python's built-in `sqlite3`
- **Testing:** pytest, Vitest, React Testing Library, mocked network/provider responses

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

```dotenv
OPENROUTER_API_KEY=your-real-openrouter-api-key
LLM_MODEL=openai/gpt-4.1-mini
```

The default uses the verified fixed `openai/gpt-4.1-mini` model through OpenRouter.

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

Vite proxies `/entries` requests to the FastAPI backend on port 8000. No OpenRouter API key is required in the frontend.

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/entries` | Validate text, generate and validate AI output, save it to SQLite, and return HTTP 201 |
| `GET` | `/entries` | Retrieve persisted entries, newest first |
| `GET` | `/entries/{entry_id}` | Retrieve a saved entry by ID or return HTTP 404 |

The backend validates requests before contacting the provider and saves records only after validating the generated output.

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

The automated tests use mocked provider responses rather than requiring real API calls. They exercise request validation, entry creation, malformed AI output, provider failures, database persistence, and list/detail endpoints.

The validation and SQLite persistence logic are exercised with the real application code; the external provider boundary is mocked.

The application was also manually verified through a real OpenRouter request and browser-based creation, retrieval, and persistence checks.

**Frontend automated tests:**

From `frontend/`:

```bash
npm test
```

Two Vitest/React Testing Library smoke tests cover text submission, loading and disabled-button states, successful summary rendering, exactly three generated tags, saved-entry selection and retrieval, and API failures and recovery. Frontend network requests are mocked with `fetch`; these are component tests, not browser-level end-to-end tests.

**Frontend production build:**

From `frontend`:

```bash
npm run build
```

Final verification: **19 backend tests passed, 2 frontend tests passed, and the frontend production build succeeded**. A separate live OpenRouter end-to-end check verified summary generation, exactly three tags, saved-entry retrieval, and SQLite persistence.

Detailed verification evidence: [Verification report](docs/verification.md).

## Engineering decisions

### 1. Architecture

1. React submits user text to FastAPI through `POST /entries`.
2. Pydantic normalizes and validates input before calling the AI provider.
3. The backend sends the text and structured-output instructions to OpenRouter over HTTPS.
4. The AI response is independently validated for a nonblank summary and exactly three distinct tags.
5. Only successfully validated results are persisted to file-backed SQLite with the original text and timestamp.
6. React retrieves saved records through the list and detail GET endpoints.

### 2. AI choice

OpenRouter with the fixed `openai/gpt-4.1-mini` model provides more consistent routing than the free-model router at a low per-request cost.
The model supports structured JSON Schema output for the required summary and exactly three tags.
Pydantic independently validates every generated response before SQLite persistence.

### 3. Reliability

Provider requests use explicit connection and response timeouts, with safe error responses for timeouts, rate limits, authentication issues, and provider failures.
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
- Introduce bounded retries, idempotency protection, provider fallback, and monitoring of latency, failures, and token costs.
- Expand frontend coverage with browser-level end-to-end tests and CI, then evaluate PostgreSQL with migrations for concurrent production usage.

### 6. AI coding tools

OpenAI Codex helped with requirement analysis, implementation, tests, UI refinement, and documentation.
Generated code was reviewed for secret handling, prompt boundaries, parameterized SQL queries, input/output validation, and failure handling.
Automated backend and frontend tests cover the API/provider boundary, SQLite persistence, and core React interactions; the frontend was also built and manually browser-tested.
A separate live end-to-end test verified the OpenRouter integration, AI-generated summary, exactly three tags, and saved-entry retrieval.
