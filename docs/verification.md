
# InsightTag — Verification and Submission Evidence

This document records verification performed for InsightTag, a React, FastAPI, OpenRouter, and SQLite content assistant. It supplements the [README](../README.md) and documents testing evidence, reproducibility, security checks, and prototype limitations.

## 1. Automated Verification

The following results include the completed Phase 3 browser and accessibility verification on October 26, 2026.

| Check | Command or Method | Result |
|---|---|---|
| Backend API and integration tests | `python -m pytest -q` from `backend/` | **56 passed, 1 warning** |
| Earlier Stage 5 fresh-environment audit | Install `requirements-dev.txt` in a temporary virtual environment and run pytest | **19 passed, 1 warning** |
| Python dependency consistency | `pip check` in the temporary environment | **Passed** |
| Frontend component tests | `npm test` from `frontend/` | **21 passed, 0 failed** |
| Chromium browser tests | `npm run test:e2e` from `frontend/` | **11 passed, 0 failed** |
| Frontend production build | `npm run build` from `frontend/` | **Passed** |
| Frontend lockfile validation | `npm ci --dry-run --ignore-scripts` | **Passed** |

The pytest warning originated from a third-party Starlette `TestClient` deprecation and did not cause test failures.

Backend tests mock the external OpenRouter boundary while exercising the verified request payload, actual FastAPI routing, Pydantic validation, response parsing, structured errors, and file-backed SQLite persistence.

Both `openai/gpt-4.1-mini` and `openrouter/free` are covered with mocked success, malformed-output, rate-limit, and upstream-failure responses. Free-router requests add `provider.require_parameters: true` so OpenRouter selects endpoints that support the submitted JSON Schema and other request parameters. This does not change the default model payload.

The twenty-one Vitest/React Testing Library component tests mock `fetch` while covering the original submission flow, structured/validation/network errors, deletion, pagination visibility, empty state, mutation refreshes, and stale-response protection. These automated tests do not contact the live backend or an LLM provider.

The eleven Playwright tests run the application in headless Chromium with mocked API routes. They cover browser-level submission and selection, delete confirmation/cancellation/failure, pagination and empty states, structured errors, deterministic stale-response races, keyboard focus management, and responsive checks at 1440 × 900 and 375 × 812. They do not contact FastAPI, SQLite, or OpenRouter.

## 2. Functional Test Coverage

The automated tests and application inspection cover:

- Successful `POST /entries` requests returning HTTP 201.
- Rejection of empty, whitespace-only, and over-limit text.
- Valid AI output containing a nonblank summary and exactly three distinct tags.
- Rejection of malformed JSON, missing fields, blank summaries, and invalid tag sets.
- Provider timeout, authentication, rate-limit, and upstream failure handling.
- Mocked OpenRouter structured-output success and malformed-response handling.
- Default GPT-4.1 Mini and optional free-router configuration behavior.
- Stable machine-readable application error codes with safe client messages.
- Safe HTTP error responses without exposing sensitive provider details.
- No database insertion following failed AI generation or invalid output.
- `GET /entries` returning persisted records.
- `GET /entries/{entry_id}` retrieving a record or returning HTTP 404.
- SQLite persistence across new application instances using the same database file.
- Server-side pagination defaults, custom pages, boundaries, total metadata, deterministic ordering, and out-of-range pages.
- Successful and missing-entry deletion, invalid IDs, unrelated-record preservation, pagination updates, and persistent deletion.
- Sanitized database-error handling for deletion.
- Frontend delete confirmation, cancellation, success and failure recovery, and invalid-page correction.
- Request-generation and cancellation guards for stale detail, pagination, and post-mutation list responses.
- Browser keyboard navigation and accessible labels for the primary controls and saved-entry navigation.
- Delete-dialog initial focus, Tab/Shift+Tab trapping, Escape dismissal, and trigger-focus restoration.
- Browser viewport checks for horizontal overflow and dialog clipping on desktop and mobile dimensions.

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

Subsequent fixed-model verification selected `openai/gpt-4.1-mini` for the recommended configuration. Two consecutive requests through the real `POST /entries` endpoint returned HTTP 201, produced factually consistent summaries with exactly three distinct relevant tags, passed list/detail retrieval, and persisted across fresh application instances using an isolated SQLite database.

Historical `openrouter/free` checks intermittently returned upstream HTTP 400 and HTTP 429. After adding capability-aware routing for the existing request parameters, one new genuine free-router request through `POST /entries` returned HTTP 201 in 3.3485 seconds. It produced an accurate, nonblank summary and exactly three distinct relevant tags; GET list/detail returned HTTP 200, and persistence across a fresh application instance passed. The test used a temporary SQLite database, left existing records untouched, and did not expose the actual routed model. This successful check does not eliminate the free router's variable availability or lower rate limits.

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
| Delete saved entry API | `DELETE /entries/{entry_id}` and parameterized SQLite deletion |
| Server-side pagination | `GET /entries?page=&page_size=` with `COUNT(*)`, `LIMIT`, and `OFFSET` |
| Input validation | `backend/app/schemas.py` |
| Real LLM integration | `backend/app/openrouter.py`; manual OpenRouter verification |
| Structured AI response | OpenRouter JSON Schema output and independent Pydantic validation |
| Exactly three distinct tags | `GeneratedContent` validation in `backend/app/schemas.py` |
| Persistent original text and AI output | `backend/app/database.py` and SQLite |
| Persistence across restarts | Automated application-instance persistence tests and manual verification |
| Graceful AI failure handling | `backend/app/errors.py`, OpenRouter exception mapping, and provider-failure tests |
| Meaningful automated testing | 56 backend tests, 21 frontend component tests, and 11 Chromium tests in `frontend/e2e/insighttag.spec.js` |
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

