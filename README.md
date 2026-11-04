# MindMate AI

A private, empathetic emotional-wellness companion rebuilt from the original Python/Streamlit project as a **vanilla JavaScript** web application. MindMate keeps the original purple identity, five-level mood tracking, emotional memory, self-care reminders and crisis guidance — then adds a faster interface, streaming replies and a clean REST API.

There is **no React, Vue, Angular, Next.js, TypeScript, JSX or Tailwind**. The browser receives plain HTML, CSS and ES modules. The server is Node.js + Express with JSON storage.

---

## Highlights

- **Emotional chat** with token-by-token streaming from a local Ollama model (`phi-mindmate` by default).
- **Context-aware replies** built from recent turns, recorded mood and recalled emotional memories.
- **Five emotional tones** (Struggling → Thriving) that adjust the companion's warmth and suggestions.
- **Crisis override**: direct risk language bypasses the model and streams vetted safety guidance with hotlines. A support modal is always available.
- **Mood tracker**: check-ins, Chart.js trend chart, streaks, averages, editable history and range filters.
- **Emotional memory**: automatically noted from conversation, reviewable, resolvable, re-openable, searchable and clearable. Memory can be paused at any time.
- **Self-care space**: reminder catalogue, random prompts, custom reminders, history and optional browser notifications.
- **Conversation history**: search, sort, rename, open and delete. Long histories are summarized for context.
- **Dashboard** with live statistics, a mood chart, recent conversations and a quick check-in.
- **Settings** for display name, theme (light / dark / system), reduced motion, memory, notifications, AI status and data export/reset.
- **Responsive shell**: off-canvas navigation and conversation drawer on phones, accessible modals, keyboard-friendly controls.
- **Local by default**: data stays in local JSON/CSV files; the server binds to `127.0.0.1` unless configured otherwise.

> MindMate is a supportive companion, **not a therapist** and not a substitute for professional care. If you are in immediate danger, contact your local emergency number. The app includes crisis resources for this reason.

---

## Technology

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Frontend | HTML5, CSS3, vanilla ES modules, Chart.js 4, Lucide icons     |
| Backend  | Node.js, Express 4, REST/JSON, ES modules                     |
| AI       | Ollama chat API with NDJSON streaming                         |
| Storage  | JSON documents, CSV mood log, plain-text reminders            |
| Tests    | Node's built-in test runner with a mocked Ollama server       |

Chart.js and Lucide are vendored in `public/vendor/`, so the app runs offline. There is no frontend build step.

---

## Requirements

- **Node.js 20.10+** (Node 22+ recommended; the optional Chroma importer uses `node:sqlite`)
- **npm**
- **Ollama** for AI replies — everything else still works without it

---

## Quick start

```powershell
cd E:\mindmate-ai
npm install
Copy-Item .env.example .env     # optional; defaults work
npm start
```

Open <http://127.0.0.1:3000>.

For development with automatic restarts:

```powershell
npm run dev
```

### 1. Install and start Ollama

If Ollama is not installed (Windows):

```powershell
winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
```

Open a **new** terminal afterwards so `ollama` is on your PATH. The Windows
installer starts Ollama automatically in the background and it listens on
`http://127.0.0.1:11434`.

To start it manually (macOS/Linux, or if it is not already running):

```powershell
ollama serve
```

### 2. Use the existing model

If `phi-mindmate` is already installed:

```powershell
ollama list
```

The app shows **AI ready** in the header and in **Settings → Connection** once the model is reachable.

### 3. Or recreate the companion model

The original Modelfile is preserved at `data/legacy/training/phi-mindmate.modelfile`:

```powershell
ollama pull phi
ollama create phi-mindmate -f data/legacy/training/phi-mindmate.modelfile
```

To use a different model, set `OLLAMA_MODEL` in `.env`.

### 4. Optional embeddings

Knowledge retrieval works with a local lexical fallback. For Ollama embeddings:

```powershell
ollama pull nomic-embed-text
```

---

## Configuration

Copy `.env.example` to `.env` and adjust as needed.

