/**
 * HYDROSENSE — Citizen Module API
 * Public environmental data, discussions, volunteer events,
 * citizen observations, and personal achievements.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyRoles } = require('../utils/notify');

const router = express.Router();

// ── Multer for citizen image uploads ──
const CITIZEN_UPLOAD = path.join(__dirname, '..', 'uploads', 'citizen');
if (!fs.existsSync(CITIZEN_UPLOAD)) fs.mkdirSync(CITIZEN_UPLOAD, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CITIZEN_UPLOAD),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${path.extname(file.originalname) || '.jpg'}`)
});
const uploadCitizen = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => /\.(jpg|jpeg|png|gif|webp)$/i.test(path.extname(file.originalname)) ? cb(null, true) : cb(new Error('Only image files allowed')) });

/* ─────────────────────────────────────────────────────────────
   PUBLIC ENVIRONMENTAL DASHBOARD (no auth needed)
───────────────────────────────────────────────────────────── */
router.get('/dashboard', async (req, res) => {
  const db = await getDb();
  try {
    const totalWP = (await db.prepare(`SELECT COUNT(*) as c FROM water_points`).get()).c;
    const funcWP = (await db.prepare(`SELECT COUNT(*) as c FROM water_points WHERE status='functional'`).get()).c;
    const activeAlerts = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE status='active'`).get()).c;
    const critAlerts = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE status='active' AND severity IN ('critical','emergency')`).get()).c;
    const recentAlerts = await db.prepare(`SELECT title, severity, district, created_at FROM alerts WHERE status='active' ORDER BY created_at DESC LIMIT 5`).all();

    const safeTests = (await db.prepare(`SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=1 AND tested_at > datetime('now','-30 days')`).get()).c;
    const totalTests = (await db.prepare(`SELECT COUNT(*) as c FROM water_quality_tests WHERE tested_at > datetime('now','-30 days')`).get()).c;
    const avgQuality = (await db.prepare(`SELECT AVG(water_safety_score) as avg FROM water_quality_tests WHERE tested_at > datetime('now','-30 days')`).get()).avg;

    const gwnTotal = (await db.prepare(`SELECT COUNT(*) as c FROM gwn_reports`).get()).c;
    const gwnToday = (await db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE date(created_at)=date('now')`).get()).c;
    const gwnCritical = (await db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE severity='critical' AND status != 'resolved'`).get()).c;
    const gwnRecent = await db.prepare(`SELECT report_type, severity, district, description, created_at FROM gwn_reports ORDER BY created_at DESC LIMIT 6`).all();

    const drought = await db.prepare(`SELECT severity, COUNT(*) as c FROM drought_index GROUP BY severity ORDER BY c DESC LIMIT 3`).all();
    const rainfall = await db.prepare(`SELECT AVG(rainfall_mm) as avg, MAX(rainfall_mm) as max FROM climate_readings WHERE timestamp > datetime('now','-7 days')`).get();
    const tempAvg = await db.prepare(`SELECT AVG(temperature_max) as avg FROM climate_readings WHERE timestamp > datetime('now','-7 days')`).get();

    const totalBene = (await db.prepare(`SELECT SUM(beneficiaries) as t FROM water_points WHERE status='functional'`).get()).t || 0;
    const districts = await db.prepare(`SELECT district, COUNT(*) as total, SUM(CASE WHEN status='functional' THEN 1 ELSE 0 END) as func FROM water_points GROUP BY district ORDER BY district`).all();

    res.json({
      success: true,
      data: {
        water: {
          total_points: totalWP, functional: funcWP,
          functionality_pct: totalWP ? Math.round(funcWP / totalWP * 100) : 0,
          beneficiaries: totalBene,
          quality_score: Math.round(avgQuality || 0),
          safe_tests_pct: totalTests ? Math.round(safeTests / totalTests * 100) : 0,
          districts
        },
        alerts: { total: activeAlerts, critical: critAlerts, recent: recentAlerts },
        gwn: { total: gwnTotal, today: gwnToday, critical: gwnCritical, recent: gwnRecent },
        climate: {
          drought_breakdown: drought,
          avg_rainfall_7d: Math.round((rainfall?.avg || 0) * 10) / 10,
          max_rainfall_7d: Math.round((rainfall?.max || 0) * 10) / 10,
          avg_temp_7d: Math.round((tempAvg?.avg || 0) * 10) / 10
        }
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────
   VOLUNTEER EVENTS (auth required)
   Support for online, physical, and hybrid event types
   with meeting links, reminders, and alarms.
   ───────────────────────────────────────────────────────────── */

// Ensure event tables exist
;(async () => {
  try {
    const db = await getDb();
    await db.exec(`CREATE TABLE IF NOT EXISTS event_metadata (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL UNIQUE REFERENCES volunteer_events(id),
      meeting_link TEXT,
      end_date TEXT,
      end_time TEXT,
      platform TEXT DEFAULT 'other',
      banner_image TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await db.exec(`CREATE TABLE IF NOT EXISTS event_reminders (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES volunteer_events(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      remind_at TIMESTAMPTZ NOT NULL,
      reminder_type TEXT DEFAULT 'push' CHECK(reminder_type IN ('push','email','sms','all')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','dismissed','snoozed')),
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  } catch {}
})();

router.get('/events', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { district, type } = req.query;
  let sql = `SELECT e.*,
    (SELECT COUNT(*) FROM event_registrations WHERE event_id=e.id)::int as registered_count,
    EXISTS(SELECT 1 FROM event_registrations WHERE event_id=e.id AND user_id=?) as i_joined,
    COALESCE(em.metadata::text, '{}') as metadata_json,
    em.meeting_link, em.end_date, em.end_time, em.platform, em.banner_image
    FROM volunteer_events e
    LEFT JOIN event_metadata em ON em.event_id = e.id
    WHERE e.status='active'`;
  const params = [req.user.id];
  if (district) { sql += ' AND e.district=$2'; params.push(district); }
  if (type) { sql += ' AND e.event_type=$' + (params.length + 1); params.push(type); }
  sql += ' ORDER BY e.event_date ASC';
  const rows = await db.prepare(sql).all(...params);
  res.json({ success: true, data: rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata_json || '{}') })) });
});

router.post('/events', authMiddleware, async (req, res) => {
  const db = await getDb();
  const ALLOWED = ['national_admin', 'district_officer', 'ngo_officer', 'community_committee'];
  if (!ALLOWED.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Only admins and NGOs can create events' });
  const {
    title, description, location, district,
    event_date, event_time, event_type = 'cleanup', max_volunteers = 50,
    // Extended fields
    online_type, meeting_link, venue, end_date, end_time, platform,
    banner_image, reminder_minutes = 60
  } = req.body;
  if (!title || !event_date) return res.status(400).json({ success: false, error: 'Title and date required' });
  const VALID_TYPES = ['cleanup', 'planting', 'awareness', 'monitoring', 'training', 'online', 'physical', 'hybrid'];
  if (!VALID_TYPES.includes(event_type)) return res.status(400).json({ success: false, error: 'Invalid event type' });

  const r = await db.prepare(`INSERT INTO volunteer_events (title, description, location, district, event_date, event_time, event_type, max_volunteers, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`).run(title, description, location, district, event_date, event_time, event_type, max_volunteers, req.user.id);
  const eid = r.lastInsertRowid;

  // Store extended metadata
  const meta = { online_type, meeting_link, venue, end_date, end_time, platform, banner_image, reminder_minutes };
  await db.prepare(`INSERT INTO event_metadata (event_id, meeting_link, end_date, end_time, platform, banner_image, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (event_id) DO UPDATE SET meeting_link=excluded.meeting_link, end_date=excluded.end_date, end_time=excluded.end_time, platform=excluded.platform, banner_image=excluded.banner_image, metadata=excluded.metadata`)
    .run(eid, meeting_link || null, end_date || null, end_time || null, platform || 'other', banner_image || null, JSON.stringify(meta));

  // Auto-reminder for creator
  if (reminder_minutes && event_time) {
    const remindAt = new Date(`${event_date}T${event_time}`);
    remindAt.setMinutes(remindAt.getMinutes() - reminder_minutes);
    await db.prepare(`INSERT INTO event_reminders (event_id, user_id, remind_at) VALUES ($1,$2,$3)`)
      .run(eid, req.user.id, remindAt.toISOString());
  }

  const dateLabel = event_date + (event_time ? ` at ${event_time}` : '');
  const locationLabel = location ? ` at ${location}` : '';
  notifyRoles(
    ['citizen', 'community_committee', 'ngo_officer', 'district_officer', 'national_admin'],
    district || null,
    `📅 New Event: ${title}`,
    `${req.user.name} has scheduled a ${event_type.replace(/_/g, ' ')} event on ${dateLabel}${locationLabel}${district ? ` in ${district}` : ''}. Join now!`,
    'volunteer_event', eid
  );

  res.status(201).json({ success: true, id: eid });
});

router.put('/events/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
  const ALLOWED = ['national_admin', 'district_officer', 'ngo_officer', 'community_committee'];
  if (!ALLOWED.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  const { title, description, location, district, event_date, event_time, event_type, max_volunteers, status, meeting_link, end_date, end_time, platform } = req.body;
  const existing = await db.prepare(`SELECT * FROM volunteer_events WHERE id=$1`).get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: 'Event not found' });
  await db.prepare(`UPDATE volunteer_events SET title=COALESCE($1,title), description=COALESCE($2,description), location=COALESCE($3,location), district=COALESCE($4,district), event_date=COALESCE($5,event_date), event_time=COALESCE($6,event_time), event_type=COALESCE($7,event_type), max_volunteers=COALESCE($8,max_volunteers), status=COALESCE($9,status), updated_at=NOW() WHERE id=$10`)
    .run(title, description, location, district, event_date, event_time, event_type, max_volunteers, status, req.params.id);
  if (meeting_link || end_date || end_time || platform) {
    await db.prepare(`INSERT INTO event_metadata (event_id, meeting_link, end_date, end_time, platform) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (event_id) DO UPDATE SET meeting_link=COALESCE(excluded.meeting_link,event_metadata.meeting_link), end_date=COALESCE(excluded.end_date,event_metadata.end_date), end_time=COALESCE(excluded.end_time,event_metadata.end_time), platform=COALESCE(excluded.platform,event_metadata.platform)`)
      .run(req.params.id, meeting_link, end_date, end_time, platform);
  }
  res.json({ success: true });
});

router.post('/discussions', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { title, content, category = 'general' } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ success: false, error: 'Title and content required' });
  const VALID_CATS = ['general', 'water_quality', 'pollution', 'climate', 'health', 'events', 'governance'];
  if (!VALID_CATS.includes(category)) return res.status(400).json({ success: false, error: 'Invalid category' });
  const r = await db.prepare(`INSERT INTO citizen_discussions (user_id, author_name, title, content, category) VALUES (?,?,?,?,?)`).run(req.user.id, req.user.name, title.trim(), content.trim(), category);

  // Notify roles that care about this category
  const CAT_ROLES = {
    water_quality: ['health_officer', 'district_officer', 'citizen', 'community_committee', 'ngo_officer'],
    pollution:     ['health_officer', 'climate_scientist', 'district_officer', 'citizen', 'ngo_officer'],
    climate:       ['climate_scientist', 'district_officer', 'citizen'],
    health:        ['health_officer', 'district_officer', 'citizen', 'community_committee'],
    events:        ['citizen', 'community_committee', 'ngo_officer', 'district_officer'],
    governance:    ['district_officer', 'national_admin', 'community_committee'],
    general:       ['citizen', 'community_committee', 'ngo_officer'],
  };
  const roles = CAT_ROLES[category] || ['citizen', 'community_committee'];
  notifyRoles(
    roles, req.user.district || null,
    `New discussion: ${title.trim().slice(0, 60)}`,
    `${req.user.name} posted in ${category.replace(/_/g, ' ')}: "${title.trim().slice(0, 80)}"`,
    'discussion', r.lastInsertRowid
  );

  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

