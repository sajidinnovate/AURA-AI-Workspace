const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // Fallback for root .env if present

// Strictly enforce required environment variables
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is missing in .env');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY environment variable is missing in .env');
  process.exit(1);
}

const app = require('./app');
const pool = require('./db');
const fs = require('fs');

const PORT = process.env.PORT || 5000;

async function initDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL database');

    // Check if core AURA tables exist
    const { rows } = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'workspaces')"
    );
    if (!rows[0].exists) {
      console.log('Initializing AURA database schema...');
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await pool.query(schema);
      console.log('AURA database schema initialized.');
    } else {
      console.log('Database tables already exist.');
      try {
        await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_type VARCHAR(150);');
        await pool.query('ALTER TABLE documents ALTER COLUMN file_type TYPE VARCHAR(150);');
        await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;');
        await pool.query('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_id INTEGER;');
        await pool.query('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255);');
        await pool.query('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT;');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS chat_sessions (
            id SERIAL PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
            sender VARCHAR(10) CHECK (sender IN ('user', 'ai')) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE;');
      } catch (colErr) {
        // Safe check
      }
    }

    // Check and safely attempt to enable pgvector extension
    let hasPgVector = false;
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
      hasPgVector = true;
      console.log('✅ PostgreSQL pgvector extension enabled');
    } catch {
      console.log('ℹ️  pgvector C-extension not installed on system; using JSONB cosine similarity fallback.');
    }

    // Auto-create document_chunks table and indexes safely
    try {
      const docColRes = await pool.query(
        "SELECT data_type FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'id'"
      );
      const wsColRes = await pool.query(
        "SELECT data_type FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'id'"
      );
      const docIdType = docColRes.rows[0]?.data_type === 'uuid' ? 'UUID' : 'INTEGER';
      const wsIdType = wsColRes.rows[0]?.data_type === 'uuid' ? 'UUID' : 'INTEGER';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id SERIAL PRIMARY KEY,
          document_id ${docIdType} NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          workspace_id ${wsIdType} NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          page_number INTEGER DEFAULT 1,
          chunk_index INTEGER NOT NULL,
          chunk_text TEXT NOT NULL,
          embedding JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON document_chunks(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
      `);

      if (hasPgVector) {
        try {
          await pool.query('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_vec vector(768);');
        } catch {
          // safe check
        }
      }
      console.log('✅ document_chunks table initialized successfully');
    } catch (chunkErr) {
      console.warn('⚠️  document_chunks init warning:', chunkErr.message);
    }
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    console.error('Ensure PostgreSQL is running and database "enterprise_ai_db" exists.');
  }
}

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`AURA AI Workspace Server running on port ${PORT}`);
  });
});
