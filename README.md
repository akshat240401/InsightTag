# InsightTag

InsightTag turns notes, articles, and meeting transcripts into concise AI summaries with exactly three relevant tags. React and FastAPI provide the workflow, while SQLite preserves validated results.

![InsightTag end-to-end dashboard](docs/insighttag-demo.png)

## Run locally

### Prerequisites and configuration

Install Python 3.10+, Node.js `^20.19.0` or `>=22.12.0`, and obtain an OpenRouter API key. From the repository root, create the ignored local environment file:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux**

```bash
cp .env.example .env
```

The recommended configuration uses the fixed, live-verified model:

```dotenv
OPENROUTER_API_KEY=your-real-openrouter-api-key
LLM_MODEL=openai/gpt-4.1-mini
```

Evaluators may instead use the live-tested free router:

```dotenv
OPENROUTER_API_KEY=your-real-openrouter-api-key
LLM_MODEL=openrouter/free
```

Both configurations require a valid OpenRouter API key. The recommended `openai/gpt-4.1-mini` model requires available paid API credits and offers more consistent availability for evaluation. Alternatively, `openrouter/free` can be used without paid model credits, although model availability and rate limits may vary. Both configurations have been successfully tested through real API requests. API credentials remain backend-only, and `.env` is excluded from Git.

### Backend

**Windows PowerShell**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

**macOS / Linux**

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements-dev.txt
./.venv/bin/python -m uvicorn app.main:app --reload
```

FastAPI runs at `http://127.0.0.1:8000`, with Swagger UI at `/docs`. SQLite initializes at `backend/data/insighttag.db` and persists across restarts.

### Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. The proxy forwards `/entries` to FastAPI; credentials never reach the browser.

### API behavior

- `POST /entries` validates text and AI output, persists the result, and returns HTTP 201.
- `GET /entries?page=1&page_size=10` returns newest-first server-side pagination; `GET /entries/{entry_id}` returns one record.
- `DELETE /entries/{entry_id}` permanently removes a confirmed record and returns HTTP 204.
- Application failures use `{ "error": { "code": "...", "message": "..." } }`; request validation retains FastAPI's HTTP 422 field details.

## Verify

Run backend tests from `backend`:

```powershell
# Windows
.\.venv\Scripts\python.exe -m pytest -q
```

```bash
# macOS / Linux
./.venv/bin/python -m pytest -q
```

Run frontend checks from `frontend`:

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Final results: **88 automated tests passed** - 56 pytest, 21 Vitest/React Testing Library, and 11 Playwright Chromium - and the production build succeeded. Tests mock external boundaries; live OpenRouter checks verified both models. See the [verification report](docs/verification.md) for history and limitations.

## Engineering decisions

### 1. Architecture

1. React submits user text to FastAPI through `POST /entries`.
2. Pydantic normalizes and validates input before calling OpenRouter.
3. The backend requests structured JSON output over HTTPS.
4. Pydantic independently requires a nonblank summary and exactly three distinct tags.
5. The LLM call completes before any database write; only validated results are committed to SQLite with the original text and timestamp.
6. React retrieves paginated records and details while rejecting stale asynchronous responses.
7. Confirmed deletion removes one record and refreshes the last valid page.

### 2. AI choice

The fixed `openai/gpt-4.1-mini` model offers consistent routing, structured JSON Schema output, and low per-request cost.
`openrouter/free` is a live-tested alternative for evaluators, but availability and rate limits vary.
OpenRouter keeps model access behind one backend integration without exposing credentials to React.
Pydantic validates every response independently before persistence.

### 3. Reliability

OpenRouter requests use a 5-second connection timeout and a 15-second response timeout; failures return sanitized, machine-readable errors with appropriate HTTP statuses.
Malformed JSON, blank summaries, and invalid or duplicate tags are rejected.
Failed AI generation creates no database record, while the frontend reports loading and failure states.
Automatic retries are intentionally omitted because entry creation is not idempotent.

### 4. Privacy

Submitted text is sent to OpenRouter and may be processed by its selected model provider; the API key remains backend-only.
Original text and generated content are stored in local SQLite, while logs omit user text and sensitive provider messages.
Users should not submit PII, financial records, account details, or credentials to this prototype.
Production use requires approved provider terms, redaction, access controls, and retention policies.

### 5. Production next steps

- Add authentication, entry ownership, redaction, encryption, and retention/deletion controls.
- Introduce bounded retries, idempotency protection, and monitoring for latency, failures, and token costs.
- Run automated tests in CI, establish a small summary-and-tag quality evaluation dataset, and evaluate PostgreSQL with migrations when concurrent usage warrants it.

### 6. AI coding tools

OpenAI Codex assisted with requirement analysis, implementation, tests, UI refinement, and documentation.
Generated changes were reviewed for secret handling, prompt boundaries, parameterized SQL, validation, and failure behavior.
Automated backend, component, and browser tests validate the API boundary, persistence, and core interactions.
Manual browser checks and genuine OpenRouter requests provided separate integration evidence.