router.post('/discussions/:id/like', authMiddleware, async (req, res) => {
  const db = await getDb();
  const did = +req.params.id;
  const existing = await db.prepare(`SELECT 1 FROM discussion_likes WHERE discussion_id=? AND user_id=?`).get(did, req.user.id);
  if (existing) {
    await db.prepare(`DELETE FROM discussion_likes WHERE discussion_id=? AND user_id=?`).run(did, req.user.id);
    await db.prepare(`UPDATE citizen_discussions SET like_count=MAX(0,like_count-1) WHERE id=?`).run(did);
    res.json({ success: true, liked: false });
  } else {
    await db.prepare(`INSERT OR IGNORE INTO discussion_likes (discussion_id, user_id) VALUES (?,?)`).run(did, req.user.id);
    await db.prepare(`UPDATE citizen_discussions SET like_count=like_count+1 WHERE id=?`).run(did);
    res.json({ success: true, liked: true });
  }
});

router.get('/discussions/:id/replies', authMiddleware, async (req, res) => {
  const db = await getDb();
  const rows = await db.prepare(`SELECT r.*, u.avatar as user_avatar FROM citizen_replies r LEFT JOIN users u ON r.user_id=u.id WHERE r.discussion_id=? ORDER BY r.created_at ASC`).all(req.params.id);
  res.json({ success: true, data: rows });
});