For a no-token-cost alternative, keep the same valid OpenRouter API key and set `LLM_MODEL=openrouter/free`. This configuration passed one genuine end-to-end request, but availability and rate limits may vary; the fixed GPT-4.1 Mini model remains recommended.

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
npx playwright install chromium
npm run test:e2e
npm run build
```

The documented verification baseline is **56 passing backend tests**, **21 passing frontend component tests**, **11 passing Chromium tests**, and a successful frontend production build.

## 6. Configuration and Security Review

The Stage 5 audit reported the following:

- API credentials are loaded through backend configuration.
- The OpenRouter API key is not exposed in React frontend code.
- `.env` and local SQLite database files are ignored by Git.
- `.env.example` contains placeholder values rather than real credentials.
- Tracked files and inspected Git history contained no identified real API keys.
- SQL queries use parameterized values.
- Input and generated output are validated before persistence.
- Provider and application errors are translated into stable codes and safe client-facing messages.
- Submitted text is handled as user content rather than trusted application instructions.
- The backend avoids logging submitted content and sensitive upstream error details.

The credential checks were targeted inspections, not a guarantee that every possible type of secret would be detected.

This is a prototype security review, not a formal production security assessment.

## 7. Scope and Engineering Tradeoffs

InsightTag intentionally keeps its architecture small and focused.

- **AI integration:** OpenRouter is the sole provider and supports configurable model selection through `LLM_MODEL`; there is no automatic fallback or retry.
- **Model selection:** The recommended default is the live-verified fixed `openai/gpt-4.1-mini` model. `openrouter/free` is an optional live-tested configuration with capability filtering, variable availability, lower rate limits, and historical HTTP 400/429 failures.
- **Output validation:** Structured JSON and Pydantic validation enforce output shape, but do not guarantee factual accuracy or eliminate prompt-injection risks.
- **Persistence:** SQLite provides simple file-backed storage. Higher write concurrency would justify a database such as PostgreSQL.
- **Authentication:** The prototype does not implement user accounts, authorization, or per-user data isolation.
- **Sensitive information:** Submitted content may be transmitted to OpenRouter and its selected model provider. Real confidential financial data should not be used without approved controls.
- **Retries:** Automatic provider retries and idempotency keys are not implemented. A lost response may leave uncertainty about whether an entry was saved; check Saved Insights before resubmitting.
- **Frontend testing:** Twenty-one Vitest component tests and eleven Playwright Chromium tests cover core interactions, structured failures, deletion, pagination, deterministic stale-response cases, and dialog accessibility using mocked network requests.
- **Mobile testing:** Playwright checked Chromium at 375 × 812 with no horizontal overflow and a viewport-contained dialog. A physical-device or cross-browser test was not performed.
- **Production infrastructure:** Deployment, CI, monitoring, rate limiting, encryption policies, and data-retention enforcement are future improvements rather than implemented features.

The project's test results demonstrate functional behavior and error handling, not a broad benchmark of LLM quality, latency, security, or scalability.

## 8. Verification Summary

The final verification reported **56 passing backend tests**, **21 passing frontend component tests**, **11 passing Chromium browser tests**, and a successful frontend build. The browser suite verified core workflows, deterministic race protection, dialog keyboard behavior, and desktop/mobile responsiveness with mocked API routes. The existing third-party Starlette/AnyIO deprecation warning remains non-fatal.

A prior manual browser session verified real OpenRouter summarization, three-tag generation, saved-entry retrieval, and persistence.

Two isolated end-to-end checks first verified `openai/gpt-4.1-mini` through the real FastAPI endpoint. The final Stage 5F live verification then used the permanent `openai/gpt-4.1-mini` configuration and returned HTTP 201 in 3.199 seconds. The generated summary and three distinct relevant tags passed validation; list/detail retrieval and persistence across a fresh application instance also passed.

One later `openrouter/free` end-to-end request returned HTTP 201 in 3.3485 seconds and passed summary/tag validation, list/detail retrieval, and fresh-instance persistence using an isolated temporary database. The actual routed free model was not exposed.

The sanitized [live-verification.json](live-verification.json) records only the separate final GPT-4.1 Mini verification. It was not modified for the free-router check, and its actual routed model remains unasserted because the normal application response does not expose it.

All mandatory functionality reviewed in the IIFL assessment has supporting implementation or test evidence. Final publication of the documentation and screenshot should be confirmed on GitHub before submission.
