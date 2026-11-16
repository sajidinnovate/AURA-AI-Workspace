const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────
const normalizeWorkspaceId = (workspace_id) => {
  const rawValue = String(workspace_id || '').trim();
  const isInt = /^\d+$/.test(rawValue);
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawValue);
  if (isInt) return { valid: true, value: parseInt(rawValue, 10) };
  if (isUuid) return { valid: true, value: rawValue };
  return { valid: false, value: null };
};

const normalizeAiAnswer = (value) => {
  if (value === null || value === undefined) return '';
  let normalized = typeof value === 'string' ? value
    : typeof value === 'object' ? (value.answer || value.text || JSON.stringify(value, null, 2))
    : String(value);
  if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))) {
    try { normalized = JSON.parse(normalized); } catch { normalized = normalized.slice(1, -1); }
  }
  return String(normalized)
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    .replace(/\n{3,}/g, '\n\n').trim();
};

// ── Gemini Client Init ───────────────────────────────────────────────────────
let aiClient = null;
const apiKey = process.env.GEMINI_API_KEY;
if (apiKey && apiKey !== 'your_actual_gemini_api_key_here') {
  try {
    aiClient = new GoogleGenAI({ apiKey });
    console.log('✅ Gemini AI client initialized');
  } catch (e) {
    console.warn('⚠️  Gemini Client Init Warning:', e.message);
  }
}

// Apply Auth Middleware to all AI routes
router.use(authMiddleware);