router.post('/discussions/:id/replies', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'Reply content required' });
  const did = +req.params.id;
  await db.prepare(`INSERT INTO citizen_replies (discussion_id, user_id, author_name, content) VALUES (?,?,?,?)`).run(did, req.user.id, req.user.name, content.trim());
  await db.prepare(`UPDATE citizen_discussions SET reply_count=reply_count+1 WHERE id=?`).run(did);

  // Notify the discussion author (if not the same person replying)
  const disc = db.prepare(`SELECT user_id, author_name, title, district FROM citizen_discussions WHERE id=?`).get(did);
  if (disc && disc.user_id !== req.user.id) {
    const author = db.prepare(`SELECT role FROM users WHERE id=?`).get(disc.user_id);
    if (author) {
      // Insert a personal notification for the discussion author
      db.prepare(
        `INSERT INTO notification_log (recipient_type, recipient_id, channel, subject, message, status, reference_type, reference_id, district)
         VALUES (?, ?, 'in_app', ?, ?, 'sent', 'discussion', ?, ?)`
      ).run(
        author.role, disc.user_id,
        `New reply on your discussion`,
        `${req.user.name} replied to your post "${disc.title.slice(0, 60)}": "${content.trim().slice(0, 100)}"`,
        did, disc.district || null
      );
    }
  }

  res.status(201).json({ success: true });
});

