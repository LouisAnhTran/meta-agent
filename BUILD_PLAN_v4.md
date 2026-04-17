# Customer Service Meta-Agent — Build Plan (Final)

## Project Overview

Build a unified customer service platform that combines two parts:
- **Part 1:** A working CS bot for Atome (created via the UI after deploy)
- **Part 2:** A meta-agent system where a manager can create, configure, and manage multiple CS agents

The key insight: Part 1's Atome bot is just the first agent created through the Part 2 meta-agent UI. One architecture serves both parts — no special-case code path for the default agent.

**Deployment flow:**
1. `docker compose up` brings everything up (empty database, no agents)
2. UI shows an empty state: "No agents yet. Click Create New Agent to get started."
3. Manager (you) creates the Atome agent through the UI before sharing the link
4. Interviewer visits and sees a working Atome chat as the default agent

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (React / Vite)                                  │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Agent List   │  │ Agent Editor │  │ Chat Window     │ │
│  │ + Create New │  │ (URL, Tools, │  │ + Mistake       │ │
│  │ + Empty State│  │  Instructions│  │   Report        │ │
│  └──────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────┬────────────────────────────────────┘
                      │ REST API
┌─────────────────────▼────────────────────────────────────┐
│  Backend (Python / FastAPI / LangGraph)                   │
│  ┌──────────┐ ┌───────────┐ ┌────────────────────────┐  │
│  │ Agent    │ │ Indexing   │ │ Chat Runtime           │  │
│  │ CRUD API │ │ Pipeline   │ │ (LangGraph ReAct)      │  │
│  └────┬─────┘ └─────┬─────┘ └──────────┬─────────────┘  │
│       │              │                   │                │
│       └──────────────┼───────────────────┘                │
│                      │                                    │
│       ┌──────────────▼──────────────┐                    │
│       │  PostgreSQL (+ pgvector)    │                    │
│       │  - agents                    │                    │
│       │  - kb_articles (+ vectors)   │                    │
│       │  - mistake_reports           │                    │
│       └──────────────────────────────┘                    │
│                                                           │
│       Calls out to:                                       │
│       - Claude (Anthropic) — chat + auto-fix              │
│       - OpenAI — embeddings only                          │
└───────────────────────────────────────────────────────────┘
                      ▲
                      │ Docker Compose on EC2
                      │ (Caddy + UI + API + DB)
```

**Tech Stack:**
- **Frontend:** React (Vite) + TailwindCSS
- **Backend:** Python 3.11+, FastAPI, LangGraph (`langchain-anthropic`, `langchain-openai` for embeddings)
- **Package management:** `uv` (pyproject.toml + uv.lock)
- **Database:** PostgreSQL 16 + pgvector extension (single source of truth: config, vectors, mistakes)
- **LLM:** Claude Sonnet 4.5 (chat, auto-fix)
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims)
- **Deployment:** Single EC2 instance running Docker Compose (Caddy + UI + API + DB)

---

## Key Design Principles

1. **One agent schema for Part 1 and Part 2.** Atome is just the first agent created via the UI. No seed script, no special code path.
2. **Zendesk API, not HTML scraping.** Works for any Zendesk help center — essential for Part 2 generality.
3. **Async indexing with status polling.** `asyncio.create_task` + `status` column + startup recovery. No message queue needed.
4. **System prompt is derived, not stored.** Shared base template in code (`services/prompts.py`) + per-agent instructions in DB, assembled at each chat request.
5. **Tool-calling handles everything.** KB search, business tools, and clarification questions all emerge from the same mechanism. No intent router.
6. **LangGraph `create_react_agent` is the runtime.** Pre-built ReAct loop; handles tool calling, iterations, and tool execution automatically.
7. **Locked tool parameters, editable descriptions.** Manager can rephrase instruction text but cannot change required function parameters.
8. **One article = one embedding.** Each article's title + body is embedded as a single chunk. Related questions come from same-section article titles (filtered to look like questions).
9. **pgvector in the same Postgres.** No external vector DB. One database, one set of credentials.
10. **"Run Fix" demonstrates itself.** Replays the original question against the updated agent; shows before/after in the UI.

---

## Implementation Notes (deviations & fixes from original plan)

| Area | Original Plan | Actual Implementation |
|------|--------------|----------------------|
| Backend Dockerfile | `uv sync --frozen` in Docker | Plain `pip install` — avoids `.venv` path issues inside container. `uv` still used locally. |
| Docker Compose | No pgAdmin | Added `pgadmin` service on port 5050 for local DB inspection |
| Docker Compose | No port on `api` | Exposed port `8000` for direct Swagger UI access at `localhost:8000/docs` |
| `config.py` | No extra fields | Added `extra = "ignore"` — root `.env` has Docker-only vars (DOMAIN, POSTGRES_*) that pydantic-settings would reject |
| `embeddings.py` | Module-level `AsyncOpenAI()` | Lazy-initialized — module-level init fails at import time without API key set |
| `zendesk.py` | `params={"per_page": 100}` on each request | Embed `?per_page=100` in initial URL only — Zendesk `next_page` already includes all params, passing `params={}` again causes infinite loop |
| `indexer.py` | `datetime.utcnow()` | Use `datetime.utcnow()` (naive) — asyncpg requires timezone-naive datetimes |
| Logging | Not in plan | Added `logging.basicConfig` in `main.py` so background task progress is visible in terminal |

---

## Step 1: Project Skeleton & Environment

**Goal:** Runnable project with frontend and backend that communicate, deployable via Docker Compose.

### Backend (`/backend`)

Use `uv` for dependency management.

```
backend/
├── pyproject.toml         # dependencies + project config
├── uv.lock                # pinned dependency tree
├── Dockerfile
├── .env.example
├── main.py                # FastAPI app, CORS, router includes, startup hooks
├── db.py                  # asyncpg pool + table creation
├── models.py              # Pydantic request/response models
├── config.py              # env var loading (pydantic-settings)
├── routers/
│   ├── agents.py          # CRUD endpoints for agents
│   ├── chat.py            # Chat endpoint
│   ├── mistakes.py        # Mistake report endpoints
│   ├── tools.py           # GET /api/tools — catalog for frontend
│   ├── proxy.py           # GET /api/proxy-article — iframe proxy for article viewer
│   └── health.py          # GET /api/health
└── services/
    ├── kb/
    │   ├── zendesk.py     # Zendesk Help Center API client
    │   └── indexer.py     # Crawl → embed → upsert pipeline (async)
    ├── tools.py           # Tool catalog + mock implementations
    ├── prompts.py         # BASE_SYSTEM_PROMPT + build_system_prompt()
    ├── runtime.py         # Chat runtime using LangGraph create_react_agent
    ├── mistakes.py        # Auto-fix logic + verification replay
    └── embeddings.py      # OpenAI embedding wrapper (batched)
```

### `pyproject.toml`

```toml
[project]
name = "cs-meta-agent-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "asyncpg>=0.30",
    "pgvector>=0.3",
    "httpx>=0.27",
    "python-dotenv>=1.0",
    "langchain-anthropic>=0.3",
    "langchain-openai>=0.2",
    "langgraph>=0.2",
    "openai>=1.50",
    "anthropic>=0.40",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "pytest-asyncio>=0.24",
    "ruff>=0.7",
]
```

### Frontend (`/frontend`)

```
frontend/
├── Dockerfile
├── package.json
├── vite.config.js
├── tailwind.config.js
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── components/
│   │   ├── AgentList.jsx        # Sidebar: list agents + "Create New" + empty state
│   │   ├── AgentEditor.jsx      # Edit agent: URL, instructions, tools
│   │   ├── ChatWindow.jsx       # Chat interface for selected agent
│   │   ├── MistakeReport.jsx    # Report mistake modal
│   │   └── MistakeDashboard.jsx # View mistakes + fix status + before/after
│   ├── api.js                   # API client (fetch wrappers)
│   └── index.css
```

### Docker Compose (`/docker-compose.yml`)

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-csagent}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 5s
      retries: 5
    restart: unless-stopped

  api:
    build: ./backend
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-csagent}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    restart: unless-stopped

  ui:
    build: ./frontend
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
      - ui
    restart: unless-stopped

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

### `Caddyfile`

```
{$DOMAIN:localhost} {
    handle_path /api/* {
        reverse_proxy api:8000
    }
    handle {
        reverse_proxy ui:3000
    }
}
```

### Backend `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.32" \
    "pydantic>=2.9" \
    "pydantic-settings>=2.6" \
    "asyncpg>=0.30" \
    "pgvector>=0.3" \
    "httpx>=0.27" \
    "python-dotenv>=1.0" \
    "langchain-anthropic>=0.3" \
    "langchain-openai>=0.2" \
    "langgraph>=0.2" \
    "openai>=1.50" \
    "anthropic>=0.40"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> **Note:** `uv` is used locally for dependency management (`uv sync`). The Docker image uses plain `pip install` to avoid venv path issues inside the container.

### Frontend `Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

### `.env.example` (at repo root)

```bash
DOMAIN=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme
POSTGRES_DB=csagent
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### Health Check

`GET /api/health` returns:
```json
{
  "status": "ok",
  "db": true,
  "anthropic": true,
  "openai": true
}
```
Each check is a lightweight probe (DB: `SELECT 1`, Anthropic/OpenAI: check API key is set). Returns HTTP 503 if any check fails.

**Acceptance criteria:**
- `docker compose up` brings everything up locally
- `curl localhost/api/health` returns `{"status":"ok", ...}`
- `curl localhost` serves the UI
- Frontend can call backend (proxied through Caddy, no CORS issues)

---

## Step 2: Database Schema & Agent CRUD

**Goal:** Postgres + pgvector tables + full CRUD API for agents. On first boot, the database is empty — no agents exist until the manager creates one via the UI.

### Schema

```sql
-- Enable pgvector extension (run once, handled in db.py at startup)
CREATE EXTENSION IF NOT EXISTS vector;

-- Agent configuration
-- NOTE: no system_prompt column — prompt is derived at request time from
-- base template (in code) + agent.name + agent.instructions
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    kb_url TEXT NOT NULL,
    instructions JSONB DEFAULT '[]',      -- list of {instruction_text, tool_name, display_order}
    status VARCHAR(20) DEFAULT 'ready',   -- ready | indexing | failed
    error_message TEXT,                   -- populated when status = 'failed'
    last_indexed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge base articles with embeddings
-- One row per article (article_title + body embedded together as one vector)
CREATE TABLE IF NOT EXISTS kb_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    source_article_id BIGINT,             -- Zendesk article id (for idempotent upserts)
    article_title TEXT NOT NULL,
    article_url TEXT NOT NULL,
    section_name TEXT,
    body_text TEXT NOT NULL,
    embedding vector(1536) NOT NULL,      -- pgvector, OpenAI text-embedding-3-small dims
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (agent_id, source_article_id)
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_kb_articles_embedding
    ON kb_articles USING hnsw (embedding vector_cosine_ops);

-- For "related questions from same section" lookup
CREATE INDEX IF NOT EXISTS idx_kb_articles_agent_section
    ON kb_articles (agent_id, section_name);

-- Mistake reports
CREATE TABLE IF NOT EXISTS mistake_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    user_message TEXT NOT NULL,
    bot_response TEXT NOT NULL,
    user_description TEXT,
    status VARCHAR(20) DEFAULT 'open',    -- open | fixed
    fix_comment TEXT,
    verified_response TEXT,               -- bot's new response after fix (auto-replay)
    created_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);
```

### API Endpoints

```
POST   /api/agents                  — Create agent (validates kb_url, triggers async indexing if kb_url provided)
GET    /api/agents                  — List all agents with status
GET    /api/agents/{id}             — Get single agent
PUT    /api/agents/{id}             — Update agent (accepts reindex flag — UI decides when to re-index)
DELETE /api/agents/{id}             — Delete agent (cascades kb_articles and mistakes)

POST   /api/agents/{id}/mistakes    — Report a mistake
GET    /api/agents/{id}/mistakes    — List mistakes for an agent
PUT    /api/mistakes/{id}/fix       — Run fix: diagnose, update instructions, replay + verify

GET    /api/tools                   — Return tool catalog (for frontend dropdown)

GET    /api/proxy-article?url=...   — Proxy a Zendesk article page for iframe rendering

GET    /api/health                  — Health check
```

### Agent Create Flow (`POST /api/agents`)

```python
1. Validate kb_url (REQUIRED)
   → If empty/null/missing: return 400 with message "kb_url is required"
   → parse_zendesk_url(kb_url)
   → If invalid format: return 400 with message "Not a recognized Zendesk help center URL: {url}"

2. Save agent to Postgres (name, kb_url, instructions)

3. Set status = 'indexing'
   → asyncio.create_task(run_indexing_pipeline(agent_id))

4. Return created agent (201)
```

### Agent Update Flow (`PUT /api/agents/{id}`)

Single endpoint handles all update scenarios. The `reindex` flag in the request body lets the frontend control when indexing happens.

```python
# Request body: { name, kb_url, instructions, reindex: bool (default false) }

1. Validate kb_url format
   → Return 400 if invalid

2. Save updated config to Postgres (name, kb_url, instructions)

3. If reindex flag is true:
   - Set status = 'indexing'
   - asyncio.create_task(run_indexing_pipeline(agent_id))
   - Pipeline will DELETE old embeddings before inserting new ones

4. Return updated agent
```

**Frontend controls when to re-index via the `reindex` flag:**
- "Save" button → sends `{ ...fields, reindex: false }`
- "Save & Re-index" button → sends `{ ...fields, reindex: true }`
- When URL changed, frontend only shows "Save & Re-index" (always sends `reindex: true`)

Note: there is no system prompt assembly step here. The system prompt is built fresh in the chat runtime from the stored `name` + `instructions`.

### Startup Recovery

On app startup:
```sql
UPDATE agents
SET status = 'failed', error_message = 'Interrupted by restart'
WHERE status = 'indexing';
```

This handles crashes/restarts that would otherwise leave agents stuck in `indexing`.

**Acceptance criteria:**
- `GET /api/agents` returns `[]` on first boot (empty database)
- Can create, read, update, delete agents via API
- `POST /api/agents` with missing or empty `kb_url` returns 400
- `POST /api/agents` with an invalid `kb_url` returns 400 with a clear error message
- `PUT /api/agents/{id}` with an invalid `kb_url` returns 400 with a clear error message
- `POST /api/agents` with a valid `kb_url` triggers async indexing (status goes to `indexing`)
- `PUT` with `reindex: true` triggers re-indexing
- `PUT` with `reindex: false` saves only, no re-indexing
- Old embeddings are deleted before new ones are inserted (no stale data from previous URL)
- `pgvector` extension is installed on first startup
- All tables auto-create with indexes
- Mistake reports can be created and listed per agent
- Startup recovery correctly handles stuck `indexing` rows
- Deleting an agent cascades to `kb_articles` and `mistake_reports`

---

## Step 3: Tool Catalog

**Goal:** Define the hardcoded tool catalog with mock implementations, exposed to the frontend for dropdown selection.

### Tool Catalog Definition (`services/tools.py`)

```python
TOOL_CATALOG = {
    "search_knowledge_base": {
        "name": "search_knowledge_base",
        "description": "Search the agent's knowledge base for answers to customer questions",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"}
            },
            "required": ["query"]
        },
        "always_enabled": True  # every agent gets this automatically
    },
    "get_application_status": {
        "name": "get_application_status",
        "description": "Look up a customer's card application status",
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "The customer's user ID"}
            },
            "required": ["user_id"]
        }
    },
    "get_transaction_status": {
        "name": "get_transaction_status",
        "description": ("Look up the status of a card transaction. "
                        "You MUST have a transaction ID before calling this — "
                        "if the customer has not provided one, ask them for it first."),
        "parameters": {
            "type": "object",
            "properties": {
                "transaction_id": {"type": "string", "description": "The transaction ID"}
            },
            "required": ["transaction_id"]
        }
    },
    "get_user_account": {
        "name": "get_user_account",
        "description": "Retrieve customer account details",
        "parameters": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "The customer's user ID"}
            },
            "required": ["user_id"]
        }
    },
    "escalate_to_human": {
        "name": "escalate_to_human",
        "description": "Escalate the conversation to a human support agent",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Reason for escalation"}
            },
            "required": ["reason"]
        }
    },
    "lookup_pricing": {
        "name": "lookup_pricing",
        "description": "Look up pricing information for a product or service",
        "parameters": {
            "type": "object",
            "properties": {
                "product_name": {"type": "string", "description": "Name of the product"}
            },
            "required": ["product_name"]
        }
    },
}
```

### Mock Implementations

All mocks return deterministic data based on input hash. Invalid inputs return error dicts (not raised exceptions) so the LLM can recover.

```python
def mock_get_application_status(user_id: str) -> dict:
    statuses = ["approved", "pending_review", "documents_required", "rejected"]
    status = statuses[hash(user_id) % len(statuses)]
    return {
        "user_id": user_id,
        "status": status,
        "application_date": "2025-03-15",
        "last_updated": "2025-04-10",
        "notes": f"Application is currently {status}."
    }

def mock_get_transaction_status(transaction_id: str) -> dict:
    import re
    if not re.match(r"^[A-Z0-9\-]{6,}$", transaction_id):
        return {
            "error": "invalid_transaction_id",
            "message": "Transaction ID format looks wrong. Please double-check it."
        }
    outcomes = [
        {"status": "failed", "reason": "insufficient_balance"},
        {"status": "failed", "reason": "merchant_declined"},
        {"status": "pending", "reason": "awaiting_settlement"},
        {"status": "completed", "reason": None},
    ]
    result = outcomes[hash(transaction_id) % len(outcomes)]
    return {
        "transaction_id": transaction_id,
        **result,
        "amount": 1500.00,
        "currency": "PHP",
        "date": "2025-04-12",
    }

# Similar mocks for get_user_account, escalate_to_human, lookup_pricing
```

### LangChain Tool Definitions

Each catalog entry is also exposed as a LangChain tool (using the `@tool` decorator) so LangGraph can call it:

```python
from langchain_core.tools import tool

@tool
def get_transaction_status(transaction_id: str) -> dict:
    """Look up the status of a card transaction. You MUST have a transaction ID
    before calling this — if the customer has not provided one, ask them for it first."""
    return mock_get_transaction_status(transaction_id)

# ... one @tool function per catalog entry

LANGCHAIN_TOOL_REGISTRY = {
    "get_application_status": get_application_status,
    "get_transaction_status": get_transaction_status,
    "get_user_account": get_user_account,
    "escalate_to_human": escalate_to_human,
    "lookup_pricing": lookup_pricing,
    # search_knowledge_base is built per-request (binds agent_id) — see Step 4
}
```

### API Endpoint

```
GET /api/tools
```
Returns the catalog for the UI dropdown. UI shows each tool's name, description, and parameters (parameters read-only, greyed out in the editor).

**Acceptance criteria:**
- `GET /api/tools` returns the catalog with names, descriptions, parameter schemas
- Each tool has a working mock that returns deterministic data
- Invalid inputs return error dicts, not raised exceptions
- `search_knowledge_base` is flagged as `always_enabled`

---

## Step 4: Indexing Pipeline (Zendesk API + Async + pgvector)

**Goal:** Given a Zendesk help-center URL, fetch all articles, embed each as one vector, upsert to pgvector. Non-blocking.

### Why Zendesk API (not HTML scraping)

Atome's help center runs on Zendesk, which exposes a public unauthenticated JSON API. This gives us:
- Clean article body + metadata in one call
- No Cloudflare 403s, no JS rendering, no pagination hell
- Works identically for **any** Zendesk help center — essential for Part 2 generality

URL pattern detection: `https://{host}/hc/{locale}/categories/{category_id}-{slug}`.

### Zendesk Client (`services/kb/zendesk.py`)

```python
import re, httpx

ZENDESK_URL_RE = re.compile(
    r"^(https?://[^/]+)/hc/([a-z-]+)/categories/(\d+)(?:-.*)?/?$"
)

def parse_zendesk_url(url: str) -> tuple[str, str, int]:
    """Extract (base_url, locale, category_id) from a Zendesk help center URL."""
    m = ZENDESK_URL_RE.match(url.strip())
    if not m:
        raise ValueError(f"Not a recognized Zendesk help center URL: {url}")
    return m.group(1), m.group(2), int(m.group(3))

async def fetch_sections(base: str, locale: str, category_id: int) -> dict[int, dict]:
    # NOTE: embed per_page in the URL directly — Zendesk's next_page already contains
    # all query params, so passing params={} again would cause an infinite loop.
    url = f"{base}/api/v2/help_center/{locale}/categories/{category_id}/sections.json?per_page=100"
    sections = {}
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            for s in data.get("sections", []):
                sections[s["id"]] = s
            url = data.get("next_page")
    return sections

async def fetch_articles(base: str, locale: str, category_id: int) -> list[dict]:
    url = f"{base}/api/v2/help_center/{locale}/categories/{category_id}/articles.json?per_page=100"
    articles = []
    async with httpx.AsyncClient(timeout=30) as client:
        while url:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            articles.extend(data.get("articles", []))
            url = data.get("next_page")
    return articles

def strip_html(html: str) -> str:
    """Minimal HTML → text. Good enough for embedding."""
    from html import unescape
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html or "", flags=re.S|re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()
```

### Indexing Pipeline (`services/kb/indexer.py`)

```python
async def run_indexing_pipeline(agent_id: str):
    """Runs as asyncio.create_task background task. Must not raise."""
    try:
        agent = await get_agent(agent_id)
        base, locale, category_id = parse_zendesk_url(agent.kb_url)

        # 1. Fetch sections + articles
        sections = await fetch_sections(base, locale, category_id)
        articles = await fetch_articles(base, locale, category_id)

        # 2. Clear existing vectors for this agent (transactional)
        await db.execute("DELETE FROM kb_articles WHERE agent_id = $1", agent_id)

        # 3. Prepare texts for embedding: title + body, one per article
        prepared = []
        for a in articles:
            body = strip_html(a["body"])
            if not body:
                continue
            section_name = sections.get(a["section_id"], {}).get("name", "Uncategorized")
            # Embed title + body together to capture both intent and content
            embed_text = f"{a['title']}\n\n{body}"
            prepared.append({
                "source_article_id": a["id"],
                "article_title": a["title"],
                "article_url": a["html_url"],
                "section_name": section_name,
                "body_text": body,
                "embed_text": embed_text,
            })

        # 4. Batch embed (OpenAI allows up to 2048 inputs per call)
        for batch in batched(prepared, 100):
            embeddings = await embed_batch([p["embed_text"] for p in batch])
            # Insert rows with embeddings
            async with db.transaction():
                for p, emb in zip(batch, embeddings):
                    await db.execute("""
                        INSERT INTO kb_articles
                            (agent_id, source_article_id, article_title, article_url,
                             section_name, body_text, embedding)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """, agent_id, p["source_article_id"], p["article_title"],
                    p["article_url"], p["section_name"], p["body_text"], emb)

        # 5. Mark ready
        await update_agent(agent_id, status="ready",
                          last_indexed_at=datetime.utcnow(),
                          error_message=None)

    except Exception as e:
        logger.exception(f"indexing failed for {agent_id}")
        await update_agent(agent_id, status="failed", error_message=str(e)[:500])
```

### Embedding Wrapper (`services/embeddings.py`)

```python
from openai import AsyncOpenAI
client = AsyncOpenAI()

async def embed_batch(texts: list[str]) -> list[list[float]]:
    # OpenAI text-embedding-3-small has max context of ~8192 tokens per input
    # Truncate to ~6000 chars as a safety margin (1 token ~= 4 chars)
    truncated = [t[:24000] for t in texts]
    resp = await client.embeddings.create(
        model="text-embedding-3-small",
        input=truncated
    )
    return [d.embedding for d in resp.data]

async def embed_single(text: str) -> list[float]:
    result = await embed_batch([text])
    return result[0]
```

### Async Trigger Pattern (inside PUT /api/agents/{id})

```python
@router.put("/api/agents/{agent_id}")
async def update_agent_endpoint(agent_id: str, body: UpdateAgentRequest):
    agent = await get_agent(agent_id)
    if not agent:
        raise HTTPException(404)

    try:
        parse_zendesk_url(body.kb_url)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

    # Save config
    updated = await save_agent(agent_id, body)

    # Reindex if the frontend says so (frontend sends reindex=true when
    # URL changed OR user clicked "Save & Re-index")
    if body.reindex:
        await update_agent(agent_id, status="indexing", error_message=None)
        asyncio.create_task(run_indexing_pipeline(agent_id))

    return updated
```

### `search_knowledge_base` Tool Implementation

Used by the chat runtime (Step 5). Built per-agent because it needs `agent_id` bound.

```python
def make_search_knowledge_base_tool(agent_id: str):
    @tool
    async def search_knowledge_base(query: str) -> dict:
        """Search the agent's knowledge base for answers to customer questions."""
        emb = await embed_single(query)

        # Top 3 most similar articles
        rows = await db.fetch("""
            SELECT id, article_title, article_url, section_name, body_text,
                   1 - (embedding <=> $1::vector) AS similarity
            FROM kb_articles
            WHERE agent_id = $2
            ORDER BY embedding <=> $1::vector
            LIMIT 3
        """, emb, agent_id)

        if not rows:
            return {"results": [], "related_questions": []}

        results = [
            {
                "article_title": r["article_title"],
                "article_url": r["article_url"],
                "section_name": r["section_name"],
                "body_text": r["body_text"][:2000],  # truncate to stay within context
                "similarity": float(r["similarity"]),
            }
            for r in rows
        ]

        # Related questions: other articles in the top article's section,
        # filtered to those that look like questions
        top_section = rows[0]["section_name"]
        top_article_id = rows[0]["id"]
        related_rows = await db.fetch("""
            SELECT article_title, article_url
            FROM kb_articles
            WHERE agent_id = $1
              AND section_name = $2
              AND id != $3
            LIMIT 15
        """, agent_id, top_section, top_article_id)

        related_questions = [
            {"question": r["article_title"], "url": r["article_url"]}
            for r in related_rows
            if looks_like_question(r["article_title"])
        ][:5]

        return {"results": results, "related_questions": related_questions}

    return search_knowledge_base


QUESTION_STARTERS = (
    "what", "why", "how", "can", "could", "do", "does", "did",
    "is", "are", "when", "where", "who", "which", "will",
    "would", "should", "may", "might", "am",
)

def looks_like_question(title: str) -> bool:
    t = title.strip().lower()
    if t.endswith("?"):
        return True
    return any(t.startswith(s + " ") for s in QUESTION_STARTERS)
```

### Agent Deletion

Postgres cascades handle cleanup:
- `kb_articles` → deleted via `ON DELETE CASCADE`
- `mistake_reports` → deleted via `ON DELETE CASCADE`

No external cleanup needed.

**Acceptance criteria:**
- `PUT /api/agents/{id}` with `reindex: true` triggers indexing in background; returns immediately
- Zendesk API is used (verify in network traffic during indexing)
- Non-Zendesk URLs return a 400 with a clear error message
- Old vectors are deleted before re-indexing
- After indexing the Atome KB, `kb_articles` has ~150 rows
- `search_knowledge_base` returns relevant results with body text + related questions filtered to only question-like titles
- Status updates: `ready → indexing → ready` (or `failed` with `error_message`)
- Startup recovery marks stuck `indexing` rows as `failed`

---

## Step 5: Chat Runtime — LangGraph `create_react_agent`

**Goal:** Core chat loop. Load agent → build tools → build system prompt → run ReAct agent → return response with metadata.

### System Prompt (`services/prompts.py`)

Shared base template in code. Per-agent customization via `name` and `instructions`. **No system_prompt column in DB.**

```python
BASE_SYSTEM_PROMPT = """You are a customer service assistant for {agent_name}.

Your job is to help customers by:
1. Answering questions from the knowledge base (use the search_knowledge_base tool).
2. Using the other tools available to you when they apply.
3. Asking clarifying questions when information is ambiguous or missing.

BEHAVIORAL RULES:
- Be polite, concise, and helpful.
- For questions answerable from the knowledge base, search it BEFORE responding.
- When a tool requires specific information (like a transaction ID), ask the customer for it if not provided. Tell them where to find it if helpful.
- When you answer from the knowledge base, cite the source article URL.
- If you can't help from the KB or tools, offer to escalate to a human.
- Never fabricate information. If the KB doesn't have an answer, say so.

{instructions_section}"""

INSTRUCTIONS_HEADER = "ADDITIONAL INSTRUCTIONS FROM THE MANAGER:"


def build_system_prompt(agent) -> str:
    """Assemble the full system prompt for an agent. Called per chat request."""
    if not agent.instructions:
        instructions_section = ""
    else:
        numbered = "\n".join(
            f"{i+1}. {ins['instruction_text']}"
            for i, ins in enumerate(agent.instructions)
        )
        instructions_section = f"{INSTRUCTIONS_HEADER}\n{numbered}"

    return BASE_SYSTEM_PROMPT.format(
        agent_name=agent.name,
        instructions_section=instructions_section,
    )
```

### Chat Runtime (`services/runtime.py`)

```python
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

llm = ChatAnthropic(model="claude-sonnet-4-5-20251001", max_tokens=2048)


async def run_chat(agent_id: str, messages: list[dict]) -> dict:
    agent = await get_agent(agent_id)

    # 1. Build per-request tools (search_knowledge_base binds this agent_id)
    search_tool = make_search_knowledge_base_tool(agent_id)

    # 2. Derive enabled tools from instructions (deduplicated)
    enabled_tool_names = {
        ins["tool_name"] for ins in agent.instructions
        if ins.get("tool_name")
    }

    tools = [search_tool]
    for name in enabled_tool_names:
        if name in LANGCHAIN_TOOL_REGISTRY and name != "search_knowledge_base":
            tools.append(LANGCHAIN_TOOL_REGISTRY[name])

    # 3. Build system prompt fresh
    system_prompt = build_system_prompt(agent)

    # 4. Create ReAct agent for this request
    executor = create_react_agent(
        model=llm,
        tools=tools,
        prompt=system_prompt,
    )

    # 5. Run it
    input_count = len(messages)  # track how many messages we sent in
    result = await executor.ainvoke({"messages": messages})

    # 6. Extract reply + references + related questions + tool calls
    #    IMPORTANT: only scan messages AFTER input_count — those are from THIS turn.
    #    Messages before input_count are history from previous turns and may contain
    #    stale search_knowledge_base results from earlier questions.
    new_messages = result["messages"][input_count:]

    final_message = new_messages[-1]
    reply_text = final_message.content

    tool_calls_log = []
    references = []
    related_questions = []

    for msg in new_messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                # Only log non-KB tool calls (KB results render as References, not tool cards)
                if tc["name"] != "search_knowledge_base":
                    tool_calls_log.append({"name": tc["name"], "args": tc["args"]})

        if getattr(msg, "name", None) == "search_knowledge_base":
            # Tool result message — extract references + related questions
            try:
                result_data = json.loads(msg.content) if isinstance(msg.content, str) else msg.content
                if isinstance(result_data, dict):
                    # References: articles used to generate the answer
                    for r in result_data.get("results", []):
                        references.append({
                            "article_title": r["article_title"],
                            "article_url": r["article_url"],
                        })
                    # Related questions from the same section
                    related_questions = result_data.get("related_questions", [])
            except Exception:
                pass

    return {
        "reply": reply_text,
        "references": references,
        "related_questions": related_questions,
        "tool_calls": tool_calls_log,
    }
```

### Chat Endpoint

```
POST /api/agents/{id}/chat
Body: { "messages": [ {"role": "user", "content": "..."}, ... ] }
Response: {
    "reply": "...",
    "references": [
        {
            "article_title": "How do I activate my card?",
            "article_url": "https://help.atome.ph/hc/en-gb/articles/..."
        }
    ],
    "related_questions": [
        {"question": "How to apply for a physical card?", "url": "https://..."}
    ],
    "tool_calls": [{"name": "...", "args": {...}}]
}

Guard: if agent.status != 'ready', return 503 with:
  - status = "indexing" → {"error": "Agent is currently indexing. Please wait."}
  - status = "failed"   → {"error": "Agent indexing failed. Please re-index before chatting."}
```

**Response fields:**
- `reply` — the LLM's text answer
- `references` — articles used to generate the answer (title + URL only; the Article Viewer panel uses the iframe proxy to render the full page)
- `related_questions` — other question-like articles from the same section (for clickable chips)
- `tool_calls` — non-KB tool calls like `get_transaction_status` (for inline rendering)

The frontend sends the full conversation history on every turn (conversations are React state, not persisted).

### Expected Behaviors

- **KB questions** → LLM calls `search_knowledge_base` → gets chunks → answers with citation
- **"What's my application status?"** → LLM asks for user_id (because tool requires it) → calls tool → answers
- **"I have a failed transaction"** → LLM asks for transaction_id → user provides → LLM calls tool → answers
- **Vague questions** → LLM asks for clarification naturally (emerges from system prompt rules)

**Acceptance criteria:**
- Chat with any `ready` agent works end-to-end
- Chat with an `indexing` agent returns 503 with "Agent is currently indexing" message
- Chat with a `failed` agent returns 503 with "Agent indexing failed" message
- KB questions trigger `search_knowledge_base` and return `references` (with article_title, article_url, body_text) + `related_questions`
- `search_knowledge_base` calls do NOT appear in `tool_calls` — they appear as `references` instead
- Application status flow works (asks for ID, calls tool)
- Failed transaction flow works (asks for ID, calls tool)
- Vague questions get clarification, not hallucinated answers
- Related questions appear in the response when KB search was used
- Only question-like article titles appear as related questions
- Non-KB tool calls are surfaced in `tool_calls` for UI display

---

## Step 6: Frontend — Agent List & Editor

**Goal:** UI for managing agents. Handles the "zero agents yet" case gracefully.

### Agent List (Sidebar)

- Lists all agents with name + status badge (`ready` / `indexing` / `failed`)
- "+ Create New Agent" button at top (prominent when empty)
- **Empty state:** when `GET /api/agents` returns `[]`, show a friendly prompt:
  ```
  ┌──────────────────────────────┐
  │  No agents yet.              │
  │                              │
  │  Click "+ Create New Agent"  │
  │  above to get started.       │
  │                              │
  └──────────────────────────────┘
  ```
- Clicking an agent → selects it (shows editor + chat panel)
- First agent in the list is auto-selected on load when at least one exists
- Sidebar polls `GET /api/agents` every 3s to refresh statuses (only while any agent is `indexing`)

### Agent Editor

- **Name field** — text input
- **KB URL field** — text input with a hint: *"Paste a Zendesk help-center category URL"*
  - Validated on save (400 if not a valid Zendesk URL)
  - If changed, only the "Save & Re-index" button is shown (re-indexing is mandatory)
- **Instructions section** — list of instruction cards
  - User can add as many instructions as they want (no upper limit in UI)
  - Each card has:
    - Textarea for instruction text (always shown)
    - "Bind to tool" dropdown (optional — some instructions are purely behavioral)
    - Read-only info panel (only shown when a tool is selected — see below)
    - Delete button
  - "+ Add Instruction" button at the bottom of the list

#### Tool-binding UX flow (per instruction card)

1. **Dropdown shows tool names only** — compact, one option per line:
   ```
   ┌──────────────────────────────────┐
   │ Select a tool (optional)    ▼    │
   ├──────────────────────────────────┤
   │ — None —                         │
   │ get_application_status           │
   │ get_transaction_status           │
   │ get_user_account                 │
   │ escalate_to_human                │
   │ lookup_pricing                   │
   └──────────────────────────────────┘
   ```
   `search_knowledge_base` is never shown (it's always enabled for every agent).

2. **Each tool can be bound to at most one instruction per agent.** Once a tool is selected in one instruction card, it is removed from the dropdowns of all other instruction cards on the same agent. Changing or clearing a selection makes that tool reappear in the other dropdowns.

   Example — if card 1 has selected `get_application_status`:
   - Card 1's dropdown still shows `get_application_status` as currently selected
   - Card 2's dropdown does NOT show `get_application_status` at all

3. **When a tool is selected, a read-only info panel expands below the dropdown**, styled with a grey background to signal "fixed, not editable":
   ```
   ┌─ ℹ️ Tool details (fixed) ──────────────────────────────┐
   │                                                        │
   │ Description:                                           │
   │   Look up the status of a card transaction. You MUST   │
   │   have a transaction ID before calling this — if the   │
   │   customer has not provided one, ask them for it       │
   │   first.                                               │
   │                                                        │
   │ Parameters:                                            │
   │   • transaction_id (string, required)                  │
   │     "The transaction ID"                               │
   │                                                        │
   │ 💡 You can rephrase the instruction text however you   │
   │    like — the tool always requires these parameters.   │
   └────────────────────────────────────────────────────────┘
   ```

4. **All tool metadata comes from `GET /api/tools`**, fetched once at page load and kept in frontend state. Nothing about the tool (description, parameters) is stored per instruction in the DB — the instruction only stores `tool_name` as a reference.

5. **Dangling references (defensive):** if an instruction has a `tool_name` that no longer exists in the catalog (e.g., a tool was removed from code), the dropdown shows the stale value as a disabled option labeled `⚠️ {name} (no longer available)` so the manager can see and fix it.

#### Save Button Logic

The save buttons change based on whether the `kb_url` has been modified:

**If `kb_url` changed** (compared to what's currently in DB):
```
┌──────────────────────────────┐
│  [ Save & Re-index ]         │  ← one button only, re-indexing is mandatory
└──────────────────────────────┘
```
URL changed = old embeddings are stale, must re-index. No option to skip.

**If `kb_url` is the same** (or agent has no URL):
```
┌──────────────────────────────────────────────────┐
│  [ Save ]         [ Save & Re-index ]            │
└──────────────────────────────────────────────────┘
```
Two buttons:
- **Save** — saves name + instructions only. Instant. No indexing.
  - Calls `PUT /api/agents/{id}` with `{ ...fields, reindex: false }`
  - Use case: manager edited instructions or added a tool binding
- **Save & Re-index** — saves everything + triggers re-indexing pipeline
  - Calls `PUT /api/agents/{id}` with `{ ...fields, reindex: true }`
  - Use case: KB content at the URL was updated, manager wants fresh embeddings

**For new agents** (`POST /api/agents`):
```
┌──────────────────────────────┐
│  [ Create Agent ]            │  ← single button, triggers indexing if URL provided
└──────────────────────────────┘
```

**Frontend logic (simplified):**
```javascript
const urlChanged = formData.kb_url !== originalAgent?.kb_url;

function renderButtons() {
  if (isNewAgent) {
    return <button onClick={handleCreate}>Create Agent</button>;
  }
  if (urlChanged) {
    return <button onClick={handleSaveAndReindex}>Save & Re-index</button>;
  }
  return (
    <>
      <button onClick={handleSaveOnly}>Save</button>
      <button onClick={handleSaveAndReindex}>Save & Re-index</button>
    </>
  );
}
```

### Status Polling Logic (Frontend)

```javascript
// After "Save & Re-index" or "Create Agent" with URL:
// 1. Receive 202 with status = "indexing"
// 2. Start polling every 2s:
async function pollStatus(agentId) {
  while (true) {
    await sleep(2000);
    const agent = await api.get(`/agents/${agentId}`);
    if (agent.status === "ready") {
      showToast("Indexing complete");
      return;
    }
    if (agent.status === "failed") {
      showToast(`Indexing failed: ${agent.error_message}`, "error");
      return;  // STOP polling on error
    }
    // still indexing → continue
  }
}
```

**Acceptance criteria:**
- Empty state renders when no agents exist
- Can create a new agent with name, URL, instructions, and tool selections
- Can add as many instructions as the user wants via "+ Add Instruction"
- Can edit an existing agent
- **Save buttons:** when URL changed → only "Save & Re-index" shown. When URL same → both "Save" and "Save & Re-index" shown.
- "Save" (no re-index) saves instantly — no status change, no spinner
- "Save & Re-index" triggers non-blocking re-indexing with status badge
- Polling stops immediately on `failed` status and shows error message
- Polling stops on `ready` and shows success toast
- Tool dropdown populated from `GET /api/tools`, showing tool names only
- When a tool is selected, the info panel expands below showing description + parameters, read-only
- Each tool can only be bound to one instruction per agent — already-selected tools disappear from other instructions' dropdowns
- Clearing or changing a tool selection makes it reappear in other dropdowns
- `search_knowledge_base` never appears in the dropdown (always enabled, not selectable)
- Stale `tool_name` references show as disabled `⚠️ {name} (no longer available)` options

---

## Step 7: Frontend — Chat Window

**Goal:** Chat UI for talking to the selected agent.

### Layout

- Three-column layout: agent list (left) | agent editor (middle, collapsible) | chat window (right)
- User messages right-aligned, bot messages left-aligned
- Input field at bottom with send button, Enter-to-send
- Flag icon 🚩 on each bot message → "Report Mistake" modal

### Chat Disabled States

The chat input is **disabled** when the agent is not ready. Show a clear message instead:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   No agent selected:                                 │
│   "Create an agent to start chatting"                │
│                                                      │
│   Agent status = "indexing":                         │
│   "⏳ Agent is indexing the knowledge base...        │
│    Chat will be available once indexing is complete." │
│   (input field greyed out, send button disabled)     │
│                                                      │
│   Agent status = "failed":                           │
│   "❌ Indexing failed. Please update the KB URL or    │
│    click 'Save & Re-index' to try again."            │
│   (input field greyed out, send button disabled)     │
│                                                      │
│   Agent status = "ready":                            │
│   (normal chat — input enabled, send works)          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Bot Response Layout

Each bot message that uses the knowledge base renders in three sections:

```
┌─ Bot Message ────────────────────────────────────────────┐
│                                                          │
│  To activate your Atome Card, open the Atome app, tap    │
│  the Card tab, enter the last 4 digits of your card,     │
│  and set a 4-digit PIN. You can then use it for both     │
│  online and in-store purchases.                          │
│                                                          │
│  📄 References:                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ • How do I activate my card?              [View]   │  │
│  │ • What are physical and virtual cards?    [View]   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  💡 Related questions:                                    │
│  [How to apply for a physical card?]                     │
│  [What is the physical card delivery time?]              │
│  [Can I get both virtual and physical cards?]            │
│                                                          │
│                                          🚩 Report       │
└──────────────────────────────────────────────────────────┘
```

**Section 1 — Answer:** The LLM's text response to the user's question.

**Section 2 — References:** Clickable article titles the agent used to generate the answer. Each has a `[View]` button. Clicking `[View]` opens the **Article Viewer Panel** (see below) — does NOT navigate away from the chat.

**Section 3 — Related questions:** Clickable chips from the same KB section (filtered to question-like titles). Clicking a chip **auto-populates the chat input** with that question text. User can review it and press Enter to send — they don't have to type it.

### Article Viewer Panel

A slide-out panel on the right side that renders the **actual Zendesk article page** in an iframe when the user clicks `[View]`. It looks exactly like visiting the URL in a browser — same styling, images, and formatting.

```
┌─ Chat Window ─────────────────┐┌─ Article Viewer ─────────────────┐
│                                ││  [Open in new tab ↗]    [Close] │
│  [chat messages...]            ││  ┌──────────────────────────────┐│
│                                ││  │                              ││
│  Bot: "To activate your..."   ││  │  (iframe rendering the       ││
│                                ││  │   actual Zendesk article     ││
│  📄 References:                ││  │   page — same styling,      ││
│  • How do I activate  [View]◄──┤│  │   images, layout as the    ││
│  • Physical vs virtual [View]  ││  │   original help center)     ││
│                                ││  │                              ││
│  💡 Related questions:         ││  │                              ││
│  [How to apply for...]         ││  │                              ││
│                                ││  └──────────────────────────────┘│
│  ┌──────────────────────────┐  │└──────────────────────────────────┘
│  │ Ask a question... [Send] │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

**Why a backend proxy is needed:**
Zendesk help centers set `X-Frame-Options: SAMEORIGIN`, which blocks direct iframe embedding from a different domain. The backend proxies the page HTML so the iframe loads from your own domain — bypassing the restriction.

**Backend endpoint (`GET /api/proxy-article`):**

```python
@router.get("/api/proxy-article")
async def proxy_article(url: str):
    """Fetch a Zendesk article page and return its HTML for iframe rendering."""
    # Validate the URL belongs to a known help center domain (prevent open proxy abuse)
    # For demo: simple prefix check. Production: validate against agent's kb_url domain.
    parsed = urlparse(url)
    if not parsed.scheme.startswith("http"):
        raise HTTPException(400, detail="Invalid article URL")

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()

    return HTMLResponse(content=r.text)
```

**Frontend component:**

```jsx
function ArticleViewer({ articleUrl, onClose }) {
  if (!articleUrl) return null;

  const proxyUrl = `/api/proxy-article?url=${encodeURIComponent(articleUrl)}`;

  return (
    <div className="article-viewer-panel">
      <div className="flex justify-between items-center p-3 border-b">
        <a href={articleUrl} target="_blank" rel="noopener noreferrer"
           className="text-blue-600 text-sm">
          Open in new tab ↗
        </a>
        <button onClick={onClose}>✕ Close</button>
      </div>
      <iframe
        src={proxyUrl}
        className="w-full h-full border-0"
        title="Article viewer"
        sandbox="allow-same-origin allow-popups"
      />
    </div>
  );
}
```

**Behavior:**
- Opens as a **right-side panel** (pushes or overlays the chat)
- Renders the actual Zendesk page via iframe + backend proxy — same styling, images, formatting as the original site
- **"Open in new tab ↗"** link opens the real `article_url` directly in a new browser tab
- **"Close"** button collapses the panel
- Only one article at a time — clicking a different `[View]` replaces the iframe `src`
- `sandbox="allow-same-origin allow-popups"` prevents the proxied page from running scripts that could affect your app

**Security note:** The proxy endpoint should validate that the URL belongs to a known help center domain. For the demo, a basic scheme check is sufficient. For production, validate against the agent's `kb_url` base domain to prevent open proxy abuse.

### Tool Calls Rendering

When a bot message has tool calls (other than `search_knowledge_base`), render them inline as collapsible cards:
```
┌────────────────────────────────────────┐
│ 🔧 get_transaction_status              │
│    transaction_id: "TXN-998877"        │
│    ✓ Status: failed (insufficient bal) │
└────────────────────────────────────────┘
[bot's text response]
```

`search_knowledge_base` tool calls are NOT shown as tool call cards — their results are rendered as the References section described above.

### Conversation State

- Stored entirely in React state (no backend persistence)
- Switching agents clears the chat
- Refreshing the page clears all conversations (documented as known limitation)

### Mistake Reporting Modal

Triggered by clicking the flag icon 🚩 on any bot message. Modal shows:
- User's question (read-only)
- Bot's response (read-only)
- Textarea: "What went wrong?"
- Submit → `POST /api/agents/{id}/mistakes`
- Success toast: "Mistake reported"

**Acceptance criteria:**
- Can chat with any `ready` agent
- Chat input is **disabled** when agent status is `indexing` — shows "Agent is indexing..." message
- Chat input is **disabled** when agent status is `failed` — shows "Indexing failed" message with guidance to re-index
- Chat input is **disabled** when no agent is selected — shows "Create an agent to start chatting"
- When agent transitions from `indexing` → `ready`, chat input **automatically enables** (from status polling)
- Bot responses show three clear sections: answer, references, related questions
- Clicking `[View]` on a reference opens the Article Viewer Panel with the actual Zendesk page rendered via iframe proxy
- Article Viewer looks the same as visiting the URL directly in a browser (same styling, images, layout)
- Article Viewer has an "Open in new tab ↗" link to open the real URL in a new browser tab
- Article Viewer can be closed, and clicking a different `[View]` replaces the content
- Related questions auto-populate the chat input on click (user presses Enter to send)
- `search_knowledge_base` results render as References, NOT as a raw tool call card
- Other tool calls (get_transaction_status, etc.) render as collapsible tool call cards
- Conversation resets on agent switch and page refresh
- Can report a mistake on any bot message

---

## Step 8: Mistake Dashboard & Run Fix with Verification

**Goal:** Display reported mistakes, allow manager to trigger a fix, and automatically demonstrate the fix worked.

### Feedback Report View

Accessed from agent editor via "Feedback Reports" tab. Lists all mistakes for the agent.

Each entry is a card showing:
- **User message** (what was asked)
- **Bot response** (original wrong answer)
- **User's feedback** (what went wrong — from the mistake report)
- **Status badge:** `Open` or `Fixed`

**Per-card controls, depending on status:**

**For `Open` mistakes:**
- A prominent **"Run Fix"** button on the card
- Clicking the button:
  1. Button shows a loading spinner + disabled state: `Fixing...`
  2. Frontend calls `PUT /api/mistakes/{id}/fix`
  3. Backend runs `auto_fix_mistake()` — this modifies the agent's instructions AND replays the original user message through the updated agent
  4. Response returns `{diagnosis, fix_comment, verified_response}` — this takes ~10–30 seconds (one LLM call for diagnosis + one full chat turn for replay)
  5. On success: the card re-renders as `Fixed`, showing the fix comment and the new replayed response (see "UI: Before/After Display" below)
  6. On failure (LLM returns bad JSON, replay errors): show a toast with the error, keep status as `Open` so the manager can retry

**For `Fixed` mistakes:**
- Show the `fix_comment` + `verified_response` inline (before/after layout)
- No button — for the demo, a mistake is fixed once. If the manager isn't satisfied, they can edit instructions manually in the agent editor.
- *(Future improvement, noted in README: allow "Re-fix" to re-run the fix on already-fixed mistakes.)*

**Empty state:** if no mistakes reported yet, show: *"No mistakes reported for this agent yet."*

### Fix Logic (`services/mistakes.py`)

Triggered by `PUT /api/mistakes/{id}/fix`.

```python
async def auto_fix_mistake(mistake_id: str) -> dict:
    mistake = await get_mistake(mistake_id)
    agent = await get_agent(mistake.agent_id)

    # 1. Ask Claude to diagnose + propose a fix
    fix_prompt = f"""A customer service bot made a mistake. Diagnose it and propose a fix
to the agent's instructions.

Current instructions:
{json.dumps(agent.instructions, indent=2)}

User asked: "{mistake.user_message}"
Bot responded: "{mistake.bot_response}"
User's feedback: "{mistake.user_description}"

Respond as a JSON object:
{{
  "diagnosis": "brief explanation of what went wrong",
  "instruction_change": {{
    "action": "add" | "modify" | "none",
    "index": <int, only for 'modify' — 0-based index of instruction to change>,
    "new_text": "the new or modified instruction text",
    "tool_name": "<optional — tool name from the catalog to bind to this instruction>"
  }},
  "fix_comment": "Describe the CONCRETE ACTION you performed. Examples:
    - 'Added new instruction (#3): When customers ask about card activation, direct them to the Atome app Card tab to enter last 4 digits and set PIN.'
    - 'Modified instruction #2: Changed from \"Look up the transaction\" to \"Always ask for transaction ID first before calling get_transaction_status.\"'
    - 'No change needed: The bot's response was actually correct based on the KB content.'
    State the action (added/modified/no change), which instruction number, and quote the key change."
}}"""

    response = await llm.ainvoke([{"role": "user", "content": fix_prompt}])
    fix = json.loads(response.content)

    # 2. Apply the instruction change
    new_instructions = list(agent.instructions)
    change = fix.get("instruction_change", {})
    if change.get("action") == "add":
        new_instructions.append({
            "instruction_text": change["new_text"],
            "tool_name": change.get("tool_name"),
            "display_order": len(new_instructions) + 1,
        })
    elif change.get("action") == "modify" and "index" in change:
        idx = change["index"]
        if 0 <= idx < len(new_instructions):
            new_instructions[idx]["instruction_text"] = change["new_text"]
            if change.get("tool_name"):
                new_instructions[idx]["tool_name"] = change["tool_name"]

    await update_agent_instructions(agent.id, new_instructions)

    # 3. VERIFICATION REPLAY: ask the same question to the updated agent
    # (system prompt is re-derived automatically because it's built from instructions)
    replay = await run_chat(
        agent.id,
        messages=[{"role": "user", "content": mistake.user_message}]
    )

    # 4. Mark fixed
    await update_mistake(
        mistake_id,
        status="fixed",
        fix_comment=fix["fix_comment"],
        verified_response=replay["reply"],
        resolved_at=datetime.utcnow(),
    )

    return {
        "diagnosis": fix["diagnosis"],
        "fix_comment": fix["fix_comment"],
        "verified_response": replay["reply"],
    }
```

### UI: Before/After Display

```
┌─ Mistake #1234 — FIXED ─────────────────────────────────┐
│                                                          │
│ User asked: "How do I activate my card?"                 │
│                                                          │
│ ❌ BEFORE (original bot response):                        │
│    "You need to call support to activate your card."     │
│                                                          │
│ 🚩 User's feedback:                                       │
│    "This is wrong — you activate in the app by entering  │
│    the last 4 digits and setting a PIN."                 │
│                                                          │
│ 🔧 Action taken:                                          │
│    Added new instruction (#3): "When customers ask about │
│    activating their card, direct them to the Atome app → │
│    Card tab → enter last 4 digits → set 4-digit PIN.    │
│    Use search_knowledge_base to find the exact steps."   │
│                                                          │
│ ✅ AFTER (replayed on updated agent):                     │
│    "To activate your Atome Card, open the Atome app, tap │
│    the Card tab, enter the last 4 digits of your card,   │
│    and set a 4-digit PIN."                               │
│                                                          │
│ 💡 To test the full conversation flow, try asking this   │
│    question in the chat window.                          │
└──────────────────────────────────────────────────────────┘
```

This directly addresses the brief's requirement: *"Your system can demonstrate in some way that the mistake has been fixed."*

**Acceptance criteria:**
- Feedback report view lists all mistakes with full context (user message, bot response, feedback)
- Each `Open` mistake has a prominent "Run Fix" button on its card
- Clicking "Run Fix" shows a loading state (`Fixing...` with spinner, button disabled)
- Backend flow runs: diagnose → update instructions → replay original message → save `verified_response`
- On success: card re-renders as `Fixed`, showing the action taken and the replayed response inline
- Fix comment describes the **concrete action**: which instruction was added/modified, the new text, and why — not a vague summary
- On failure (LLM error, bad JSON, replay failure): toast error, status stays `Open`, button becomes clickable again for retry
- Fixed cards have no "Run Fix" button — manager would edit instructions manually if unsatisfied
- Fixed cards show a hint: "To test the full conversation flow, try asking this question in the chat window."
- Empty state renders when no mistakes reported
- Mistake status transitions correctly: `open → fixed` with `resolved_at` set

---

## Step 9: Polish & Deployment (EC2)

**Goal:** Demo-ready deployment on a single EC2 instance.

### Polish Items

- **Loading states:** status badges during indexing, typing indicator during chat
- **Error handling:** toasts for API errors, display `error_message` on failed indexing
- **Empty states:** "No agents yet" (agent list), "No mistakes reported" (feedback tab), "Create an agent to start chatting" (chat window)
- **Chat UX:** auto-scroll to latest message, Enter-to-send, disable send while waiting
- **Tool calls:** collapsible cards with args + result

### Guided Product Tour (React Joyride)

**Goal:** When the interviewer first visits the app, a step-by-step walkthrough guides them through the full flow — no README reading needed.

**Library:** `react-joyride` (`npm install react-joyride`)

**Tour steps:**

```jsx
const TOUR_STEPS = [
  {
    target: '.create-agent-btn',
    title: 'Step 1: Create an Agent',
    content: 'Start by creating a customer service agent. Give it a name and paste a Zendesk help center URL.',
    disableBeacon: true,  // start immediately, no pulsing dot
  },
  {
    target: '.kb-url-input',
    title: 'Step 2: Knowledge Base URL',
    content: 'Paste a Zendesk help center category URL here (e.g., help.atome.ph/hc/en-gb/categories/...). The system will fetch and index all articles automatically.',
  },
  {
    target: '.instructions-section',
    title: 'Step 3: Add Instructions',
    content: 'Define how your agent should behave. Each instruction can optionally bind to a tool — the agent will call it when the instruction applies.',
  },
  {
    target: '.tool-dropdown',
    title: 'Step 4: Bind a Tool',
    content: 'Select a tool from the dropdown. Parameters are fixed (shown in grey), but you can rephrase the instruction text however you like.',
  },
  {
    target: '.save-reindex-btn',
    title: 'Step 5: Save & Index',
    content: 'Click "Save & Re-index" to save your agent and index the knowledge base. This takes about 30–60 seconds.',
  },
  {
    target: '.chat-input',
    title: 'Step 6: Chat With Your Agent',
    content: 'Once indexing is complete, ask your agent questions here. Try asking something from the knowledge base, or ask about a card application status!',
  },
  {
    target: '.mistake-flag',
    title: 'Step 7: Report a Mistake',
    content: 'If the agent gives a wrong answer, click this flag to report it. Describe what went wrong.',
  },
  {
    target: '.feedback-tab',
    title: 'Step 8: Review & Fix',
    content: 'View all reported mistakes here. Click "Run Fix" — the system will diagnose the issue, update the agent\'s instructions, and show you a before/after comparison.',
  },
];
```

**Behavior:**
- Tour starts automatically on **first visit only** (store `tourCompleted` in `localStorage`)
- Shows step counter: "Step 3 of 8"
- Each step highlights the relevant UI element with a tooltip card + arrow
- "Next" / "Back" / "Skip Tour" buttons on each card
- Tour can be re-triggered from a help icon (❓) in the header

**Implementation:**

```jsx
import Joyride, { STATUS } from 'react-joyride';

function App() {
  const [runTour, setRunTour] = useState(
    () => !localStorage.getItem('tourCompleted')
  );

  function handleTourCallback(data) {
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(data.status)) {
      localStorage.setItem('tourCompleted', 'true');
      setRunTour(false);
    }
  }

  return (
    <>
      <Joyride
        steps={TOUR_STEPS}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleTourCallback}
        styles={{ options: { primaryColor: '#3b82f6' } }}
      />

      <header>
        {/* Re-trigger tour button */}
        <button
          onClick={() => setRunTour(true)}
          title="Restart tour"
        >
          ❓
        </button>
      </header>

      {/* rest of your app */}
    </>
  );
}
```

**CSS class requirements:** Each target in the tour steps references a CSS class (`.create-agent-btn`, `.kb-url-input`, `.instructions-section`, `.tool-dropdown`, `.save-reindex-btn`, `.chat-input`, `.mistake-flag`, `.feedback-tab`). Make sure these classes are added to the corresponding elements in their respective components.

### EC2 Deployment

**Instance:** `t3.small` (2GB RAM) in `ap-southeast-1` (Singapore). ~$15/mo.

**Deployment steps (on EC2):**

```bash
# On EC2 (after Docker + compose installed via bootstrap.sh)
git clone <your-repo> /home/ubuntu/cs-agent
cd /home/ubuntu/cs-agent
cp .env.example .env
# edit .env with real values
docker compose up -d
# wait ~30s for db + api to be healthy
curl https://$DOMAIN/api/health   # should return 200
```

### Common Docker Commands

```bash
docker compose up --build      # build images and start all containers
docker compose up -d           # start in background (detached)
docker compose down            # stop and remove containers (data preserved)
docker compose down -v         # stop containers AND delete all volumes (wipes database)
docker compose logs -f api     # tail backend logs
docker compose ps              # show running containers
```

### Local Dev Mode (faster iteration — no full Docker rebuild)

Run only db + pgAdmin in Docker; backend and frontend run directly on the host.

```bash
# Terminal 1 — database only
docker compose up db pgadmin

