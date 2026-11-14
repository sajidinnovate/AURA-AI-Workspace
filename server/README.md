# AURA AI Workspace — Backend API

Backend REST API for **AURA AI Enterprise Multi-Document Knowledge Workspace**, built with Node.js, Express, PostgreSQL, and Google Gemini AI.

---

## 🚀 Overview & Modular Architecture

The AURA AI backend handles:
- **Authentication**: JWT-based session auth with bcrypt password hashing.
- **Workspace Isolation**: Multi-tenant workspace management scoped per user.
- **Dedicated Parser Service (`services/documentParser.js`)**: Multi-format document parser extracting clean text with page/sheet markers for PDF (`pdfjs-dist` v6 & `pdf-parse`), Word (`mammoth`), PowerPoint (`unzipper` OpenXML), Excel (`xlsx`), and plain text/Markdown/CSV/JSON.
- **True Vector RAG Pipeline (`services/ragService.js`)**: Page-aware semantic text chunking (~800 chars, 150 overlap), 768-dimensional embedding generation via `@google/genai` (`text-embedding-004` / `gemini-embedding-001`), and hybrid vector cosine similarity (native `pgvector` with JSONB cosine distance fallback).
- **AI Intelligence Studio**: Context-aware querying powered by Google Gemini (`gemini-2.5-flash`, `gemini-2.0-flash`) with page citations and an automated local heuristic fallback engine (`smartRAG.js`).

---

## 🛠️ Environment Configuration

Create a `.env` file in the `server/` directory (see `.env.example` for reference):

```env
PORT=5000
NODE_ENV=development

# Database (PostgreSQL)
DB_USER=postgres
DB_HOST=127.0.0.1
DB_NAME=enterprise_ai_db
DB_PASSWORD=your_postgres_password
DB_PORT=5432

PGUSER=postgres
PGHOST=127.0.0.1
PGDATABASE=enterprise_ai_db
PGPASSWORD=your_postgres_password
PGPORT=5432

# Authentication
JWT_SECRET=your_secure_jwt_secret_key

# Google Gemini AI API Key (Get from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here

# Client URL (for CORS)
CLIENT_URL=http://127.0.0.1:3000
```

---

## 📦 Setup & Execution

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Ensure PostgreSQL is running** with database `enterprise_ai_db`:
   ```sql
   CREATE DATABASE enterprise_ai_db;
   ```
   *(Tables are automatically created/migrated from `schema.sql` on server startup).*

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Production start:**
   ```bash
   npm start
   ```

---

## 📡 API Endpoints

### 1. Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new account (`{ name, email, password }`).
- `POST /api/auth/login` — Sign in and receive a 7-day JWT token (`{ email, password }`).

### 2. Workspaces (`/api/workspaces`)
*(Requires `Authorization: Bearer <token>`)*
- `GET /api/workspaces` — Fetch all workspaces for the authenticated user.
- `POST /api/workspaces` — Create a new workspace (`{ name, description }`).
- `DELETE /api/workspaces/:id` — Delete a workspace and cascade-delete its documents and chats.

### 3. Documents (`/api/documents`)
*(Requires `Authorization: Bearer <token>`)*
- `GET /api/documents/:workspace_id` — List all parsed documents in a workspace.
- `POST /api/documents` — Add a manual plain-text document (`{ workspace_id, title, content_text }`) and auto-generate vector chunks.
- `POST /api/documents/upload` — Upload and parse a file (`multipart/form-data`: `file`, `workspace_id`, optional `title`). Automatically invokes `documentParser.js` and indexes vector chunks via `ragService.js`.
- `DELETE /api/documents/:id` — Delete a document from the workspace and cascade-delete its chunks.

### 4. AI & Chat Studio (`/api/ai`)
*(Requires `Authorization: Bearer <token>`)*
- `GET /api/ai/sessions/:workspace_id` — List all chat sessions for a workspace.
- `POST /api/ai/sessions` — Create a new chat session (`{ workspace_id, title }`).
- `DELETE /api/ai/sessions/:id` — Delete a chat session and its conversation messages.
- `GET /api/ai/history/:workspace_id?session_id=<id>` — Fetch chat messages for a workspace/session.
- `DELETE /api/ai/history/:workspace_id?session_id=<id>` — Clear chat history for a session or entire workspace.
- `PUT /api/ai/message/:id` — Update an existing message text.
- `POST /api/ai/query` — Semantic RAG query against document chunks using Gemini (`gemini-2.5-flash`, `gemini-2.0-flash`) with page citations and smart local fallback (`{ workspace_id, question, session_id, edit_message_id }`).
