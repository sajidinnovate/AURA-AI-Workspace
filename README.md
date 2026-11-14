# 🚀 AURA AI WORKSPACE — Multi-Document Knowledge Intelligence Platform

A full-stack enterprise PERN (PostgreSQL + Express + React + Node.js) web application designed for high-performance multi-document ingestion, semantic Vector RAG (Retrieval-Augmented Generation) with exact page-level citations, rapid conversational Q&A, and executive-ready PDF report generation powered by Google Gemini AI.

---

## 🌟 Key Architecture & Capabilities

### 1. ⚡ High-Speed Gemini Inference & Resilient Fallbacks (`server/routes/ai.js`)
- **Dual-Tier Model Cascade**: Queries first attempt `gemini-3.5-flash-lite` for ultra-fast (1.5–3s) inference, gracefully cascading to `gemini-3.5-flash` if rate limits or transient errors occur.
- **Strict 8-Second Timeout Guards**: Each model attempt is capped by a `Promise.race` timeout guard (8,000ms), preventing long thread locks or frontend timeout crashes.
- **Dynamic Retrieval Optimization**: Workspaces with $\le 40,000$ characters inject verified document text directly into the system prompt, skipping redundant query embedding roundtrips to deliver sub-2-second answers. Workspaces exceeding 40,000 characters automatically engage semantic vector similarity search.
- **Structured Offline Fallback Engine (`server/services/smartRAG.js`)**: If external APIs are unavailable or network timeouts occur, an offline heuristic fallback generates clean, structured Markdown responses with bold headings (`###`), bullet points (`-`), and `(Source: filename.pdf, Page X)` citations—never raw document dumps.

### 2. 🧠 True Vector RAG Pipeline (`server/services/ragService.js`)
- **Page-Aware Overlapping Chunking**: Documents are split into ~800-character windows with a 150-character overlap while preserving explicit page break markers (`--- Page X ---`).
- **768-Dimensional Embeddings**: High-fidelity semantic embeddings generated via `@google/genai` (`text-embedding-004` / `gemini-embedding-001`).
- **Hybrid Vector Storage**: Native PostgreSQL `pgvector` cosine similarity search (`<=>`) with an automatic in-memory JSONB cosine similarity fallback when vector extensions are unavailable.
- **Accurate Source Citations**: Every generated insight links directly to source filenames and page numbers for auditability.

### 3. 📄 Enterprise Multi-Format Document Ingestion (`server/services/documentParser.js`)
- 📕 **PDF** (`.pdf`) — Resilient extraction using modern `pdfjs-dist` (v6) with page break preservation, falling back to `pdf-parse` and stream decompressors.
- 📘 **Word** (`.docx`, `.doc`) — Paragraph, table, and heading extraction via `mammoth`.
- 📙 **PowerPoint** (`.pptx`, `.ppt`) — Slide-by-slide text and bullet extraction via OpenXML stream parsing.
- 📗 **Excel & Spreadsheets** (`.xlsx`, `.xls`, `.csv`) — Multi-sheet tabular data parsing via SheetJS (`xlsx`).
- 📄 **Text & Code** (`.txt`, `.md`, `.markdown`, `.json`) — Direct UTF-8 ingestion with character normalization.

### 4. 📊 Programmatic Executive PDF Export (`client/src/services/pdfExportService.js`)
- **Pure Vector jsPDF Engine**: Generates crisp, selectable PDF reports programmatically without relying on canvas DOM snapshots or `html2canvas`.
- **Executive Report Layout**: Top branded banner, workspace metadata (indexed documents, total queries, export timestamp), styled user prompt blocks, and indigo-accented AI answer cards.
- **Markdown & Table Parser**: Programmatically formats bold text, bullet points, Markdown tables, and code snippets, complete with running footers and `Page X of Y` numbering.

### 5. 🎨 Polished Dual Theme UI Engine (`client/src/`)
- **Full Light & Dark Mode**: System-aware contrast tokens ensure high-contrast readability across Markdown headings, code pills, and inputs.
- **Interactive Navbar Profile Pill**: Displays user avatar and capitalized name, with a floating popover card for session details.
- **Styled Document Reader**: Multi-page document previews render clean `[ PAGE X ]` divider pills with subtle borders.

---

## 📁 Directory Structure

