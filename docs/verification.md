
# InsightTag — Verification and Submission Evidence

This document records verification performed for InsightTag, a React, FastAPI, OpenRouter, and SQLite content assistant. It supplements the [README](../README.md) and documents testing evidence, reproducibility, security checks, and prototype limitations.

## 1. Automated Verification

The following results were reported during the final Stage 5 quality audit on October 26, 2026.

| Check | Command or Method | Result |
|---|---|---|
| Backend API and integration tests | `python -m pytest -q -ra` from `backend/` | **19 passed, 1 warning** |
| Fresh Python environment | Install `requirements-dev.txt` in a temporary virtual environment and run pytest | **19 passed, 1 warning** |
| Python dependency consistency | `pip check` in the temporary environment | **Passed** |
| Frontend smoke tests | `npm test` from `frontend/` | **2 passed, 0 failed** |
| Frontend production build | `npm run build` from `frontend/` | **Passed** |
| Frontend lockfile validation | `npm ci --dry-run --ignore-scripts` | **Passed** |

The pytest warning originated from a third-party Starlette `TestClient` deprecation and did not cause test failures.

Backend tests mock the external OpenRouter provider boundary while exercising actual FastAPI routing, Pydantic validation, response parsing, and file-backed SQLite persistence.

The two Vitest/React Testing Library component tests mock `fetch` while covering submission, loading and disabled controls, summary and three-tag rendering, saved-entry selection, and API-error recovery. These automated tests do not contact the live backend or LLM provider.

## 2. Functional Test Coverage

The automated tests and application inspection cover:

- Successful `POST /entries` requests returning HTTP 201.
- Rejection of empty, whitespace-only, and over-limit text.
- Valid AI output containing a nonblank summary and exactly three distinct tags.
- Rejection of malformed JSON, missing fields, blank summaries, and invalid tag sets.
- Provider timeout, authentication, rate-limit, and upstream failure handling.
- Safe HTTP error responses without exposing sensitive provider details.
- No database insertion following failed AI generation or invalid output.
- `GET /entries` returning persisted records.
- `GET /entries/{entry_id}` retrieving a record or returning HTTP 404.
- SQLite persistence across new application instances using the same database file.

The application does not fabricate AI responses when the external provider fails.

## 3. Manual End-to-End Verification

During development, InsightTag was tested through its running React frontend and FastAPI backend using a real OpenRouter API request.

The manual verification confirmed:

- Text submission through the browser.
- A real AI-generated summary.
- Exactly three relevant tags.
- Successful persistence of the original text, summary, and tags.
- Saved-entry retrieval and selection.
- Persistence after refreshing the page and restarting the backend.
- Frontend validation and user-visible API error feedback.

The final Stage 5 audit also retrieved existing saved entries through the running API without modifying the database.

No new live OpenRouter request was made during that audit.

Subsequent fixed-model verification selected `openai/gpt-4.1-mini` for the final configuration. Two consecutive requests through the real `POST /entries` endpoint returned HTTP 201, produced factually consistent summaries with exactly three distinct relevant tags, passed list/detail retrieval, and persisted across fresh application instances using an isolated SQLite database. Earlier `openrouter/free` checks intermittently returned upstream HTTP 400 and HTTP 429; those historical failures remain recorded rather than being treated as successful verification.

`docs/live-verification.json` now records the successful final Stage 5F run using `openai/gpt-4.1-mini`; the earlier failed `openrouter/free` run remains documented above as historical evidence.

The responsive layout was also checked manually in Chrome DevTools at a 375 × 812 device-emulation viewport. The browser overflow check found no horizontal overflow; no physical-device test was performed.

### Screenshot Evidence

The [InsightTag end-to-end screenshot](insighttag-demo.png) shows the running application with a real AI-generated summary, exactly three tags, and persisted saved entries.

The screenshot was captured from the working application, not generated or mocked.

## 4. Requirements-to-Evidence Mapping

