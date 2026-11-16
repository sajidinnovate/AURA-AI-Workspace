const express = require('express');
const multer = require('multer');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { indexDocumentChunks } = require('../services/ragService');
const { parseUploadedDocument } = require('../services/documentParser');

const router = express.Router();

const normalizeWorkspaceId = (workspace_id) => {
  const rawValue = String(workspace_id || '').trim();
  const isInt = /^\d+$/.test(rawValue);
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rawValue);

  if (isInt) return { valid: true, value: parseInt(rawValue, 10) };
  if (isUuid) return { valid: true, value: rawValue };
  return { valid: false, value: null };
};

// In-memory multer storage (no temp files on disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    const validExtensions = [
      '.pdf',
      '.docx', '.doc',
      '.pptx', '.ppt',
      '.xlsx', '.xls', '.csv',
      '.txt', '.md', '.markdown', '.json', '.rtf', '.log'
    ];

    const isMatch = validExtensions.some((extItem) => ext.endsWith(extItem));
    if (isMatch) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type (${ext}). Supported formats: PDF, DOCX, PPTX, Excel (XLSX/XLS/CSV), and TXT/MD.`));
    }
  },
});

// Apply Auth Middleware to all document routes
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

// ── GET /api/documents/:workspace_id — Fetch documents for a workspace ──────
router.get('/:workspace_id', async (req, res) => {
  try {
    const { workspace_id } = req.params;
    const normalized = normalizeWorkspaceId(workspace_id);

    if (!normalized.valid) {
      return res.json([]);
    }

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    const query = 'SELECT * FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [normalized.value]);
    return res.json(result.rows);
  } catch (err) {
    console.error('Fetch Documents Error:', err);
    return res.status(500).json({ message: err.message || 'Error fetching documents.' });
  }
});

// ── POST /api/documents — Add manual text document ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const { workspace_id, title, content_text } = req.body;
    const normalized = normalizeWorkspaceId(workspace_id);

    if (!normalized.valid || !title || !title.trim()) {
      return res.status(400).json({ message: 'workspace_id and title are required.' });
    }

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    const cleanContent = (content_text || '').replace(/\0/g, '').trim();

    let result;
    try {
      result = await pool.query(
        'INSERT INTO documents (workspace_id, title, content_text, file_type, file_size) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [normalized.value, title.trim(), cleanContent, 'text/plain', Buffer.byteLength(cleanContent, 'utf-8')]
      );
    } catch {
      // Fallback if schema doesn't have file_type/file_size columns yet
      result = await pool.query(
        'INSERT INTO documents (workspace_id, title, content_text) VALUES ($1, $2, $3) RETURNING *',
        [normalized.value, title.trim(), cleanContent]
      );
    }

    const savedDoc = result.rows[0];

    // Return immediately to client and index vector chunks asynchronously in the background
    indexDocumentChunks(savedDoc.id, normalized.value, cleanContent).catch((ragErr) => {
      console.warn('⚠️ Background RAG indexing error on text document creation:', ragErr.message);
    });

    return res.status(201).json(savedDoc);
  } catch (err) {
    console.error('Create Document Error:', err);
    return res.status(500).json({ message: err.message || 'Error creating document.' });
  }
});

// ── POST /api/documents/upload — Parse and store uploaded file ───────────────
// Supports: PDF, DOCX, DOC, PPTX, XLSX, XLS, CSV, TXT, MD, JSON
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { workspace_id, title } = req.body;
    const normalized = normalizeWorkspaceId(workspace_id);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    if (!normalized.valid) {
      return res.status(400).json({ message: 'workspace_id must be a valid integer or UUID.' });
    }

    const hasAccess = await userHasWorkspaceAccess(normalized.value, req.user);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not own this workspace.' });
    }

    // Delegate multi-format parsing to dedicated parser service
    const { content_text, detectedType } = await parseUploadedDocument(file);

    if (!content_text || !content_text.trim()) {
      return res.status(400).json({
        message: 'Could not extract text from the uploaded document. Please check the file and try again.',
      });
    }

    const docTitle = (title || file.originalname).trim();
    const cleanContent = content_text.replace(/\0/g, '').trim();

    let result;
    try {
      result = await pool.query(
        'INSERT INTO documents (workspace_id, title, content_text, file_type, file_size) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [normalized.value, docTitle, cleanContent, detectedType, file.size || Buffer.byteLength(cleanContent, 'utf-8')]
      );
    } catch {
      result = await pool.query(
        'INSERT INTO documents (workspace_id, title, content_text) VALUES ($1, $2, $3) RETURNING *',
        [normalized.value, docTitle, cleanContent]
      );
    }

    const savedDoc = result.rows[0];

    // Return immediately to client and index vector chunks asynchronously in the background
    indexDocumentChunks(savedDoc.id, normalized.value, cleanContent).catch((ragErr) => {
      console.warn(`⚠️ Background RAG indexing error on file upload (doc ${savedDoc.id}):`, ragErr.message);
    });

    return res.status(201).json(savedDoc);
  } catch (err) {
    console.error('File Upload Parse Error:', err);
    return res.status(500).json({ message: err.message || 'Error processing file upload.' });
  }
});

// ── DELETE /api/documents/:id — Delete a document (Strict Tenant Ownership Check) ──
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userIdNum = parseInt(req.user.id, 10);
    const userIdStr = String(req.user.id);

    // Enforce workspace ownership before deletion
    const result = await pool.query(
      `DELETE FROM documents d
       USING workspaces w
       WHERE d.id = $1
         AND d.workspace_id = w.id
         AND (w.user_id = $2 OR w.owner_id = $3)
       RETURNING d.*`,
      [id, isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found or access denied.' });
    }

    return res.json({ message: 'Document deleted successfully.', document: result.rows[0] });
  } catch (err) {
    console.error('Delete Document Error:', err);
    return res.status(500).json({ message: err.message || 'Error deleting document.' });
  }
});

module.exports = router;
