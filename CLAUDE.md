# CS Meta-Agent

A customer service meta-agent platform where managers create, configure, and manage AI-powered CS agents via a web UI. Each agent has a Zendesk knowledge base, configurable instructions, and bindable tools.

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, LangGraph (`create_react_agent`), `uv` for packages
- **Frontend:** React (Vite) + TailwindCSS + react-joyride
- **Database:** PostgreSQL 16 + pgvector (single DB for config, vectors, and mistakes)
- **LLM:** Claude Sonnet 4.5 via `langchain-anthropic` (chat + auto-fix)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims) via `langchain-openai`
- **Deployment:** Docker Compose on EC2 (Caddy + UI + API + DB)

## Project Structure

```
backend/
├── main.py                # FastAPI app, CORS, startup hooks
├── db.py                  # asyncpg pool + table creation
├── models.py              # Pydantic request/response models
├── config.py              # pydantic-settings env loading
├── routers/
│   ├── agents.py          # CRUD + reindex (PUT with reindex flag)
│   ├── chat.py            # POST /api/agents/{id}/chat
│   ├── mistakes.py        # Report + run fix
│   ├── tools.py           # GET /api/tools (catalog)
│   ├── proxy.py           # GET /api/proxy-article (iframe proxy)
│   └── health.py          # GET /api/health
└── services/
    ├── kb/zendesk.py      # Zendesk Help Center API client
    ├── kb/indexer.py       # Crawl → embed → upsert (async background task)
    ├── tools.py           # Tool catalog + mock implementations
    ├── prompts.py         # BASE_SYSTEM_PROMPT template + build_system_prompt()
    ├── runtime.py         # Chat runtime using create_react_agent
    ├── mistakes.py        # Fix logic + verification replay
    └── embeddings.py      # OpenAI embedding wrapper

frontend/src/components/
├── AgentList.jsx          # Sidebar + empty state
├── AgentEditor.jsx        # URL, instructions, tool binding, save buttons
├── ChatWindow.jsx         # Chat + references + related questions + article viewer
├── MistakeReport.jsx      # Report modal
└── MistakeDashboard.jsx   # Feedback reports + run fix + before/after
```

## Key Architecture Decisions

1. **No system_prompt column in DB.** Shared base template lives in `services/prompts.py`. Assembled per-request from `agents.name` + `agents.instructions`.
2. **No seed script.** First agent created via UI after deploy.
3. **Zendesk API, not HTML scraping.** `parse_zendesk_url()` extracts base/locale/category_id. Non-Zendesk URLs → 400.
4. **One article = one embedding.** Title + body embedded together. No chunking.
5. **`search_knowledge_base` is a LangGraph tool**, same as business tools. No router/classifier.
6. **Tool parameters are locked.** Manager edits instruction text only. Params come from `TOOL_CATALOG` in code.
7. **Each tool bound to at most one instruction per agent.** Frontend filters dropdowns.
8. **Async indexing:** `asyncio.create_task` + `agents.status` column + startup recovery.
9. **Reindex controlled by frontend:** `PUT /api/agents/{id}` with `reindex: bool` flag.
10. **Related questions:** Same-section articles filtered by `looks_like_question()` (ends with `?` or starts with question word).
11. **References vs tool_calls:** `search_knowledge_base` results → `references` array. Other tool calls → `tool_calls` array. Never mixed.
12. **Article Viewer:** iframe + backend proxy (`/api/proxy-article`) to bypass Zendesk's X-Frame-Options.
13. **Fix verification:** After applying instruction changes, replay original question through updated agent. Store as `verified_response`.

## Database Tables

- `agents` — id, name, kb_url (NOT NULL), instructions (JSONB), status, error_message, last_indexed_at
- `kb_articles` — id, agent_id, source_article_id, article_title, article_url, section_name, body_text, embedding vector(1536)
- `mistake_reports` — id, agent_id, user_message, bot_response, user_description, status, fix_comment, verified_response

## Chat Response Format

```json
{
  "reply": "...",
  "references": [{"article_title": "...", "article_url": "..."}],
  "related_questions": [{"question": "...", "url": "..."}],
  "tool_calls": [{"name": "...", "args": {...}}]
}
```

Only `references` and `related_questions` from CURRENT turn (use `input_count = len(messages)` to slice `new_messages`).

## Conventions

- Use `asyncpg` for database access (not SQLAlchemy)
- Use `httpx.AsyncClient` for HTTP calls
- All tool mock functions return dicts (never raise) — errors as `{"error": "...", "message": "..."}`
- Background tasks: `asyncio.create_task` with try/except that updates `agents.status` to `failed` on error
- Frontend state only for conversations (no backend persistence for chat history)
- Tailwind dark mode: `darkMode: 'class'`, custom purple/blue palette in `dark.*` colors
- `localStorage` for theme preference and tour completion state