# Terminal 2 — backend (hot reload)
cd backend
cp ../.env .env
uv sync
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 3 — frontend (hot reload)
cd frontend
npm install
npm run dev     # http://localhost:5173
```

Vite proxies `/api/*` to `localhost:8000` — no Caddy needed locally.
URLs: frontend → `http://localhost:5173`, API docs → `http://localhost:8000/docs`, pgAdmin → `http://localhost:5050`

### First-Time Setup (Manual, via UI)

After deploying, visit the public URL and create the Atome agent through the "Create New Agent" UI:

| Field | Value |
|-------|-------|
| **Name** | `Atome Card Support` |
| **KB URL** | `https://help.atome.ph/hc/en-gb/categories/4439682039065-Atome-Card` |
| **Instruction 1** | `If the customer is asking about their card application status, ask for their user ID, then look up the application status and tell them the result.` |
| **→ bind tool** | `get_application_status` |
| **Instruction 2** | `If the customer is asking about a failed card transaction, ask for the transaction ID, then look up the transaction status and tell them the result.` |
| **→ bind tool** | `get_transaction_status` |

After saving, the agent enters `indexing` status. Wait ~30–60 seconds for it to reach `ready`. Test with a few questions to verify. Then share the URL with the interviewer.

**Pro tip for demo day:** Do this the day before, not during the interview. If you want to demonstrate the meta-agent creating a bot from scratch, create a *second* agent during the demo (e.g., for a different Zendesk help center) — the Atome one is already there as "proof of working system."

### Pre-Demo Checklist

- [ ] `docker compose up` succeeds on EC2
- [ ] `/api/health` returns 200 with all checks green
- [ ] **Guided tour starts on first visit** — walks through all 8 steps correctly
- [ ] Tour can be skipped and re-triggered via ❓ button
- [ ] Atome agent created via UI and indexed successfully (`status = 'ready'`, ~150 articles)
- [ ] Chat works: KB question, application status flow, transaction status flow, vague question
- [ ] Related questions appear as clickable chips
- [ ] Report a mistake → run fix → before/after shown correctly
- [ ] Re-indexing works: "Save & Re-index" triggers pipeline, polls correctly
- [ ] "Save" without re-index saves instructions instantly (no spinner)
- [ ] Failed indexing (try a bad URL) → UI shows error and stops polling
- [ ] Create a second agent (e.g., another Zendesk help center) → verify full flow works

### Deployment Quick Reference

- **EC2 instance type:** `t3.small` (2GB RAM, ~$15/mo)
- **Region:** `ap-southeast-1`
- **EBS:** 20GB gp3
- **Security group:** 22/80/443 inbound
- **Elastic IP:** attached (so reboots don't change URL)
- **DNS:** Route 53 or Namecheap A record → Elastic IP
- **HTTPS:** Caddy auto-provisions Let's Encrypt cert on first request

---

## Step 9.5: README / Writeup

**Goal:** Satisfy the brief's submission requirements.

### README sections

**1. How AI was used**
- **Models:** Claude Sonnet 4.5 (chat + auto-fix), OpenAI `text-embedding-3-small` (embeddings only — Anthropic doesn't offer embeddings yet).
- **IDE / tools:** VS Code + Claude Code for scaffolding; Cursor for iteration.
- **What AI helped with:** initial architecture discussion, scaffolding code, prompt engineering for the auto-fix diagnosis prompt, debugging LangGraph integration.

**2. Assumptions**
- KB URLs are Zendesk help centers. Non-Zendesk URLs return a clear error. Fallback to a generic crawler (Firecrawl / Playwright) is a natural next step.
- One user (the interviewer). No auth for the demo.
- Conversations aren't persisted across page refresh.
- Mistake reports capture one user-bot message pair, not the full conversation.
- Tools are mocked; parameters are locked (manager rephrases descriptions via instruction text but cannot change required args).
- Fix is manager-triggered ("Run Fix" button), not fully automatic — gives the manager control over when changes are applied to the agent's instructions.
- System prompt is derived from a shared template + per-agent instructions; no per-agent prompt stored.
- No seed script — the Atome agent is created via the UI after deploy. This demonstrates that Part 1 and Part 2 share the same code path (Part 1 is just the first agent created through Part 2).

**3. Product decisions ("PM hat")**
- **Zendesk API over HTML scraping.** Generalizes immediately to any Zendesk help center — essential for Part 2.
- **pgvector over Pinecone.** At ~15K vectors max, dedicated vector DB is unjustified. One database, one set of credentials, transactional consistency between config/vectors/mistakes.
- **LangGraph `create_react_agent`.** Pre-built ReAct loop; tight fit for single-agent-per-request pattern; ~10 lines of agent setup.
- **Shared system prompt template.** Behavior consistency + one place to improve. Derived at request time from `agents.name` + `agents.instructions`, no storage duplication.
- **Before/after fix demonstration.** Directly addresses brief's "demonstrate the fix worked" requirement. Builds manager trust in the fix feature.
- **Related questions from same section.** Natural KB navigation; filter by question-like titles keeps the UX clean.
- **Locked tool parameters, editable descriptions.** Safety + flexibility tradeoff.
- **No seed script.** The Atome bot is created through the meta-agent UI, proving the architecture is unified between Part 1 and Part 2.
- **No MCP.** MCP is the right abstraction for federated tool access across multiple LLM clients. For a single-UI demo with ~6 mocked tools, native tool calling via LangGraph is simpler.
- **Guided product tour.** First-visit onboarding walkthrough (React Joyride) guides the interviewer through the full flow step-by-step — no README reading needed. Re-triggerable via a help button.

**4. Known limitations / what I'd add with more time**
- **Persistent job queue** — `asyncio.create_task` is sufficient for a single-VM demo; production would need arq / Celery / DB-backed queue.
- **Conversation persistence** — mistake reports lose context when the chat is just one message pair.
- **Fully automatic fix** — trigger fix immediately on mistake report without manager clicking "Run Fix"; manager reviews results after the fact.
- **Evals harness** — regression tests on golden questions to prevent fixes from breaking other behaviors.
- **Fallback crawler** — for non-Zendesk help centers.
- **Multi-user auth** — session management, per-manager agent ownership, audit log.
- **Streaming responses** — LangGraph supports it out of the box; the UI doesn't yet.

### First-time setup block

Include the Atome agent config table (from Step 9) prominently in the README so the interviewer can reproduce the setup if they want to run the repo locally.

---

## Build Order Summary

Feed these to Claude Code **one step at a time**. Each step must be working before moving to the next.

| Step | What | Depends On |
|------|------|------------|
| 1 | Project skeleton + Docker Compose + health check | Nothing |
| 2 | Database schema (with pgvector) + Agent CRUD + startup recovery | Step 1 |
| 3 | Tool catalog + mock functions + LangChain tool wrappers | Step 1 |
| 4 | Zendesk indexing pipeline (async, pgvector) + search_knowledge_base | Steps 2, 3 |
| 5 | Chat runtime with LangGraph `create_react_agent` + system prompt builder | Steps 3, 4 |
| 6 | Frontend: Agent list + editor + empty state + status polling | Steps 2, 3 |
| 7 | Frontend: Chat window + related questions + tool call rendering | Steps 5, 6 |
| 8 | Feedback reports + run fix + verification replay | Steps 5, 7 |
| 9 | Polish + EC2 deploy | All above |
| 9.5 | README / Writeup (includes first-time Atome agent setup) | All above |

---

## Quick Reference: What's in Code vs What's in DB

| Thing | Where it lives |
|------|----------------|
| Base system prompt template | Code (`services/prompts.py`) |
| Agent name | DB (`agents.name`) |
| Agent instructions | DB (`agents.instructions` JSONB) |
| Assembled system prompt | Derived per request (`build_system_prompt(agent)`) |
| Tool catalog | Code (`services/tools.py`) |
| Tool mock functions | Code (`services/tools.py`) |
| Which tools are enabled for an agent | Derived from `agents.instructions[].tool_name` |
| KB article embeddings | DB (`kb_articles.embedding`) |
| Mistake reports + fixes | DB (`mistake_reports`) |
| Chat conversations | Frontend React state (ephemeral) |

## What Does NOT Exist

| Thing | Why |
|------|-----|
| `seed.py` | Atome agent is created via the UI after deploy — no pre-seeding |
| `agents.system_prompt` column | Derived from template + instructions at request time |
| `article_questions` table | Related questions come from same-section article titles with a question filter |
| Pinecone integration | Replaced by pgvector in the same Postgres |
| Intent classifier / router | LLM's native tool-calling handles KB / business tools / clarification uniformly |