// ── Enhanced discussion features ──
router.put('/discussions/:id/pin', authMiddleware, async (req, res) => {
  const db = await getDb();
  const allowed = ['national_admin', 'district_officer', 'community_committee'];
  if (!allowed.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
  const disc = await db.prepare(`SELECT pinned FROM citizen_discussions WHERE id=?`).get(req.params.id);
  if (!disc) return res.status(404).json({ success: false, error: 'Discussion not found' });
  await db.prepare(`UPDATE citizen_discussions SET pinned=? WHERE id=?`).run(disc.pinned ? 0 : 1, req.params.id);
  res.json({ success: true, pinned: !disc.pinned });
});

router.put('/discussions/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { title, content, category } = req.body;
  const disc = await db.prepare(`SELECT * FROM citizen_discussions WHERE id=?`).get(req.params.id);
  if (!disc) return res.status(404).json({ success: false, error: 'Discussion not found' });
  if (disc.user_id !== req.user.id && req.user.role !== 'national_admin')
    return res.status(403).json({ success: false, error: 'Not authorized' });
  await db.prepare(`UPDATE citizen_discussions SET title=COALESCE(?,title), content=COALESCE(?,content), category=COALESCE(?,category) WHERE id=?`)
    .run(title || null, content || null, category || null, req.params.id);
  res.json({ success: true });
});