// Helper: Ensure user owns the workspace
async function userHasWorkspaceAccess(workspaceId, user) {
  if (!user || !user.id) return false;
  const userIdNum = parseInt(user.id, 10);
  const userIdStr = String(user.id);
  try {
    const ws = await pool.query(
      'SELECT id FROM workspaces WHERE id = $1 AND (user_id = $2 OR owner_id = $3)',
      [workspaceId, isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );
    return ws.rows.length > 0;
  } catch {
    return false;
  }
}

// ── GET /api/ai/sessions/:workspace_id ───────────────────────────────────────
// Returns all chat sessions for a workspace (Strict Tenant Check)
router.get('/sessions/:workspace_id', async (req, res) => {
  try {
    const normalized = normalizeWorkspaceId(req.params.workspace_id);
    if (!normalized.valid) return res.json([]);

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    const result = await pool.query(
      `SELECT s.id, s.workspace_id, s.title, s.created_at, s.updated_at,
              COUNT(m.id)::int AS message_count
       FROM chat_sessions s
       LEFT JOIN chat_messages m ON m.session_id = s.id
       WHERE s.workspace_id = $1
       GROUP BY s.id
       ORDER BY s.updated_at DESC, s.created_at DESC`,
      [normalized.value]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Fetch Sessions Error:', err);
    return res.status(500).json({ message: err.message || 'Error fetching sessions.' });
  }
});

// ── POST /api/ai/sessions ────────────────────────────────────────────────────
// Creates a new chat session for a workspace (Strict Tenant Check)
router.post('/sessions', async (req, res) => {
  try {
    const { workspace_id, title } = req.body;
    const normalized = normalizeWorkspaceId(workspace_id);
    if (!normalized.valid) return res.status(400).json({ message: 'Invalid workspace ID.' });

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    const sessionTitle = (title || 'New Chat').trim();
    const result = await pool.query(
      'INSERT INTO chat_sessions (workspace_id, title) VALUES ($1, $2) RETURNING *',
      [normalized.value, sessionTitle]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Create Session Error:', err);
    return res.status(500).json({ message: err.message || 'Error creating session.' });
  }
});

// ── DELETE /api/ai/sessions/:id ──────────────────────────────────────────────
// Deletes a specific chat session and its messages (Strict Tenant Check)
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userIdNum = parseInt(req.user.id, 10);
    const userIdStr = String(req.user.id);

    const result = await pool.query(
      `DELETE FROM chat_sessions s
       USING workspaces w
       WHERE s.id = $1
         AND s.workspace_id = w.id
         AND (w.user_id = $2 OR w.owner_id = $3)
       RETURNING s.*`,
      [id, isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found or access denied.' });
    }

    return res.json({ success: true, message: 'Session deleted.' });
  } catch (err) {
    console.error('Delete Session Error:', err);
    return res.status(500).json({ message: err.message || 'Error deleting session.' });
  }
});

// ── PATCH /api/ai/sessions/:sessionId or /api/chat/sessions/:sessionId ─────────
// Updates session title with max-100-char validation and user_id ownership check
router.patch('/sessions/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const { title } = req.body;
    const userIdNum = parseInt(req.user?.id, 10);
    const userIdStr = String(req.user?.id || '');

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'Session title cannot be empty.' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 100) {
      return res.status(400).json({ message: 'Session title cannot exceed 100 characters.' });
    }

    // Update title ensuring workspace ownership by authenticated user
    const result = await pool.query(
      `UPDATE chat_sessions s
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       FROM workspaces w
       WHERE s.id = $2
         AND s.workspace_id = w.id
         AND (w.user_id = $3 OR w.owner_id = $4)
       RETURNING s.id, s.workspace_id, s.title, s.created_at, s.updated_at`,
      [trimmedTitle, sessionId, isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );

    if (result.rows.length === 0) {
      const existsCheck = await pool.query('SELECT id FROM chat_sessions WHERE id = $1', [sessionId]);
      if (existsCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Chat session not found.' });
      }
      return res.status(403).json({ message: 'Not authorized to modify this chat session.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Rename Session Error:', err);
    return res.status(500).json({ message: err.message || 'Error updating session title.' });
  }
});

// ── GET /api/ai/history/:workspace_id ────────────────────────────────────────
// Returns chat history for a workspace (Strict Tenant Check)
router.get('/history/:workspace_id', async (req, res) => {
  try {
    const normalized = normalizeWorkspaceId(req.params.workspace_id);
    if (!normalized.valid) return res.json([]);

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    const reqSessionId = req.query.session_id ? parseInt(req.query.session_id, 10) : null;

    let targetSessionId = reqSessionId;
    if (!targetSessionId) {
      // Find latest session for this workspace
      const latestSess = await pool.query(
        'SELECT id FROM chat_sessions WHERE workspace_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
        [normalized.value]
      );
      if (latestSess.rows.length > 0) {
        targetSessionId = latestSess.rows[0].id;
      }
    }

    if (!targetSessionId) {
      return res.json([]);
    }

    const result = await pool.query(
      'SELECT * FROM chat_messages WHERE workspace_id = $1 AND session_id = $2 ORDER BY created_at ASC',
      [normalized.value, targetSessionId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Fetch Chat History Error:', err);
    return res.status(500).json({ message: err.message || 'Error fetching chat history.' });
  }
});

// ── DELETE /api/ai/history/:workspace_id ─────────────────────────────────────
// Clears chat messages for a workspace or session (Strict Tenant Check)
router.delete('/history/:workspace_id', async (req, res) => {
  try {
    const normalized = normalizeWorkspaceId(req.params.workspace_id);
    if (!normalized.valid) return res.status(400).json({ message: 'Invalid workspace ID.' });

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    const reqSessionId = req.query.session_id ? parseInt(req.query.session_id, 10) : null;

    if (reqSessionId) {
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1 AND session_id = $2', [normalized.value, reqSessionId]);
    } else {
      await pool.query('DELETE FROM chat_messages WHERE workspace_id = $1', [normalized.value]);
    }
    return res.json({ message: 'Chat history cleared.' });
  } catch (err) {
    console.error('Clear History Error:', err);
    return res.status(500).json({ message: err.message || 'Error clearing chat history.' });
  }
});

// ── PUT /api/ai/message/:id ──────────────────────────────────────────────────
// Edit / update an existing chat message (Strict Tenant Check)
router.put('/message/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message text is required.' });
    }

    const userIdNum = parseInt(req.user.id, 10);
    const userIdStr = String(req.user.id);

    const result = await pool.query(
      `UPDATE chat_messages m
       SET message = $1
       FROM workspaces w
       WHERE m.id = $2
         AND m.workspace_id = w.id
         AND (w.user_id = $3 OR w.owner_id = $4)
       RETURNING m.*`,
      [message.trim(), id, isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found or access denied.' });
    }

    return res.json({ success: true, message: result.rows[0] });
  } catch (err) {
    console.error('Update Message Error:', err);
    return res.status(500).json({ message: err.message || 'Error updating message.' });
  }
});

const { generateSmartRAGAnswer, isRomanUrdu } = require('../smartRAG');
const { retrieveRelevantChunks } = require('../services/ragService');

