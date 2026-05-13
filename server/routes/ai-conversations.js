const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { category, status } = req.query;
    let sql = `SELECT c.*, u.name as user_name,
      (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = c.id) as message_count,
      (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message
      FROM ai_conversations c LEFT JOIN users u ON c.user_id = u.id WHERE 1=1`;
    const params = [];
    if (category && category !== 'all') {sql += ' AND c.category = ?';params.push(category);}
    if (status) {sql += ' AND c.status = ?';params.push(status);}
    sql += ' ORDER BY c.updated_at DESC';
    res.json({ data: await db.prepare(sql).all(...params) });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const { title, category, incident_id, location_id, is_multi_user, participants } = req.body;
    const user = req.user;
    const result = await db.prepare(`INSERT INTO ai_conversations
      (title, user_id, role, district, category, incident_id, location_id, is_multi_user, participants)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      title || 'New Chat', user.id, user.role, user.district || null,
      category || 'general', incident_id || null, location_id || null,
      is_multi_user ? 1 : 0, participants || null
    );
    res.status(201).json({ data: { id: result.lastInsertRowid } });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const conv = await db.prepare(`SELECT c.*, u.name as user_name FROM ai_conversations c
      LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`).get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const messages = await db.prepare(`SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC`).all(req.params.id);
    res.json({ data: { ...conv, messages } });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { title, category, status, summary } = req.body;
    await db.prepare(`UPDATE ai_conversations SET
      title = COALESCE(?,title), category = COALESCE(?,category),
      status = COALESCE(?,status), summary = COALESCE(?,summary),
      updated_at = datetime('now') WHERE id = ?`).run(title, category, status, summary, req.params.id);
    res.json({ success: true });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.delete('/:id', async (req, res) => {
  try {
    (await getDb()).prepare('DELETE FROM ai_conversations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.post('/:id/messages', async (req, res) => {
  try {
    const db = await getDb();
    const { role, content, content_type, file_url, file_type, file_name, file_size, metadata, tokens_used } = req.body;
    const result = await db.prepare(`INSERT INTO ai_messages
      (conversation_id, role, content, content_type, file_url, file_type, file_name, file_size, metadata, tokens_used)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      req.params.id, role, content, content_type || 'text',
      file_url || null, file_type || null, file_name || null,
      file_size || null, metadata ? JSON.stringify(metadata) : null, tokens_used || 0
    );
    await db.prepare('UPDATE ai_conversations SET updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    res.status(201).json({ data: { id: result.lastInsertRowid } });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.get('/:id/history', async (req, res) => {
  try {
    const db = await getDb();
    const { limit = 50 } = req.query;
    const messages = await db.prepare(`SELECT * FROM ai_messages
      WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`).all(req.params.id, parseInt(limit));
    res.json({ data: messages.reverse() });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.post('/:id/summarize', async (req, res) => {
  try {
    const db = await getDb();
    const messages = await db.prepare(`SELECT role, content FROM ai_messages
      WHERE conversation_id = ? AND role != 'system' ORDER BY id ASC`).all(req.params.id);
    const text = messages.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 2000);
    const summary = text.length > 50 ? text.slice(0, 200) + '...' : 'Short conversation';
    await db.prepare('UPDATE ai_conversations SET summary = ?, updated_at = datetime(\'now\') WHERE id = ?').run(summary, req.params.id);
    res.json({ data: { summary } });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.get('/stats/overview', async (req, res) => {
  try {
    const db = await getDb();
    const total = await db.prepare('SELECT COUNT(*) as c FROM ai_conversations').get();
    const byCategory = await db.prepare('SELECT category, COUNT(*) as c FROM ai_conversations GROUP BY category').all();
    const activeChats = await db.prepare("SELECT COUNT(*) as c FROM ai_conversations WHERE status = 'active'").get();
    const totalMessages = await db.prepare('SELECT COUNT(*) as c FROM ai_messages').get();
    const decisions = await db.prepare('SELECT COUNT(*) as c FROM ai_decision_log').get();
    res.json({ data: { total: total.c, byCategory, activeChats: activeChats.c, totalMessages: totalMessages.c, decisions: decisions.c } });
  } catch (err) {res.status(500).json({ error: err.message });}
});

router.get('/decisions/log', async (req, res) => {
  try {
    const db = await getDb();
    const { limit = 50 } = req.query;
    const log = await db.prepare(`SELECT d.*, u.name as user_name FROM ai_decision_log d
      LEFT JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT ?`).all(parseInt(limit));
    res.json({ data: log });
  } catch (err) {res.status(500).json({ error: err.message });}
});

module.exports = router;