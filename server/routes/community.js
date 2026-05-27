const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
for (const sub of ['', 'images', 'videos', 'voice', 'files']) {
  const dir = sub ? path.join(UPLOAD_DIR, sub) : UPLOAD_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const mime = file.mimetype || '';
    if (mime.startsWith('image/')) cb(null, path.join(UPLOAD_DIR, 'images'));
    else if (mime.startsWith('video/')) cb(null, path.join(UPLOAD_DIR, 'videos'));
    else if (mime.startsWith('audio/')) cb(null, path.join(UPLOAD_DIR, 'voice'));
    else cb(null, path.join(UPLOAD_DIR, 'files'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg|mp3|wav|m4a|pdf|doc|docx|xls|xlsx|txt|csv)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('File type not supported'));
  }
});

async function ensureTables() {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS community_channels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'general' CHECK(type IN ('general','announcements','discussions','media','events','support')),
      created_by INTEGER REFERENCES users(id),
      is_private INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS community_messages (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES community_channels(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT DEFAULT '',
      message_type TEXT DEFAULT 'text' CHECK(message_type IN ('text','image','video','voice','file','system')),
      media_url TEXT,
      media_thumb TEXT,
      media_size INTEGER DEFAULT 0,
      duration INTEGER,
      reply_to INTEGER REFERENCES community_messages(id),
      delivery_status TEXT DEFAULT 'sent' CHECK(delivery_status IN ('sent','delivered','read','failed')),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS message_reads (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES community_messages(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      read_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS event_metadata (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL UNIQUE REFERENCES volunteer_events(id),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS event_reminders (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES volunteer_events(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      remind_at TIMESTAMPTZ NOT NULL,
      reminder_type TEXT DEFAULT 'push' CHECK(reminder_type IN ('push','email','sms','all')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','dismissed','snoozed')),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON community_messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON community_messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_message_reads_msg ON message_reads(message_id);
    CREATE INDEX IF NOT EXISTS idx_event_reminders ON event_reminders(event_id, user_id);
  `);
  const existing = await db.prepare("SELECT COUNT(*) as c FROM community_channels").get();
  if (parseInt(existing.c) === 0) {
    await db.prepare("INSERT INTO community_channels (name, description, type) VALUES ($1,$2,$3)").run('General', 'General community discussion', 'general');
    await db.prepare("INSERT INTO community_channels (name, description, type) VALUES ($1,$2,$3)").run('Announcements', 'Official announcements and updates', 'announcements');
    await db.prepare("INSERT INTO community_channels (name, description, type) VALUES ($1,$2,$3)").run('Water Reports', 'Report and discuss water issues', 'discussions');
    await db.prepare("INSERT INTO community_channels (name, description, type) VALUES ($1,$2,$3)").run('Events', 'Community events and meetups', 'events');
    await db.prepare("INSERT INTO community_channels (name, description, type) VALUES ($1,$2,$3)").run('Support', 'Get help and support', 'support');
  }
}
ensureTables();

// ── CHANNELS ──

router.get('/channels', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const channels = await db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM community_messages WHERE channel_id = c.id)::int as message_count,
        (SELECT content FROM community_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT u.name FROM community_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.channel_id = c.id ORDER BY cm.created_at DESC LIMIT 1) as last_message_user,
        (SELECT created_at FROM community_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM community_channels c ORDER BY c.type, c.name
    `).all();
    res.json({ success: true, data: channels });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/channels', authMiddleware, async (req, res) => {
  try {
    const { name, description, type, is_private } = req.body;
    const db = await getDb();
    const r = await db.prepare(
      'INSERT INTO community_channels (name, description, type, created_by, is_private) VALUES ($1,$2,$3,$4,$5)'
    ).run(name, description || '', type || 'general', req.user.id, is_private ? 1 : 0);
    res.json({ success: true, data: { id: r.lastInsertRowid } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── MESSAGES ──

router.get('/messages/:channelId', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { channelId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before;
    let rows;
    if (before) {
      rows = await db.prepare(`
        SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
        FROM community_messages m JOIN users u ON m.user_id = u.id
        WHERE m.channel_id = $1 AND m.id < $2
        ORDER BY m.created_at DESC LIMIT $3
      `).all(channelId, before, limit);
    } else {
      rows = await db.prepare(`
        SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
        FROM community_messages m JOIN users u ON m.user_id = u.id
        WHERE m.channel_id = $1
        ORDER BY m.created_at DESC LIMIT $2
      `).all(channelId, limit);
    }

    const messageIds = rows.map(r => r.id);
    let reads = [];
    if (messageIds.length > 0) {
      const placeholders = messageIds.map((_, i) => `$${i + 1}`).join(',');
      reads = await db.prepare(`
        SELECT mr.message_id, mr.user_id, u.name as reader_name, mr.read_at
        FROM message_reads mr JOIN users u ON mr.user_id = u.id
        WHERE mr.message_id IN (${placeholders})
      `).all(...messageIds);
    }
    const readMap = {};
    for (const r of reads) {
      if (!readMap[r.message_id]) readMap[r.message_id] = [];
      readMap[r.message_id].push({ user_id: r.user_id, name: r.reader_name, read_at: r.read_at });
    }

    res.json({
      success: true,
      data: rows.reverse().map(m => ({
        ...m, read_by: readMap[m.id] || [],
        is_read: (readMap[m.id] || []).length > 0,
        read_count: (readMap[m.id] || []).length,
      })),
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/messages', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { channel_id, content, message_type, media_url, reply_to } = req.body;
    if (!channel_id) return res.status(400).json({ success: false, error: 'channel_id required' });
    const r = await db.prepare(
      'INSERT INTO community_messages (channel_id, user_id, content, message_type, media_url, reply_to) VALUES ($1,$2,$3,$4,$5,$6)'
    ).run(channel_id, req.user.id, content || '', message_type || 'text', media_url || null, reply_to || null);
    const msg = await db.prepare(`
      SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
      FROM community_messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1
    `).get(r.lastInsertRowid);
    const io = req.app.get('io');
    if (io) {
      io.to(`channel_${channel_id}`).emit('new_message', msg);
      setTimeout(async () => {
        await db.prepare("UPDATE community_messages SET delivery_status = 'delivered' WHERE id = $1").run(msg.id);
        io.to(`channel_${channel_id}`).emit('message_delivered', { message_id: msg.id });
      }, 500);
    }
    await db.prepare("UPDATE community_channels SET updated_at = NOW() WHERE id = $1").run(channel_id);
    res.json({ success: true, data: msg });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/messages/:id/read', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    await db.prepare(
      'INSERT INTO message_reads (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING'
    ).run(id, req.user.id);
    const msg = await db.prepare("SELECT * FROM community_messages WHERE id = $1").get(id);
    if (msg && msg.user_id !== req.user.id) {
      const readCount = await db.prepare("SELECT COUNT(*) as c FROM message_reads WHERE message_id = $1").get(id);
      const allMembers = await db.prepare(
        "SELECT COUNT(*) as c FROM community_channels cc JOIN community_messages cm ON cm.channel_id = cc.id WHERE cm.id = $1"
      ).get(id);
      if (parseInt(readCount.c) >= Math.min(parseInt(allMembers.c), 2)) {
        await db.prepare("UPDATE community_messages SET delivery_status = 'read' WHERE id = $1").run(id);
      }
    }
    const io = req.app.get('io');
    if (io && msg) {
      io.to(`channel_${msg.channel_id}`).emit('message_read', {
        message_id: id, user_id: req.user.id, user_name: req.user.name, read_at: new Date().toISOString()
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── MEDIA UPLOAD ──

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const fileUrl = `/uploads/${path.relative(UPLOAD_DIR, req.file.path).replace(/\\/g, '/')}`;
    res.json({ success: true, data: { url: fileUrl, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/upload-multiple', authMiddleware, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded' });
    const files = req.files.map(f => ({
      url: `/uploads/${path.relative(UPLOAD_DIR, f.path).replace(/\\/g, '/')}`,
      name: f.originalname, size: f.size, mime: f.mimetype,
    }));
    res.json({ success: true, data: files });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── VOICE NOTES ──

router.post('/voice-notes', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No audio file' });
    const duration = parseInt(req.body.duration) || 0;
    const fileUrl = `/uploads/voice/${req.file.filename}`;
    const db = await getDb();
    const r = await db.prepare(
      "INSERT INTO community_messages (channel_id, user_id, content, message_type, media_url, media_size, duration) VALUES ($1,$2,'','voice',$3,$4,$5)"
    ).run(req.body.channel_id || 1, req.user.id, fileUrl, req.file.size, duration);
    const msg = await db.prepare(`
      SELECT m.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
      FROM community_messages m JOIN users u ON m.user_id = u.id WHERE m.id = $1
    `).get(r.lastInsertRowid);
    const io = req.app.get('io');
    if (io) io.to(`channel_${req.body.channel_id || 1}`).emit('new_message', msg);
    res.json({ success: true, data: { ...msg, duration } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ENHANCED EVENTS (online/physical/hybrid) ──

router.post('/events', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const {
      title, description, event_type, location, venue, meeting_link,
      district, event_date, event_time, end_date, end_time,
      max_participants, banner_image, reminder_minutes, platform
    } = req.body;

    if (!['online', 'physical', 'hybrid'].includes(event_type)) {
      return res.status(400).json({ success: false, error: 'Invalid event_type' });
    }

    const r = await db.prepare(`
      INSERT INTO volunteer_events
      (title, description, location, district, event_date, event_time, event_type, max_volunteers, created_by, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
    `).run(
      title, description || '', venue || location || '', district || '',
      event_date, event_time, event_type, max_participants || 100, req.user.id
    );
    const eventId = r.lastInsertRowid;

    const meta = { event_type, meeting_link, venue, end_date, end_time, platform, banner_image, reminder_minutes: reminder_minutes || 30 };
    await db.prepare(`
      INSERT INTO event_metadata (event_id, metadata) VALUES ($1,$2)
      ON CONFLICT (event_id) DO UPDATE SET metadata = excluded.metadata
    `).run(eventId, JSON.stringify(meta));

    if (reminder_minutes) {
      const remindAt = new Date(`${event_date}T${event_time}`);
      remindAt.setMinutes(remindAt.getMinutes() - reminder_minutes);
      await db.prepare(
        "INSERT INTO event_reminders (event_id, user_id, remind_at) VALUES ($1,$2,$3)"
      ).run(eventId, req.user.id, remindAt.toISOString());
    }

    const io = req.app.get('io');
    if (io) io.emit('new_event', { id: eventId, title, event_type, event_date, event_time, district });

    res.json({ success: true, data: { id: eventId } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/events/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { title, description, event_type, location, venue, meeting_link, event_date, event_time, end_date, end_time, max_participants, status } = req.body;
    const existing = await db.prepare("SELECT * FROM volunteer_events WHERE id = $1").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Event not found' });
    await db.prepare(`
      UPDATE volunteer_events SET title=$1, description=$2, location=$3, event_date=$4, event_time=$5, event_type=$6, max_volunteers=$7, status=$8, updated_at=NOW()
      WHERE id=$9
    `).run(
      title || existing.title, description || existing.description,
      location || existing.location, event_date || existing.event_date,
      event_time || existing.event_time, event_type || existing.event_type,
      max_participants || existing.max_volunteers, status || existing.status, req.params.id
    );
    const io = req.app.get('io');
    if (io) io.emit('event_updated', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/events', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const events = await db.prepare(`
      SELECT e.*,
        u.name as organizer_name,
        COALESCE(em.metadata::text, '{}') as metadata_json,
        (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id)::int as participant_count,
        (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id AND user_id = $1)::int as i_joined
      FROM volunteer_events e
      JOIN users u ON e.created_by = u.id
      LEFT JOIN event_metadata em ON em.event_id = e.id
      WHERE e.status = 'active'
      ORDER BY e.event_date DESC, e.event_time DESC
    `).all(req.user.id);
    res.json({ success: true, data: events.map(e => ({ ...e, metadata: JSON.parse(e.metadata_json || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/events/:id/join', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const event = await db.prepare("SELECT * FROM volunteer_events WHERE id = $1").get(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    const count = await db.prepare("SELECT COUNT(*) as c FROM event_registrations WHERE event_id = $1").get(req.params.id);
    if (parseInt(count.c) >= event.max_volunteers) return res.status(400).json({ success: false, error: 'Event is full' });
    await db.prepare("INSERT INTO event_registrations (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING").run(req.params.id, req.user.id);
    await db.prepare(
      "INSERT INTO event_reminders (event_id, user_id, remind_at) VALUES ($1,$2,NOW() + INTERVAL '1 hour') ON CONFLICT DO NOTHING"
    ).run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/events/:id/leave', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    await db.prepare("DELETE FROM event_registrations WHERE event_id = $1 AND user_id = $2").run(req.params.id, req.user.id);
    await db.prepare("DELETE FROM event_reminders WHERE event_id = $1 AND user_id = $2").run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── REMINDERS ──

router.get('/reminders', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    const due = await db.prepare(`
      SELECT r.*, e.title as event_title, e.event_date, e.event_time, e.event_type, e.description as event_description,
        COALESCE(em.metadata::text, '{}') as metadata_json
      FROM event_reminders r
      JOIN volunteer_events e ON r.event_id = e.id
      LEFT JOIN event_metadata em ON em.event_id = e.id
      WHERE r.user_id = $1 AND r.status = 'pending' AND r.remind_at <= $2
      ORDER BY r.remind_at
    `).all(req.user.id, now);
    res.json({ success: true, data: due.map(r => ({ ...r, metadata: JSON.parse(r.metadata_json || '{}') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/reminders/:id/status', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const { status } = req.body;
    await db.prepare("UPDATE event_reminders SET status = $1 WHERE id = $2 AND user_id = $3")
      .run(status || 'dismissed', req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PRESENCE ──

router.get('/presence', authMiddleware, async (req, res) => {
  try {
    const io = req.app.get('io');
    const sockets = await io.fetchSockets();
    const onlineUsers = new Map();
    for (const s of sockets) {
      const uid = s.data.user_id;
      if (uid) onlineUsers.set(uid, { user_id: uid, user_name: s.data.user_name, last_seen: new Date().toISOString() });
    }
    res.json({ success: true, data: Array.from(onlineUsers.values()) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