// Helper to get active Gemini client dynamically
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'your_actual_gemini_api_key_here' && apiKey.trim().length > 15) {
    try {
      return new GoogleGenAI({ apiKey: apiKey.trim() });
    } catch (e) {
      console.warn('⚠️  Gemini Client Init Warning:', e.message);
    }
  }
  return null;
};


// ── POST /api/ai/query ───────────────────────────────────────────────────────
// Core RAG endpoint — searches across all workspace documents with full file awareness,
// exact computed metrics, active viewer document context, and natural Gemini conversational fluency
router.post('/query', async (req, res) => {
  try {
    let { workspace_id, question, prompt, session_id, edit_message_id, active_document_id, activeDocumentId } = req.body;
    const targetActiveDocId = active_document_id || activeDocumentId;
    const normalized = normalizeWorkspaceId(workspace_id);
    const cleanQuestion = (question || prompt || '').trim();

    if (!normalized.valid || !cleanQuestion) {
      return res.status(400).json({
        message: 'workspace_id (integer or UUID) and question are required.',
      });
    }

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    // Determine or create active chat session
    let activeSessionId = session_id ? parseInt(session_id, 10) : null;
    const rawTitle = cleanQuestion.slice(0, 45).replace(/[\r\n]+/g, ' ') + (cleanQuestion.length > 45 ? '...' : '');

    // Handle Edit Mode: if editing an existing message, truncate future messages in that session
    let isEditMode = false;
    let userMsgRow = null;
    if (edit_message_id && (typeof edit_message_id === 'number' || /^\d+$/.test(String(edit_message_id)))) {
      const editId = parseInt(edit_message_id, 10);
      try {
        const msgRow = await pool.query('SELECT * FROM chat_messages WHERE id = $1', [editId]);
        if (msgRow.rows.length > 0) {
          const targetMsg = msgRow.rows[0];
          activeSessionId = targetMsg.session_id || activeSessionId;

          // Delete all subsequent messages in this session created after this edited message
          await pool.query(
            'DELETE FROM chat_messages WHERE session_id = $1 AND (created_at > $2 OR id > $3)',
            [activeSessionId, targetMsg.created_at, editId]
          );

          // Update the target message text with the new edited question
          const updatedMsg = await pool.query(
            'UPDATE chat_messages SET message = $1 WHERE id = $2 RETURNING *',
            [cleanQuestion, editId]
          );
          userMsgRow = updatedMsg.rows[0];
          isEditMode = true;
        }
      } catch (editErr) {
        console.warn('Edit Message Truncation Warning:', editErr.message);
      }
    }

    if (!activeSessionId) {
      const latestSess = await pool.query(
        'SELECT id, title FROM chat_sessions WHERE workspace_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
        [normalized.value]
      );
      if (latestSess.rows.length > 0) {
        activeSessionId = latestSess.rows[0].id;
        if (latestSess.rows[0].title === 'New Chat') {
          await pool.query('UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [rawTitle, activeSessionId]);
        } else {
          await pool.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [activeSessionId]);
        }
      } else {
        const newSess = await pool.query(
          'INSERT INTO chat_sessions (workspace_id, title) VALUES ($1, $2) RETURNING id',
          [normalized.value, rawTitle || 'New Chat']
        );
        activeSessionId = newSess.rows[0].id;
      }
    } else {
      try {
        const sessRow = await pool.query('SELECT title FROM chat_sessions WHERE id = $1', [activeSessionId]);
        if (sessRow.rows.length > 0 && sessRow.rows[0].title === 'New Chat') {
          await pool.query('UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [rawTitle, activeSessionId]);
        } else {
          await pool.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [activeSessionId]);
        }
      } catch {}
    }

    // Fetch all documents for this workspace with full metadata
    const docsResult = await pool.query(
      'SELECT id, title, content_text, file_type, file_size, created_at FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC',
      [normalized.value]
    );

    const allDocs = docsResult.rows || [];
    const validDocs = allDocs.filter((doc) => String(doc.content_text || '').trim().length > 0);

    if (validDocs.length === 0) {
      return res.json({
        answer: 'No document content found in this workspace. Please upload at least one document (PDF, Word, Excel, PowerPoint, or Text/CSV) to start asking questions.',
        session_id: activeSessionId,
      });
    }

    // ── Compute Exact Workspace File Inventory & Metrics ────────────────────
    let totalWorkspaceChars = 0;
    const fileInventory = validDocs.map((doc) => {
      const content = String(doc.content_text || '');
      const trimmed = content.trim();
      const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      const charCount = content.length;
      totalWorkspaceChars += charCount;

      const pageMatches = content.match(/---\s*(?:Page|Slide|Sheet:?)\s*[^-\n]+\s*---/gi);
      const pageCount = pageMatches && pageMatches.length > 0 ? pageMatches.length : 1;

      const ext = (doc.title || '').split('.').pop().toUpperCase();
      const format = ext && ext.length <= 5 ? ext : (doc.file_type ? doc.file_type.split('/')[1]?.toUpperCase() : 'TXT');

      const isActiveDoc = targetActiveDocId && String(doc.id) === String(targetActiveDocId);

      return {
        id: doc.id,
        title: doc.title,
        wordCount,
        charCount,
        pageCount,
        format,
        isActiveDoc,
        content,
      };
    });

    const activeDoc = fileInventory.find((f) => f.isActiveDoc) || (fileInventory.length === 1 ? fileInventory[0] : null);

    const inventoryFormatted = fileInventory.map((f, i) => {
      const viewerTag = f.isActiveDoc ? ' 👁️ [CURRENTLY OPEN IN VIEWER]' : '';
      return `${i + 1}. "${f.title}"${viewerTag}
   - Format: ${f.format} | Pages/Slides: ${f.pageCount} | Exact Words: ${f.wordCount.toLocaleString()} | Exact Characters: ${f.charCount.toLocaleString()}`;
    }).join('\n');

    // Determine targeted full content injection
    const qLower = cleanQuestion.toLowerCase();
    const refersToActiveDoc = (
      qLower.includes('this doc') ||
      qLower.includes('this file') ||
      qLower.includes('current doc') ||
      qLower.includes('current file') ||
      qLower.includes('open file') ||
      qLower.includes('open doc') ||
      qLower.includes('is file') ||
      qLower.includes('iss file') ||
      qLower.includes('is doc') ||
      qLower.includes('iss doc') ||
      qLower.includes('ye file') ||
      qLower.includes('yeh file')
    );

    const mentionedDoc = fileInventory.find((f) => {
      const lowerTitle = f.title.toLowerCase();
      const baseName = lowerTitle.split('.')[0];
      return qLower.includes(lowerTitle) || (baseName.length > 3 && qLower.includes(baseName));
    });

    const targetDocForFullContent = mentionedDoc || (refersToActiveDoc && activeDoc ? activeDoc : null);

    let fullDocContextBlock = '';
    if (totalWorkspaceChars <= 40000) {
      fullDocContextBlock = `\nFULL WORKSPACE DOCUMENT TEXT (COMPLETE CONTENT OF ALL FILES):\n` +
        fileInventory.map((f) => `=== FILE: "${f.title}" (${f.format}, Pages: ${f.pageCount}, Words: ${f.wordCount.toLocaleString()}) ===\n${f.content}`).join('\n\n') + '\n';
    } else if (targetDocForFullContent && targetDocForFullContent.content.length <= 35000) {
      fullDocContextBlock = `\nFULL TARGET DOCUMENT TEXT FOR COMPLETE ANALYSIS:\n=== TARGET FILE: "${targetDocForFullContent.title}" [${targetDocForFullContent.isActiveDoc ? 'CURRENTLY OPEN IN VIEWER' : 'TARGET'}] (Words: ${targetDocForFullContent.wordCount.toLocaleString()}, Characters: ${targetDocForFullContent.charCount.toLocaleString()}) ===\n${targetDocForFullContent.content}\n`;
    }

    // Fetch recent chat messages for this session
    let historyText = '';
    try {
      let recentHistoryResult;
      if (isEditMode && userMsgRow) {
        recentHistoryResult = await pool.query(
          'SELECT sender, message FROM chat_messages WHERE workspace_id = $1 AND session_id = $2 AND id < $3 ORDER BY created_at DESC LIMIT 6',
          [normalized.value, activeSessionId, userMsgRow.id]
        );
      } else {
        recentHistoryResult = await pool.query(
          'SELECT sender, message FROM chat_messages WHERE workspace_id = $1 AND session_id = $2 ORDER BY created_at DESC LIMIT 6',
          [normalized.value, activeSessionId]
        );
      }
      const recentHistory = (recentHistoryResult.rows || []).reverse();
      if (recentHistory.length > 0) {
        historyText = recentHistory.map((m) => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.message}`).join('\n');
      }
    } catch {}

    // Save user message to history if not edit mode
    if (!isEditMode) {
      const insertedUserMsg = await pool.query(
        'INSERT INTO chat_messages (workspace_id, session_id, sender, message) VALUES ($1, $2, $3, $4) RETURNING *',
        [normalized.value, activeSessionId, 'user', cleanQuestion]
      );
      userMsgRow = insertedUserMsg.rows[0];
    }

    let answer = '';
    const activeClient = getAiClient();
    let retrievedChunks = [];

    if (activeClient) {
      try {
        // ── TRUE VECTOR RAG RETRIEVAL (Top K = 8 Semantic Chunks) ───────────
        // Only run embedding retrieval when workspace content exceeds 40,000 characters.
        // For small/medium workspaces, full document text is already injected below,
        // avoiding an external embedding API call that slows down response times.
        let contextChunksFormatted = '';
        if (totalWorkspaceChars > 40000) {
          try {
            const ragResult = await retrieveRelevantChunks(normalized.value, cleanQuestion, 8);
            retrievedChunks = ragResult.relevantChunks || [];

            if (retrievedChunks.length > 0) {
              contextChunksFormatted = retrievedChunks
                .map((chunk, idx) => {
                  const relevance = typeof chunk.similarity_score === 'number'
                    ? Math.round(chunk.similarity_score * 100)
                    : 85;
                  const repNotice = chunk.is_representative ? ' | Document Summary' : '';
                  return `--- RETRIEVED CHUNK ${idx + 1} [Source: "${chunk.document_title}" | Page ${chunk.page_number} | Relevance: ${relevance}%${repNotice}] ---
${chunk.chunk_text}`;
                })
                .join('\n\n');
            } else {
              contextChunksFormatted = validDocs
                .slice(0, 5)
                .map((d, i) => `--- DOCUMENT ${i + 1}: "${d.title}" ---\n${d.content_text.slice(0, 2000)}`)
                .join('\n\n');
            }
          } catch (ragRetrieveErr) {
            console.warn('⚠️ Vector RAG chunk retrieval warning:', ragRetrieveErr.message);
          }
        }

        const systemPrompt = `You are AURA AI, an exceptionally intelligent, perceptive, and natural AI partner behaving with the effortless fluency, deep reasoning, and warmth of ChatGPT and Gemini.
You have direct, complete visibility into every single file in this workspace.

WORKSPACE FILES & EXACT COMPUTED METRICS:
Total Files: ${fileInventory.length}
Total Workspace Characters: ${totalWorkspaceChars.toLocaleString()}
${activeDoc ? `Currently Open in User Viewer: "${activeDoc.title}"\n` : ''}
FILE INVENTORY & EXACT COUNTS:
${inventoryFormatted}
${fullDocContextBlock}
${contextChunksFormatted ? `TOP SEMANTIC CHUNKS RETRIEVED FOR THIS QUERY:\n${contextChunksFormatted}\n` : ''}
${historyText ? `RECENT CONVERSATION HISTORY:\n${historyText}\n\n` : ''}STRICT BEHAVIOR & INTELLIGENCE GUIDELINES:
1. NATURAL, CONFIDENT & COOPERATIVE:
   - You are a fully capable AI assistant with direct access to these files and their metrics. NEVER give robotic excuses like "I only have chunks", "I cannot count words", "as an AI with limited context", or "I lack full visibility".
   - You have exact computed metrics right in the WORKSPACE FILES & EXACT COMPUTED METRICS section above. Always provide exact word counts, character counts, page counts, and formats directly when asked!
   - If the user refers to "this document", "is file", "current file", "ye document", they are referring to "${activeDoc ? activeDoc.title : fileInventory[0]?.title}".

2. COMPREHENSIVE CAPABILITIES:
   - Answer ANY request with precision and helpfulness:
     • Exact Word/Character/Page Counts: Use the exact numbers provided in the inventory above.
     • Keyword Frequency & Text Extraction: Analyze the full document text and chunks thoroughly.
     • Deep Summaries & Analysis: Synthesize facts, numbers, dates, and conclusions.
     • Resume & Candidate Screening: Compare candidates, qualifications, years of experience, gaps, and match rates.
     • Email Drafting, Rewriting & Cover Letters: Draft professional, tailored communications based on document content.
     • Multi-File Overviews ("Summarize All"): Structure your answer cleanly with a dedicated section for EVERY SINGLE file in the workspace, followed by an executive synthesis.

3. CLEAN, POLISHED MARKDOWN FORMATTING:
   - Use clean Markdown typography just like ChatGPT:
     • \`###\` for major headings (with empty line before and after).
     • Structured bullet lists (\`- **Topic**: Detail...\`) for clarity.
     • Bold highlights (\`**key terms**\`, figures, candidate names).
     • Clean tables for side-by-side candidate comparisons or financial data.

4. CITATIONS & ATTRIBUTION:
   - Cite sources naturally: \`(Source: <filename>, Page <page_number>)\` when stating specific factual claims, quotes, or numbers.
   - Do not mention internal technical terms like "RAG chunks", "vector distance", or "cosine similarity" to the user.

5. LANGUAGE & TONE:
   - Seamlessly match the user's language:
     • If asked in English -> Answer in polished, articulate English.
     • If asked in Roman Urdu (e.g. "is file mein total kitne words hain?", "saari files ka summary do") -> Answer in natural, fluent Roman Urdu.
     • If asked in Urdu script -> Answer in standard Urdu script.

User Question: ${cleanQuestion}`;

        const candidateModels = [
          'gemini-3.5-flash-lite',
          'gemini-3.5-flash'
        ];

        let lastFailureReason = null;

        for (const modelName of candidateModels) {
          let timerId;
          try {
            const reqConfig = {
              temperature: 0.3,
            };
            // Set thinkingBudget: 0 on models supporting reasoning to avoid reasoning delays
            if (!modelName.includes('lite')) {
              reqConfig.thinkingConfig = { thinkingBudget: 0 };
            }

            // Strict 8-second timeout per model attempt (total worst-case 16s before smartRAG fallback)
            const timeoutPromise = new Promise((_, reject) => {
              timerId = setTimeout(() => {
                reject(new Error(`Timeout: Model ${modelName} did not respond within 8 seconds`));
              }, 8000);
            });

            const generatePromise = activeClient.models.generateContent({
              model: modelName,
              contents: systemPrompt,
              config: reqConfig,
            });

            const response = await Promise.race([generatePromise, timeoutPromise]).finally(() => {
              clearTimeout(timerId);
            });

            answer = response.text
              || response.candidates?.[0]?.content?.parts?.[0]?.text
              || '';

            if (answer) {
              console.log(`✅ Gemini AI answered using model: ${modelName} (Retrieved RAG Chunks: ${retrievedChunks.length})`);
              break;
            }
          } catch (geminiErr) {
            lastFailureReason = `${modelName}: ${geminiErr.status || geminiErr.code || ''} ${geminiErr.message}`;
            console.warn(`⚠️ Gemini API call failed for ${modelName}:`, geminiErr.status || geminiErr.code || '', geminiErr.message);
          }
        }
      } catch (ragError) {
        console.warn('⚠️  Vector RAG pipeline execution warning:', ragError.message);
      }
    }

    // ── FALLBACK: Smart Local Document Intelligence Engine ────────────────
    if (!answer) {
      console.warn(`⚠️ Triggering Smart RAG Fallback. Gemini API calls exhausted. Reason: ${lastFailureReason || 'No response returned from Gemini client'}`);
      answer = generateSmartRAGAnswer(cleanQuestion, validDocs);
    }

    const cleanAnswerText = normalizeAiAnswer(answer);

    // Save AI response to history
    const aiMessageResult = await pool.query(
      'INSERT INTO chat_messages (workspace_id, session_id, sender, message) VALUES ($1, $2, $3, $4) RETURNING *',
      [normalized.value, activeSessionId, 'ai', cleanAnswerText]
    );

    return res.json({
      success: true,
      answer: cleanAnswerText,
      message: aiMessageResult.rows[0],
      user_message: userMsgRow,
      session_id: activeSessionId,
      docs_searched: validDocs.length,
      chunks_retrieved: retrievedChunks.length,
    });

  } catch (err) {
    console.error('AI Query Route Error:', err);
    return res.status(500).json({ error: err.message, message: err.message || 'Error processing AI query.' });
  }
});

module.exports = router;
