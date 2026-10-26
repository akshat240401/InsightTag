# InsightTag

InsightTag is a small AI content assistant for the IIFL Finance Full Stack
Developer Round 1 assessment. The intended flow accepts text, generates a
concise summary and exactly three tags, persists the result, and displays saved
entries.

## Assignment checklist

- [ ] Provide a frontend text form with loading and error states.
- [ ] Display a list of saved entries and allow an entry to be opened.
- [ ] Expose a small Python REST API for the frontend.
- [ ] Reject empty text and apply a reasonable input-length limit.
- [ ] Call one real LLM API and request a concise summary plus exactly three
      relevant tags.
- [ ] Parse and validate the model output into a predictable structure.
- [ ] Persist the original text, summary, and tags in SQLite across restarts.
- [ ] Gracefully surface at least one LLM failure mode, such as a timeout or
      malformed output.
- [ ] Add at least one useful automated test for non-AI logic or an API
      endpoint.
- [ ] Keep credentials out of Git and document only required AI configuration
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
|   |   `-- main.py
|   |-- tests/
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

Stage 1 contains scaffolding only. Feature implementation, persistence, LLM
integration, tests, final setup instructions, and the screenshot will be added
in later stages.
