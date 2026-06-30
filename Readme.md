# Voice RAG Agent

Real-time voice AI assistant with document-grounded answers — talk to an agent over WebRTC (LiveKit) that retrieves context from your uploaded PDFs and answers via voice.

**Repo:** `https://github.com/singhxayush/voice-rag-agent`

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [bun](https://bun.sh) (JS package manager)
- [Docker](https://www.docker.com/) (for Qdrant)
- API keys: LiveKit Cloud, Google AI Studio (Gemini)

## Setup

### 1. Clone & configure environment variables

```bash
git clone https://github.com/singhxayush/voice-rag-agent.git
cd voice-rag-agent
```

Create `agent/.env.local`:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
GOOGLE_API_KEY=your_google_ai_studio_key
```

Create `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 2. Start Qdrant (vector store)

```bash
docker compose up -d
```

Runs Qdrant locally, persisted to `./qdrant_data`.

### 3. Install dependencies

```bash
cd agent
uv sync

cd ../frontend
bun install
```

## Running

Three processes, three terminals — all from the repo root unless noted.

**Terminal 1 — Qdrant** (if not already running)

```bash
docker compose up -d
```

**Terminal 2 — FastAPI backend** (upload, token, chat endpoints)

```bash
cd agent
uv run uvicorn src.api.server:app --reload
```

Runs on `http://localhost:8000`

**Terminal 3 — LiveKit voice agent**

```bash
cd agent
uv run python -m src.agent.main dev
```

Connects to LiveKit Cloud, waits for a room participant.

**Terminal 4 — Frontend**

```bash
cd frontend
bun run dev
```

Runs on `http://localhost:5173`

## Usage

1. Open `http://localhost:5173`
2. Upload a PDF — it's chunked, embedded (Gemini `text-embedding-004`), and stored in Qdrant
3. You're routed to a new chat session
4. Click **Start Call** — mic enables, agent greets you
5. Ask a question covered in your document — the agent retrieves relevant chunks and answers via voice

## Environment variables

### `agent/.env.local`

| Variable             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `LIVEKIT_URL`        | LiveKit Cloud WebSocket URL                             |
| `LIVEKIT_API_KEY`    | LiveKit API key                                         |
| `LIVEKIT_API_SECRET` | LiveKit API secret                                      |
| `GOOGLE_API_KEY`     | Google AI Studio key — used for Gemini LLM + embeddings |

### `frontend/.env.local`

| Variable            | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `VITE_API_BASE_URL` | FastAPI backend URL (default `http://localhost:8000`) |
| `VITE_LIVEKIT_URL`  | Same LiveKit Cloud URL as backend                     |

## Project structure

```
.
├── agent/
│   ├── src/
│   │   ├── agent/        # LiveKit voice agent (STT → RAG → LLM → TTS)
│   │   │   ├── main.py
│   │   │   └── rag.py
│   │   └── api/
│   │       └── server.py # FastAPI: /upload, /token, /chats, /ask
│   ├── tmp/               # uploaded PDFs (gitignored)
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/
│   ├── src/
│   │   ├── layouts/
│   │   ├── components/
│   │   └── lib/
│   ├── package.json
│   └── bun.lock
├── qdrant_data/            # Qdrant persistence (gitignored)
└── docker-compose.yml      # Qdrant only
```

## Known limitations & tradeoffs

- **Single Qdrant collection** — all documents share one collection, filtered by `doc_id` per query. Fine for demo scale.
- **No auth** — endpoints are open. Add API key middleware for production use.
- **Voice transcript persistence** — voice turns are not yet logged to the chat history DB; only typed text messages are persisted.
- **PDF only** — no support for other document formats yet.
- **Local Qdrant** — runs via Docker Compose, not managed/cloud. Swap for Qdrant Cloud for production.