router.delete('/discussions/:id', authMiddleware, async (req, res) => {
  const db = await getDb();
  const disc = await db.prepare(`SELECT * FROM citizen_discussions WHERE id=?`).get(req.params.id);
  if (!disc) return res.status(404).json({ success: false, error: 'Discussion not found' });
  if (disc.user_id !== req.user.id && req.user.role !== 'national_admin')
    return res.status(403).json({ success: false, error: 'Not authorized' });
  await db.prepare(`DELETE FROM discussion_likes WHERE discussion_id=?`).run(req.params.id);
  await db.prepare(`DELETE FROM citizen_replies WHERE discussion_id=?`).run(req.params.id);
  await db.prepare(`DELETE FROM citizen_discussions WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

router.get('/discussions/search', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { q, category, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
  let sql = `SELECT d.*, u.avatar as user_avatar,
    EXISTS(SELECT 1 FROM discussion_likes WHERE discussion_id=d.id AND user_id=?) as i_liked
    FROM citizen_discussions d LEFT JOIN users u ON d.user_id=u.id
    WHERE (d.title ILIKE ? OR d.content ILIKE ?)`;
  const params = [req.user.id, `%${q}%`, `%${q}%`];
  if (category && category !== 'all') { sql += ' AND d.category=?'; params.push(category); }
  sql += ` ORDER BY d.pinned DESC, d.like_count DESC LIMIT ${parseInt(limit)}`;
  const rows = await db.prepare(sql).all(...params);
  res.json({ success: true, data: rows, total: rows.length });
});

router.post('/discussions/upload-image', authMiddleware, uploadCitizen.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded' });
  const url = `/uploads/citizen/${req.file.filename}`;
  res.json({ success: true, data: { url, name: req.file.originalname, size: req.file.size } });
});
router.get('/events', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { district } = req.query;
  let sql = `SELECT e.*,
    (SELECT COUNT(*) FROM event_registrations WHERE event_id=e.id) as registered_count,
    EXISTS(SELECT 1 FROM event_registrations WHERE event_id=e.id AND user_id=?) as i_joined
    FROM volunteer_events e WHERE e.status='active'`;
  const params = [req.user.id];
  if (district) {sql += ' AND e.district=?';params.push(district);}
  sql += ' ORDER BY e.event_date ASC';
  const rows = await db.prepare(sql).all(...params);
  res.json({ success: true, data: rows });
});

router.post('/events', authMiddleware, async (req, res) => {
  const db = await getDb();
  const ALLOWED = ['national_admin', 'district_officer', 'ngo_officer', 'community_committee'];
  if (!ALLOWED.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Only admins and NGOs can create events' });
  const { title, description, location, district, event_date, event_time, event_type = 'cleanup', max_volunteers = 50 } = req.body;
  if (!title || !event_date) return res.status(400).json({ success: false, error: 'Title and date required' });
  const r = await db.prepare(`INSERT INTO volunteer_events (title, description, location, district, event_date, event_time, event_type, max_volunteers, created_by) VALUES (?,?,?,?,?,?,?,?,?)`).run(title, description, location, district, event_date, event_time, event_type, max_volunteers, req.user.id);
  const eid = r.lastInsertRowid;

  // Notify all community-relevant roles about the new event
  const dateLabel = event_date + (event_time ? ` at ${event_time}` : '');
  const locationLabel = location ? ` at ${location}` : '';
  notifyRoles(
    ['citizen', 'community_committee', 'ngo_officer', 'district_officer', 'national_admin'],
    district || null,
    `📅 New Event: ${title}`,
    `${req.user.name} has scheduled a ${event_type.replace(/_/g, ' ')} event on ${dateLabel}${locationLabel}${district ? ` in ${district}` : ''}. Join now!`,
    'volunteer_event', eid
  );

  res.status(201).json({ success: true, id: eid });
});

router.post('/events/:id/join', authMiddleware, async (req, res) => {
  const db = await getDb();
  const eid = +req.params.id;
  const ev = await db.prepare(`SELECT * FROM volunteer_events WHERE id=$1 AND status='active'`).get(eid);
  if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });
  const count = (await db.prepare(`SELECT COUNT(*) as c FROM event_registrations WHERE event_id=$1`).get(eid)).c;
  if (count >= ev.max_volunteers) return res.status(400).json({ success: false, error: 'Event is full' });
  await db.prepare(`INSERT INTO event_registrations (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`).run(eid, req.user.id);

  // Auto-create a reminder 1 hour before
  if (ev.event_time) {
    const remindAt = new Date(`${ev.event_date}T${ev.event_time}`);
    remindAt.setMinutes(remindAt.getMinutes() - 60);
    await db.prepare(`INSERT INTO event_reminders (event_id, user_id, remind_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`)
      .run(eid, req.user.id, remindAt.toISOString());
  }

  const dateLabel = ev.event_date + (ev.event_time ? ` at ${ev.event_time}` : '');
  db.prepare(`INSERT INTO notification_log (recipient_type, recipient_id, channel, subject, message, status, reference_type, reference_id, district) VALUES ($1,$2,'in_app',$3,$4,'sent','volunteer_event',$5,$6)`)
    .run(req.user.role, req.user.id, `✅ Registered: ${ev.title}`, `You're registered for "${ev.title}" on ${dateLabel}${ev.location ? ` at ${ev.location}` : ''}. See you there!`, eid, ev.district || null);

  res.json({ success: true, message: 'You have joined this event!' });
});

router.delete('/events/:id/leave', authMiddleware, async (req, res) => {
  const db = await getDb();
  await db.prepare(`DELETE FROM event_registrations WHERE event_id=$1 AND user_id=$2`).run(+req.params.id, req.user.id);
  await db.prepare(`DELETE FROM event_reminders WHERE event_id=$1 AND user_id=$2`).run(+req.params.id, req.user.id);
  res.json({ success: true, message: 'You have left this event.' });
});

// ── Event Reminders & Alarms ──
router.get('/reminders', authMiddleware, async (req, res) => {
  const db = await getDb();
  const now = new Date().toISOString();
  const due = await db.prepare(`
    SELECT r.*, e.title as event_title, e.event_date, e.event_time, e.event_type, e.description as event_description, e.location,
      em.meeting_link, em.platform
    FROM event_reminders r
    JOIN volunteer_events e ON r.event_id = e.id
    LEFT JOIN event_metadata em ON em.event_id = e.id
    WHERE r.user_id = $1 AND r.status = 'pending' AND r.remind_at <= $2
    ORDER BY r.remind_at
  `).all(req.user.id, now);
  res.json({ success: true, data: due });
});

router.put('/reminders/:id/status', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { status } = req.body;
  await db.prepare(`UPDATE event_reminders SET status = $1 WHERE id = $2 AND user_id = $3`)
    .run(status || 'dismissed', req.params.id, req.user.id);
  res.json({ success: true });
});

router.post('/reminders/:id/snooze', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { minutes = 5 } = req.body;
  const r = await db.prepare(`SELECT * FROM event_reminders WHERE id=$1 AND user_id=$2`).get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ success: false, error: 'Reminder not found' });
  const newTime = new Date();
  newTime.setMinutes(newTime.getMinutes() + minutes);
  await db.prepare(`UPDATE event_reminders SET remind_at=$1, status='pending' WHERE id=$2`).run(newTime.toISOString(), req.params.id);
  res.json({ success: true, remind_at: newTime.toISOString() });
});