| Assignment Requirement | InsightTag Implementation / Evidence |
|---|---|
| Modern frontend framework | React 19 and Vite 8; `frontend/src/` |
| Text input form | `frontend/src/components/EntryForm.jsx` |
| Loading and error states | `frontend/src/App.jsx`, `EntryForm.jsx`, and related components |
| Display generated summary and tags | `frontend/src/components/EntryDetail.jsx` |
| Saved entries list and detail view | `EntryList.jsx`, `EntryDetail.jsx`, and `App.jsx` |
| Python REST backend | `backend/app/main.py` and `backend/app/routes.py` |
| Create entry API | `POST /entries` |
| List saved entries API | `GET /entries` |
| Retrieve entry detail API | `GET /entries/{entry_id}` |
| Input validation | `backend/app/schemas.py` |
| Real LLM integration | `backend/app/openrouter.py`; manual OpenRouter verification |
| Structured AI response | OpenRouter JSON Schema output and Pydantic validation |
| Exactly three distinct tags | `GeneratedContent` validation in `backend/app/schemas.py` |
| Persistent original text and AI output | `backend/app/database.py` and SQLite |
| Persistence across restarts | Automated application-instance persistence tests and manual verification |
| Graceful AI failure handling | `backend/app/openrouter.py`, `backend/app/routes.py`, and provider-failure tests |
| Meaningful automated testing | `backend/tests/test_entries.py`; 19 backend tests, plus 2 frontend smoke tests in `frontend/src/App.test.jsx` |
| Safe environment configuration | `.env.example`, `.gitignore`, and backend configuration |
| Local setup instructions | `README.md` |
| Six engineering decision answers | `README.md`, Engineering Decisions section |
| Genuine end-to-end screenshot | `docs/insighttag-demo.png` |
| Public source repository | [InsightTag on GitHub](https://github.com/akshat240401/InsightTag) |

Optional production features, such as authentication, deployment, container orchestration, and advanced monitoring, are intentionally outside the prototype's scope.

## 5. Repeat Live Verification

These steps allow a reviewer to reproduce the working application using their own OpenRouter API key.

### Step 1 — Configure the environment

From the repository root, create `.env` from `.env.example` if it does not already exist.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Set a valid API key:

```dotenv
OPENROUTER_API_KEY=your-real-openrouter-api-key
LLM_MODEL=openai/gpt-4.1-mini
```

Do not commit the populated `.env` file.

### Step 2 — Start the backend

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

For initial dependency installation, follow the [README](../README.md).

API: http://127.0.0.1:8000

Interactive API documentation: http://127.0.0.1:8000/docs

### Step 3 — Start the frontend

From `frontend/` in a separate terminal:

```bash
npm ci
npm run dev
```

Open http://localhost:5173.

### Step 4 — Submit sample content

Use synthetic, non-sensitive sample text, such as:

> The engineering team completed the API integration on Monday. The dashboard review is scheduled for Thursday, and the final testing deadline is Friday. The production launch date has not yet been confirmed.

Click **Summarize & Save**.

Confirm that:

1. A real AI-generated summary appears.
2. Exactly three distinct, relevant tags are displayed.
3. The summary preserves the original facts without inventing details.
4. A new entry appears in Saved Insights.

### Step 5 — Verify persistence

1. Select the newly saved entry.
2. Confirm the original text, summary, and tags are accessible.
3. Refresh the browser and reopen the entry.
4. Restart the FastAPI backend.
5. Refresh the frontend and confirm the entry is still available.

The application uses a persistent SQLite database rather than in-memory storage.

### Step 6 — Verify failure behavior

Temporarily stop the backend while keeping the frontend running.

Attempt to load saved entries or submit text.

Confirm the frontend displays an understandable error state without crashing.

Restart the backend before continuing.

For provider-specific failures, refer to the automated timeout, rate-limit, and invalid-response tests. Avoid intentionally submitting unnecessary live requests.

### Step 7 — Run automated checks

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

From `frontend/`:

```bash
npm test
npm run build
```

The documented verification baseline is **19 passing backend tests**, **2 passing frontend tests**, and a successful frontend production build.

## 6. Configuration and Security Review

The Stage 5 audit reported the following:

- API credentials are loaded through backend configuration.
- The OpenRouter API key is not exposed in React frontend code.
- `.env` and local SQLite database files are ignored by Git.
- `.env.example` contains placeholder values rather than real credentials.
- Tracked files and inspected Git history contained no identified real API keys.
- SQL queries use parameterized values.
- Input and generated output are validated before persistence.
- Provider errors are translated into safe client-facing responses.
- Submitted text is handled as user content rather than trusted application instructions.
- The backend avoids logging submitted content and sensitive upstream error details.

The credential checks were targeted inspections, not a guarantee that every possible type of secret would be detected.

This is a prototype security review, not a formal production security assessment.

## 7. Scope and Engineering Tradeoffs

InsightTag intentionally keeps its architecture small and focused.

- **Single AI integration:** OpenRouter supports configurable model selection through `LLM_MODEL`. Multiple provider adapters are not implemented.
- **Model selection:** The final configuration uses the verified fixed `openai/gpt-4.1-mini` model. Earlier `openrouter/free` verification produced intermittent HTTP 400 and HTTP 429 responses, motivating the fixed-model choice; external availability and latency can still vary.
- **Output validation:** Structured JSON and Pydantic validation enforce output shape, but do not guarantee factual accuracy or eliminate prompt-injection risks.
- **Persistence:** SQLite provides simple file-backed storage. Higher write concurrency would justify a database such as PostgreSQL.
- **Authentication:** The prototype does not implement user accounts, authorization, or per-user data isolation.
- **Sensitive information:** Submitted content may be transmitted to OpenRouter and its selected model provider. Real confidential financial data should not be used without approved controls.
- **Retries:** Automatic provider retries and idempotency keys are not implemented. A lost response may leave uncertainty about whether an entry was saved; check Saved Insights before resubmitting.
- **Frontend testing:** Two automated Vitest/React Testing Library smoke tests cover core user interactions using mocked network requests. Browser layout and real API integration were verified separately.
- **Mobile testing:** The layout was manually checked in Chrome at a 375 × 812 device-emulation viewport, with no horizontal overflow detected. A physical-device test was not performed.
- **Production infrastructure:** Deployment, CI, monitoring, rate limiting, encryption policies, and data-retention enforcement are future improvements rather than implemented features.

The project's test results demonstrate functional behavior and error handling, not a broad benchmark of LLM quality, latency, security, or scalability.

## 8. Verification Summary

The October 26, 2026 final verification reported **19 passing backend tests**, **2 passing frontend tests**, a successful frontend build, successful dependency checks, and no identified committed credentials.

A prior manual browser session verified real OpenRouter summarization, three-tag generation, saved-entry retrieval, and persistence.

Two isolated end-to-end checks first verified `openai/gpt-4.1-mini` through the real FastAPI endpoint. The final Stage 5F live verification then used the permanent `openai/gpt-4.1-mini` configuration and returned HTTP 201 in 3.199 seconds. The generated summary and three distinct relevant tags passed validation; list/detail retrieval and persistence across a fresh application instance also passed.

The sanitized results are recorded in [live-verification.json](live-verification.json). The actual routed model is not asserted because the normal application response does not expose it.

All mandatory functionality reviewed in the IIFL assessment has supporting implementation or test evidence. Final publication of the documentation and screenshot should be confirmed on GitHub before submission.