| Variable                | Default                     | Purpose                                                        |
| ----------------------- | --------------------------- | -------------------------------------------------------------- |
| `PORT`                  | `3000`                      | HTTP port                                                      |
| `HOST`                  | `127.0.0.1`                 | Bind address. Use `0.0.0.0` only on a trusted network           |
| `NODE_ENV`              | `development`               | `production` enables cache headers for static assets           |
| `OLLAMA_BASE_URL`       | `http://127.0.0.1:11434`    | Ollama server URL                                              |
| `OLLAMA_MODEL`          | `phi-mindmate`              | Chat model name                                                |
| `OLLAMA_EMBED_MODEL`    | `nomic-embed-text`          | Optional embedding model                                       |
| `OLLAMA_TIMEOUT_MS`     | `60000`                     | Upstream reply timeout (minimum 5s)                            |
| `MAX_CONTEXT_MESSAGES`  | `12`                        | Recent messages sent as conversation context (minimum 4)       |
| `DATA_DIR`              | `./data`                    | Where wellness data is stored (absolute or project-relative)   |
| `SEED_LEGACY`           | `true`                      | Import preserved legacy chat logs when the conversation store is empty |

---

## Data and migration

All working data lives in `DATA_DIR` (default `./data`):

```
data/
├─ conversations.json   chats and messages
├─ mood_logs.csv        timestamp,mood rows
├─ reminders.txt        one reminder per line
├─ memory.json          active/resolved emotional notes
├─ settings.json        display name, theme, toggles
├─ knowledge.json       retrieval documents
├─ vector_index.json    generated embedding index (gitignored)
├─ backups/             timestamped backups before destructive actions
└─ legacy/              untouched copy of the original Python project + data
```

The original project was imported and preserved. The working store currently contains the migrated conversations, mood rows, reminders, memories and knowledge documents. Nothing in `data/legacy/` is modified by the app.

To import another copy of the legacy project:

```powershell
npm run import:legacy -- --from "C:\path\to\mindmate_ai"
```

Options:

- `--no-copy` — import data without copying the Python source
- `--no-memory` — skip legacy memory import
- `--reset-knowledge` — rebuild knowledge documents from the source

The importer merges by default and never deletes source files.

### Backups and resets

Reset actions in **Settings → Your data** create a backup in `data/backups/` first. Resetting conversations keeps moods, memories and reminders; resetting preferences keeps the rest. Export downloads a complete JSON copy of your data.

---

## Deploying on Vercel

The app ships with a serverless adapter (`api/index.js`) and `vercel.json`, so it runs on Vercel. **Read the limits first** — Vercel is stateless and cannot run Ollama:

| Limitation | Consequence |
| ---------- | ----------- |
| Filesystem is read-only except `/tmp`, which resets on every cold start | Conversations, moods, memories and reminders are **temporary** and can differ between instances. Set `DATA_DIR=/tmp/mindmate`. For durable data, host elsewhere or replace the JSON store with a database. |
| No GPU / no local services | Ollama must run somewhere reachable over public HTTPS. `127.0.0.1:11434` will not work. |
| Hobby functions stop at 60 s | A CPU reply can take 30–90 s. Keep `OLLAMA_TIMEOUT_MS` below the limit, use a GPU host, or upgrade the plan for a longer `maxDuration`. |
| Deployments are public URLs and the app has no accounts | Anyone with the link can read and write the data. Enable **Deployment Protection** (password) or add authentication before storing anything real. |

### Environment variables

| Variable | Value on Vercel | Notes |
| -------- | --------------- | ----- |
| `OLLAMA_BASE_URL` | `https://your-ollama-host` | **Required.** Public HTTPS URL; no trailing slash |
| `OLLAMA_MODEL` | `phi-mindmate` | Required if you named the model differently |
| `DATA_DIR` | `/tmp/mindmate` | The only writable path |
| `NODE_ENV` | `production` | Enables production caching |
| `SEED_LEGACY` | `false` | Avoids re-importing on every cold start |
| `OLLAMA_TIMEOUT_MS` | `55000` | Must stay below `maxDuration` (60 s) |
| `MAX_CONTEXT_MESSAGES` | `12` | Recent turns sent as context |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Optional; omit if not installed remotely |

Do **not** set `PORT` or `HOST` on Vercel — the platform provides them.

### Deploy

```powershell
npm i -g vercel
vercel            # first run links the project and creates a production deploy
vercel --prod     # later production deploys
```

Or push to GitHub/GitLab and import the repository at <https://vercel.com/new>. Add the variables above under **Project → Settings → Environment Variables**, then redeploy.

