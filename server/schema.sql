-- ============================================================
-- AURA AI Enterprise Platform — Database Schema
-- PERN Stack: PostgreSQL + Express + React + Node.js
-- ============================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces Table
-- owner_id references users(id) which is INTEGER (SERIAL)
CREATE TABLE IF NOT EXISTS workspaces (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Documents Table
-- Can store extracted text from PDF, DOCX, PPTX, TXT files
CREATE TABLE IF NOT EXISTS documents (
    id            SERIAL PRIMARY KEY,
    workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title         VARCHAR(500) NOT NULL,
    content_text  TEXT NOT NULL DEFAULT '',
    file_type     VARCHAR(20),
    file_size     BIGINT,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Chat Sessions Table
-- Stores individual conversation threads per workspace
CREATE TABLE IF NOT EXISTS chat_sessions (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL DEFAULT 'New Chat',
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Chat Messages Table
-- Stores messages per session and workspace
CREATE TABLE IF NOT EXISTS chat_messages (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id   INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender       VARCHAR(10) CHECK (sender IN ('user', 'ai')) NOT NULL,
    message      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Document Chunks Table (Vector RAG Pipeline)
-- Stores page-aware text chunks and 768-dim embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    id           SERIAL PRIMARY KEY,
    document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    page_number  INTEGER DEFAULT 1,
    chunk_index  INTEGER NOT NULL,
    chunk_text   TEXT NOT NULL,
    embedding    JSONB,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON document_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);


