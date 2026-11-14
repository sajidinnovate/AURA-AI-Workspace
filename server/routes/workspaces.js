const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Apply Auth Middleware to all workspace routes
router.use(authMiddleware);

// GET /api/workspaces - Fetch all workspaces for the logged-in user
router.get('/', async (req, res) => {
  try {
    const userIdNum = parseInt(req.user.id, 10);
    const userIdStr = String(req.user.id);

    const result = await pool.query(
      'SELECT * FROM workspaces WHERE user_id = $1 OR owner_id = $2 ORDER BY created_at DESC',
      [isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Fetch Workspaces Error:', err);
    return res.status(500).json({ message: err.message || 'Error fetching workspaces.' });
  }
});

// POST /api/workspaces - Create a new workspace
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Workspace name is required.' });
    }

    const userIdNum = parseInt(req.user.id, 10);
    const userIdStr = String(req.user.id);
    const safeName = name.trim();
    const safeDescription = description ? description.trim() : '';

    const result = await pool.query(
      'INSERT INTO workspaces (user_id, owner_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [isNaN(userIdNum) ? null : userIdNum, userIdStr, safeName, safeDescription]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create Workspace Error:', err);
    return res.status(500).json({ message: err.message || 'Error creating workspace.' });
  }
});

// DELETE /api/workspaces/:id - Delete a workspace
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userIdNum = parseInt(req.user.id, 10);
    const userIdStr = String(req.user.id);

    const result = await pool.query(
      'DELETE FROM workspaces WHERE id = $1 AND (user_id = $2 OR owner_id = $3) RETURNING *',
      [id, isNaN(userIdNum) ? null : userIdNum, userIdStr]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Workspace not found or unauthorized.' });
    }

    return res.json({ message: 'Workspace deleted successfully.', workspace: result.rows[0] });
  } catch (err) {
    console.error('Delete Workspace Error:', err);
    return res.status(500).json({ message: err.message || 'Error deleting workspace.' });
  }
});

module.exports = router;