/* ─────────────────────────────────────────────────────────────
   CITIZEN OBSERVATIONS (auth required)
───────────────────────────────────────────────────────────── */
// Ensure status column exists
;(async () => {
  try { const db = await getDb(); await db.exec(`ALTER TABLE citizen_observations ADD COLUMN status TEXT DEFAULT 'new'`); } catch {}
  try { const db = await getDb(); await db.exec(`ALTER TABLE citizen_observations ADD COLUMN reviewed_by TEXT`); } catch {}
  try { const db = await getDb(); await db.exec(`ALTER TABLE citizen_observations ADD COLUMN review_note TEXT`); } catch {}
})();

// GET /observations — role-filtered list for staff; own observations for citizens
router.get('/observations', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { status, district: qDistrict, observation_type, limit = 100 } = req.query;
  const role = req.user.role;
  const userDistrict = req.user.district;

  let sql = `SELECT * FROM citizen_observations WHERE 1=1`;
  const params = [];

  // Citizens only see their own submissions
  if (role === 'citizen') {
    sql += ' AND user_id = ?'; params.push(req.user.id);
  } else if (role !== 'national_admin') {
    // District-scoped roles only see their district (unless a filter overrides)
    const d = qDistrict || userDistrict;
    if (d) { sql += ' AND district = ?'; params.push(d); }
  } else if (qDistrict) {
    sql += ' AND district = ?'; params.push(qDistrict);
  }

  if (status)           { sql += ' AND status = ?';           params.push(status); }
  if (observation_type) { sql += ' AND observation_type = ?'; params.push(observation_type); }

  sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)}`;
  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows, total: rows.length });
});

// POST /observations — submit new observation + notify staff
router.post('/observations', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { observation_type, district, location, description, value, unit, lat, lng, photo_base64 } = req.body;
  if (!observation_type || !description) return res.status(400).json({ success: false, error: 'Type and description required' });

  const r = db.prepare(
    `INSERT INTO citizen_observations (user_id, author_name, observation_type, district, location, description, value, unit, lat, lng, photo_base64, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'new')`
  ).run(req.user.id, req.user.name, observation_type, district, location, description, value, unit, lat, lng, photo_base64 || null);

  // Determine which roles to notify based on observation type
  const obsLower = (observation_type || '').toLowerCase();
  const roles = ['district_officer'];
  if (/fish|health|disease|dead|contamin|algae/.test(obsLower)) roles.push('health_officer');
  if (/flood|overflow|climate|discharge|industrial/.test(obsLower)) roles.push('climate_scientist');
  if (/dump|illegal|oil|pollution/.test(obsLower)) roles.push('ngo_officer');

  try {
    notifyRoles(
      [...new Set(roles)], district,
      `New environmental observation: ${observation_type}`,
      `${req.user.name} reported a ${observation_type} in ${district}${location ? ' (' + location + ')' : ''}. Review required.`,
      'citizen_observation', r.lastInsertRowid
    );
  } catch {}

  res.status(201).json({ success: true, id: r.lastInsertRowid, message: 'Observation submitted. Relevant officers have been notified.' });
});

// PATCH /observations/:id/status — staff review action
router.patch('/observations/:id/status', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { status, review_note } = req.body;
  const valid = ['new', 'under_review', 'resolved', 'escalated'];
  if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  db.prepare(
    `UPDATE citizen_observations SET status=?, reviewed_by=?, review_note=? WHERE id=?`
  ).run(status, req.user.name, review_note || null, req.params.id);
  res.json({ success: true });
});

/* ─────────────────────────────────────────────────────────────
   PERSONAL ACHIEVEMENTS & STATS (auth required)
───────────────────────────────────────────────────────────── */
router.get('/achievements', authMiddleware, async (req, res) => {
  const db = await getDb();
  const uid = req.user.id;

  const gwnCount = (await db.prepare(`SELECT COUNT(*) as c FROM gwn_reports WHERE reporter_name=?`).get(req.user.name))?.c || 0;
  const discCount = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_discussions WHERE user_id=?`).get(uid))?.c || 0;
  const replyCount = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_replies WHERE user_id=?`).get(uid))?.c || 0;
  const eventCount = (await db.prepare(`SELECT COUNT(*) as c FROM event_registrations WHERE user_id=?`).get(uid))?.c || 0;
  const obsCount = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_observations WHERE user_id=?`).get(uid))?.c || 0;

  const badges = [];
  const b = (id, name, icon, desc, earned) => earned && badges.push({ id, name, icon, description: desc });

  b('first_report', 'First Reporter', '🚨', 'Submitted your first pollution report', gwnCount >= 1);
  b('active_reporter', 'Active Reporter', '📸', 'Submitted 5+ pollution reports', gwnCount >= 5);
  b('guardian', 'Water Guardian', '🛡️', 'Submitted 25+ pollution reports', gwnCount >= 25);
  b('hero', 'Environmental Hero', '🌟', 'Submitted 50+ pollution reports', gwnCount >= 50);
  b('first_voice', 'Community Voice', '💬', 'Started your first discussion', discCount >= 1);
  b('discusser', 'Active Discusser', '🗣️', 'Started 5+ community discussions', discCount >= 5);
  b('helper', 'Community Helper', '🤝', 'Replied to 10+ discussions', replyCount >= 10);
  b('volunteer', 'Volunteer', '💪', 'Joined a volunteer event', eventCount >= 1);
  b('dedicated', 'Dedicated Volunteer', '🎖️', 'Joined 3+ volunteer events', eventCount >= 3);
  b('scientist', 'Citizen Scientist', '🔬', 'Submitted environmental observations', obsCount >= 1);
  b('data_hero', 'Data Champion', '📊', 'Submitted 10+ environmental observations', obsCount >= 10);

  const score = gwnCount * 10 + discCount * 5 + replyCount * 2 + eventCount * 15 + obsCount * 8;
  const level = score >= 300 ? 'Expert Guardian' :
  score >= 150 ? 'Advanced Advocate' :
  score >= 60 ? 'Active Citizen' :
  score >= 20 ? 'Community Member' :
  'Newcomer';

  const myGwnReports = await db.prepare(`SELECT report_type, severity, status, district, created_at FROM gwn_reports WHERE reporter_name=? ORDER BY created_at DESC LIMIT 8`).all(req.user.name);
  const myDiscussions = await db.prepare(`SELECT id, title, category, like_count, reply_count, created_at FROM citizen_discussions WHERE user_id=? ORDER BY created_at DESC LIMIT 8`).all(uid);
  const myEvents = await db.prepare(`SELECT e.title, e.event_date, e.district, e.event_type, er.joined_at FROM event_registrations er JOIN volunteer_events e ON er.event_id=e.id WHERE er.user_id=? ORDER BY er.joined_at DESC LIMIT 6`).all(uid);

  res.json({
    success: true,
    data: {
      score, level, badges,
      stats: { gwnCount, discCount, replyCount, eventCount, obsCount },
      myGwnReports, myDiscussions, myEvents
    }
  });
});

module.exports = router;