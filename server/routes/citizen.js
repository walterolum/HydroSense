/**
 * HYDROSENSE — Citizen Module API
 * Public environmental data, discussions, volunteer events,
 * citizen observations, and personal achievements.
 */
const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

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
   DISCUSSIONS (auth required)
───────────────────────────────────────────────────────────── */
router.get('/discussions', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { category, limit = 20, offset = 0 } = req.query;
  let sql = `SELECT d.*, u.avatar as user_avatar,
    EXISTS(SELECT 1 FROM discussion_likes WHERE discussion_id=d.id AND user_id=?) as i_liked
    FROM citizen_discussions d LEFT JOIN users u ON d.user_id=u.id WHERE 1=1`;
  const params = [req.user.id];
  if (category && category !== 'all') {sql += ' AND d.category=?';params.push(category);}
  sql += ` ORDER BY d.pinned DESC, d.created_at DESC LIMIT ${+limit} OFFSET ${+offset}`;
  const rows = await db.prepare(sql).all(...params);
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM citizen_discussions${category && category !== 'all' ? ' WHERE category=?' : ''}`).get(...(category && category !== 'all' ? [category] : []))).c;
  res.json({ success: true, data: rows, total });
});

router.post('/discussions', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { title, content, category = 'general' } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ success: false, error: 'Title and content required' });
  const VALID_CATS = ['general', 'water_quality', 'pollution', 'climate', 'health', 'events', 'governance'];
  if (!VALID_CATS.includes(category)) return res.status(400).json({ success: false, error: 'Invalid category' });
  const r = await db.prepare(`INSERT INTO citizen_discussions (user_id, author_name, title, content, category) VALUES (?,?,?,?,?)`).run(req.user.id, req.user.name, title.trim(), content.trim(), category);
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
  await db.prepare(`INSERT INTO citizen_replies (discussion_id, user_id, author_name, content) VALUES (?,?,?,?)`).run(+req.params.id, req.user.id, req.user.name, content.trim());
  await db.prepare(`UPDATE citizen_discussions SET reply_count=reply_count+1 WHERE id=?`).run(+req.params.id);
  res.status(201).json({ success: true });
});

/* ─────────────────────────────────────────────────────────────
   VOLUNTEER EVENTS (auth required)
───────────────────────────────────────────────────────────── */
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
  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

router.post('/events/:id/join', authMiddleware, async (req, res) => {
  const db = await getDb();
  const eid = +req.params.id;
  const ev = await db.prepare(`SELECT * FROM volunteer_events WHERE id=? AND status='active'`).get(eid);
  if (!ev) return res.status(404).json({ success: false, error: 'Event not found' });
  const count = (await db.prepare(`SELECT COUNT(*) as c FROM event_registrations WHERE event_id=?`).get(eid)).c;
  if (count >= ev.max_volunteers) return res.status(400).json({ success: false, error: 'Event is full' });
  await db.prepare(`INSERT OR IGNORE INTO event_registrations (event_id, user_id) VALUES (?,?)`).run(eid, req.user.id);
  res.json({ success: true, message: 'You have joined this event!' });
});

router.delete('/events/:id/leave', authMiddleware, async (req, res) => {
  const db = await getDb();
  await db.prepare(`DELETE FROM event_registrations WHERE event_id=? AND user_id=?`).run(+req.params.id, req.user.id);
  res.json({ success: true, message: 'You have left this event.' });
});

/* ─────────────────────────────────────────────────────────────
   CITIZEN OBSERVATIONS (auth required)
───────────────────────────────────────────────────────────── */
router.get('/observations', authMiddleware, async (req, res) => {
  const db = await getDb();
  const rows = await db.prepare(`SELECT * FROM citizen_observations ORDER BY created_at DESC LIMIT 50`).all();
  res.json({ success: true, data: rows });
});

router.post('/observations', authMiddleware, async (req, res) => {
  const db = await getDb();
  const { observation_type, district, location, description, value, unit, lat, lng, photo_base64 } = req.body;
  if (!observation_type || !description) return res.status(400).json({ success: false, error: 'Type and description required' });
  const r = await db.prepare(`INSERT INTO citizen_observations (user_id, author_name, observation_type, district, location, description, value, unit, lat, lng, photo_base64) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, req.user.name, observation_type, district, location, description, value, unit, lat, lng, photo_base64 || null);
  res.status(201).json({ success: true, id: r.lastInsertRowid });
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