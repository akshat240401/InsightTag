# InsightTag

InsightTag is a small AI content assistant for the IIFL Finance Full Stack
Developer Round 1 assessment. The intended flow accepts text, generates a
concise summary and exactly three tags, persists the result, and displays saved
entries.

## Assignment checklist

- [ ] Provide a frontend text form with loading and error states.
- [ ] Display a list of saved entries and allow an entry to be opened.
- [x] Expose a small Python REST API for the frontend.
- [x] Reject empty text and apply a reasonable input-length limit.
- [ ] Call one real LLM API and request a concise summary plus exactly three
      relevant tags.
- [ ] Parse and validate the model output into a predictable structure.
- [x] Persist the original text, summary, and tags in SQLite across restarts.
- [ ] Gracefully surface at least one LLM failure mode, such as a timeout or
      malformed output.
- [x] Add at least one useful automated test for non-AI logic or an API
      endpoint.
- [x] Keep credentials out of Git and document only required AI configuration
      names in `.env.example`.
- [ ] Document local setup, architecture, AI choice, reliability, privacy,
      production next steps, and AI coding-tool usage concisely.
- [ ] Add one screenshot of the working end-to-end flow before submission.
- [ ] Submit the frontend, backend, and database/schema setup in one public
      repository.

## Minimal architecture

1. The React/Vite client will submit text to `POST /entries` on FastAPI.
2. Pydantic will validate input and the normalized model response.
3. A small service will call OpenRouter with an explicit JSON-output prompt.
4. The backend will validate one summary and exactly three tags before saving.
5. SQLite will store the original text, generated fields, and timestamps.
6. `GET /entries` and `GET /entries/{id}` will support the list/detail UI.

## Project structure

```text
InsightTag/
|-- backend/
|   |-- app/
|   |   |-- __init__.py
|   |   |-- database.py
|   |   |-- main.py
|   |   |-- routes.py
|   |   |-- schemas.py
|   |   `-- summarizer.py
|   |-- tests/test_entries.py
|   |-- requirements.txt
|   `-- requirements-dev.txt
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- index.css
|   |   `-- main.jsx
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
|-- .env.example
`-- README.md
```

## Backend development

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Run the backend tests with `.\.venv\Scripts\python.exe -m pytest -q`. The API
currently uses a deterministic summarizer stub; a later stage will replace it
with OpenRouter. React functionality, final documentation, and the screenshot
will also be added later.