Vercel serves `public/**` from its CDN and forwards `/api/*` to `api/index.js`. Locally the same app still runs through `npm start`.

### Reaching Ollama from Vercel

Ollama has to be exposed over HTTPS. Two common options:

1. **Tunnel to your own machine** (free, machine must stay on):
   ```powershell
   cloudflared tunnel --url http://127.0.0.1:11434
   ```
   Use the printed `https://….trycloudflare.com` URL as `OLLAMA_BASE_URL`. Note that a tunnel URL is public — put Cloudflare Access in front of it, or accept that anyone who learns it can use your model.
2. **GPU host** (RunPod, Fly.io with a GPU, a VPS). Install Ollama, pull `phi`, create `phi-mindmate`, expose port `11434` behind HTTPS and authentication.

### A better fit for real data

For a personal wellness app, a host with a persistent disk keeps everything in one place:

- **Render / Railway / Fly.io** with a volume mounted at `/var/data`
- Any small VPS running `npm start` behind Caddy or Nginx

There set `DATA_DIR=/var/data`, `HOST=0.0.0.0`, `PORT=10000` (or the platform's port) and keep `OLLAMA_BASE_URL` pointed at your model host.

---

## Privacy and safety

- The server listens on loopback by default. It does not send wellness data to a third party; AI requests go only to your local Ollama server.
- No accounts, analytics, trackers or external CDNs are used.
- The interface states clearly that MindMate is not a therapist.
- Crisis language is detected before the model is called. The curated response and hotline modal are always available, even when Ollama is offline.
- Memory is capped (50 active / 100 total), excludes sensitive identifiers, and can be paused or cleared from **Memories**.
- Destructive actions require confirmation and produce a server-side backup.
- HTML from model output is escaped; only a small, safe Markdown subset is rendered.

---

## API overview

All endpoints are under `/api` and return JSON unless noted.

| Method   | Endpoint                     | Description                                          |
| -------- | ---------------------------- | ---------------------------------------------------- |
| `POST`   | `/api/chat`                  | Stream a reply as NDJSON (`meta`, `delta`, `done`, `error`) |
| `GET`    | `/api/conversations`         | List/search conversations (`q`, `limit`, `offset`)   |
| `POST`   | `/api/conversations`         | Create an empty conversation                         |
| `GET`    | `/api/conversations/:id`     | Read one conversation                                |
| `PATCH`  | `/api/conversations/:id`     | Rename                                               |
| `DELETE` | `/api/conversations/:id`     | Delete                                               |
| `GET`    | `/api/mood`                  | Mood entries and summary (`range`)                   |
| `POST`   | `/api/mood`                  | Save a check-in                                      |
| `DELETE` | `/api/mood/:id`              | Delete a check-in                                    |
| `GET`    | `/api/reminders`             | Catalogue, history and latest reminder               |
| `POST`   | `/api/reminders`             | Save a catalogue, random or custom reminder          |
| `DELETE` | `/api/reminders/:id`         | Remove a reminder                                    |
| `DELETE` | `/api/reminders`             | Clear reminder history                               |
| `GET`    | `/api/memory`                | Active and resolved memories                         |
| `POST`   | `/api/memory`                | Add a memory                                         |
| `PATCH`  | `/api/memory/:id`            | Resolve or re-open                                   |
| `DELETE` | `/api/memory/:id`            | Delete a memory                                      |
| `DELETE` | `/api/memory`                | Clear `active`, `resolved` or `all`                  |
| `GET`    | `/api/settings`              | Read preferences                                     |
| `PATCH`  | `/api/settings`              | Update preferences                                   |
| `GET`    | `/api/dashboard`             | Dashboard payload                                    |
| `GET`    | `/api/health`                | Server, Ollama, model and vector status              |
| `GET`    | `/api/safety`                | Crisis resources and disclaimer                      |
| `GET`    | `/api/knowledge`             | Retrieval knowledge summary                          |
| `GET`    | `/api/data/export`           | Download all wellness data as JSON                   |
| `POST`   | `/api/data/reset`            | Reset a scope after backups (requires `confirm:true`) |

Validation errors return `{ "error": { "code", "message", "hint?" } }` with an appropriate HTTP status. Chat requests are rate-limited more tightly than reads. Use `GET /api` for the machine-readable endpoint index.

### Chat stream example

```
POST /api/chat
{ "message": "I feel overwhelmed today", "conversationId": "conv_…", "moodLevel": 2 }

{"type":"meta","conversationId":"conv_…","userMessage":{…},"turnId":"…"}
{"type":"delta","content":"I hear you…"}
{"type":"done","message":{…},"conversation":{…},"followUp":"…"}
```

`turnId` is optional but lets the client reconcile a reply that finished just as the user pressed **Stop**. Aborted turns are rolled back server-side; a completed reply is never duplicated.

---

## Project structure

```
mindmate-ai/
├─ public/
│  ├─ index.html              single-page shell and all view markup
│  ├─ css/
│  │  ├─ style.css            design tokens, layout, light/dark themes
│  │  ├─ components.css       cards, chat, charts, modals, forms
│  │  └─ responsive.css       tablet/mobile breakpoints
│  ├─ js/
│  │  ├─ app.js               boot, navigation, shared shell
│  │  ├─ router.js            hash router
│  │  ├─ api.js               REST client + NDJSON streaming
│  │  ├─ store.js             shared persisted UI state
│  │  ├─ ui.js                modals, toasts, theme, formatting
│  │  ├─ charts.js            Chart.js wrappers
│  │  ├─ constants.js         moods, self-care catalogue
│  │  ├─ support.js           crisis/support modal
│  │  └─ views/               dashboard, chat, mood, memories, selfcare,
│  │                          history, settings
│  └─ vendor/                 Chart.js and Lucide
├─ server/
│  ├─ server.js               startup, migrations, graceful shutdown
│  ├─ app.js                  Express app, security headers, static files
│  ├─ config.js               environment configuration
│  ├─ routes/                 chat, conversations, mood, reminders, memory,
│  │                          settings, dashboard, health, safety, knowledge,
│  │                          data
│  ├─ services/               AI, conversation, mood, memory, reminder,
│  │                          settings, safety, vector, migration
│  ├─ utils/                  JSON store, CSV, validation, dates, text
│  └─ constants.js            crisis resources and shared data
├─ scripts/import-legacy.js   safe legacy importer
├─ api/index.js               Vercel serverless entry point
├─ vercel.json                Vercel function config and API rewrites
├─ tests/                     API and unit tests
├─ data/                      working data + preserved legacy project
├─ .env.example
└─ package.json
```

---

## Testing

```powershell
npm test
```

The suite starts an isolated Express app against a temporary data directory and a mocked Ollama server, then exercises:

- end-to-end chat, mood, memory, reminder, conversation and settings flows
- timestamp normalization and stable local day keys
- CSV quoting
- tokenization and emotional-theme matching
- title generation
- crisis detection (true positives and ordinary phrases)
- mood summary calculations (streak, averages, trend)

Static checks used during development:

```powershell
Get-ChildItem public\js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node --check server\server.js
```

---

## Troubleshooting

**“Ollama is not reachable”**
Start Ollama with `ollama serve`, confirm `OLLAMA_BASE_URL`, then use **Refresh** in Settings → Connection.

**“Model missing”**
Run `ollama pull phi-mindmate`, or create it from the preserved Modelfile (see above). Alternatively set `OLLAMA_MODEL` to an installed model.

**Replies are slow**
`phi` is a ~2.7B model. On CPU a full reply can take 30–90 seconds, and the
first message also includes model load time. Ollama uses a supported GPU
automatically when one is available. The model stays warm for 10 minutes
between messages, so follow-up replies are faster.

**Port already in use**
Set a different `PORT` in `.env`, or stop the other process.

**Replies work but charts do not**
Confirm `public/vendor/chart.umd.js` exists. Vendored assets are served from the same origin; no CDN is required.

**Notifications do not appear**
Enable them in Settings and grant browser permission. The reminder is always saved in-app even if desktop notifications are blocked.

**Data disappeared after changing directories**
Check `DATA_DIR`. By default the app reads `./data` relative to the project root, not the shell's current directory.

---

## Design provenance

The layout, palette, typography, section names and emotional tone follow the original MindMate AI Streamlit project. That original source, Chroma store and training data remain untouched under `data/legacy/`. The rebuild replaces Streamlit with a custom Express API and a vanilla-JS single-page interface while preserving the companion's intent: a gentle, private place to be heard.

## License

MIT.