```
Ai-Workspace-Saas/
├── client/                               ← React 18 + Vite Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   └── ProtectedRoute.jsx    ← Route guard redirecting unauthenticated users
│   │   │   ├── common/
│   │   │   │   ├── ErrorBoundary.jsx     ← Catch-all React error boundary
│   │   │   │   └── LoadingSpinner.jsx    ← Reusable animated spinner
│   │   │   └── workspace/
│   │   │       ├── ChatPanel.jsx         ← Conversational studio, inline edits, PDF export
│   │   │       ├── DocumentPanel.jsx     ← Drag-and-drop upload, reader with page dividers
│   │   │       └── WorkspaceSidebar.jsx  ← Workspace selector & creation modal
│   │   ├── context/
│   │   │   └── AuthContext.jsx           ← Auth state (JWT token, user profile, login, logout)
│   │   ├── hooks/
│   │   │   └── useAuth.js                ← Auth hook helper
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx              ← Authentication portal (Sign In / Sign Up)
│   │   │   └── WorkspacePage.jsx         ← Coordinator dashboard & top navbar popover
│   │   ├── services/
│   │   │   ├── api.js                    ← Axios client with JWT interceptors
│   │   │   └── pdfExportService.js       ← Programmatic vector jsPDF executive report generator
│   │   ├── App.jsx                       ← Application routes (/ and /dashboard)
│   │   ├── main.jsx                      ← Root mount with Theme, Auth, & Error Boundary
│   │   └── index.css                     ← Tailwind CSS design tokens & contrast overrides
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/                               ← Express + PostgreSQL Backend
│   ├── middleware/
│   │   └── authMiddleware.js             ← JWT authentication & user verification
│   ├── routes/
│   │   ├── ai.js                         ← RAG query endpoint with fast Gemini models & timeout guards
│   │   ├── auth.js                       ← Register & Login authentication routes
│   │   ├── documents.js                  ← Multi-format upload & parsing routes
│   │   └── workspaces.js                 ← CRUD operations for user workspaces
│   ├── services/
│   │   ├── documentParser.js             ← Multi-format document parser (PDF, Word, PPTX, Excel, TXT)
│   │   ├── ragService.js                 ← Semantic chunking, 768-dim embeddings, vector retrieval
│   │   └── smartRAG.js                   ← Clean Markdown offline heuristic fallback engine
│   ├── app.js                            ← Express application setup & middleware
│   ├── db.js                             ← PostgreSQL connection pool
│   ├── index.js                          ← Server entry point & auto-migration runner
│   ├── schema.sql                        ← Database schema with pgvector & chunk tables
│   ├── .env                              ← Server environment variables
│   ├── .env.example                      ← Example environment configuration template
│   └── package.json
│
├── .gitignore                            ← Production git ignore rules
└── README.md                             ← Project documentation
```

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Node.js**: v18.x or v20.x
- **PostgreSQL**: v14+ (optionally with `pgvector` extension)
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/app/apikey)

---

### 2. Database Configuration
Ensure PostgreSQL is running:
- Database Name: `enterprise_ai_db`
- Tables (`users`, `workspaces`, `documents`, `document_chunks`, `chat_sessions`, `chat_messages`) are automatically created and migrated on backend boot.

---

### 3. Backend Setup
1. Navigate to the server folder and install dependencies:
   ```bash
   cd server
   npm install
   ```
2. Configure `server/.env` (refer to `server/.env.example`):
   ```env
   PORT=5000
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
   DB_HOST=127.0.0.1
   DB_PORT=5432
   DB_NAME=enterprise_ai_db
   JWT_SECRET=your_secure_jwt_secret
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
3. Start the server:
   ```bash
   npm run dev
   # Server runs on http://localhost:5000
   ```

---

### 4. Frontend Setup
1. Navigate to the client folder and install dependencies:
   ```bash
   cd client
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   # Client runs on http://localhost:3000 (proxied to http://localhost:5000)
   ```
3. Or build for production:
   ```bash
   npm run build
   ```

---

## 📡 Core API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new user account | No |
| `POST` | `/api/auth/login` | Authenticate user & return JWT token | No |
| `GET` | `/api/auth/me` | Fetch active user profile | Yes |
| `GET` | `/api/workspaces` | List all workspaces for authenticated user | Yes |
| `POST` | `/api/workspaces` | Create a new workspace | Yes |
| `DELETE`| `/api/workspaces/:id` | Delete a workspace and associated documents | Yes |
| `GET` | `/api/documents/workspace/:id` | Get all documents in a workspace | Yes |
| `POST` | `/api/documents/upload` | Upload & parse multi-format document | Yes |
| `DELETE`| `/api/documents/:id` | Delete a document and its vector chunks | Yes |
| `POST` | `/api/ai/query` | Run semantic RAG query with Gemini AI | Yes |
| `GET` | `/api/ai/sessions/:workspaceId` | List chat sessions for a workspace | Yes |
| `POST` | `/api/ai/sessions` | Create a new conversational session | Yes |
| `PATCH`| `/api/chat/sessions/:sessionId` | Rename a chat session (max 100 chars, auth scoped) | Yes |
| `DELETE`| `/api/ai/sessions/:id` | Delete a chat session and its message thread | Yes |

---

## 🔒 Security & Privacy
- **Stateless JWT Authentication**: Passwords salted and hashed with `bcryptjs`.
- **Workspace Isolation**: Documents and chat sessions are strictly scoped to the authenticated user ID.
- **Local Network Safety**: PDF export runs entirely client-side using vector `jsPDF` commands—no chat contents or documents are transmitted to external conversion microservices.

---

## 📄 License
MIT License. © 2026 AURA AI Workspace.
