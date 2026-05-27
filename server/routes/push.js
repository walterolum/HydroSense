const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { notifyRoles } = require('../utils/notify');

const router = express.Router();
router.use(authMiddleware);

// POST /api/notifications/push/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const db = await getDb();
    const { subscription, platform = 'web', device_name } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Invalid subscription object' });
    }

    // Upsert subscription
    const existing = await db.prepare(
      `SELECT id FROM push_subscriptions WHERE endpoint = $1`
    ).get(subscription.endpoint);

    if (existing) {
      await db.prepare(
        `UPDATE push_subscriptions SET user_id = $1, auth = $2, p256dh = $3, platform = $4, device_name = $5, updated_at = NOW()
         WHERE id = $6`
      ).run(
        req.user.id,
        subscription.keys?.auth || null,
        subscription.keys?.p256dh || null,
        platform,
        device_name || null,
        existing.id
      );
    } else {
      await db.prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, auth, p256dh, platform, device_name)
         VALUES ($1, $2, $3, $4, $5, $6)`
      ).run(
        req.user.id,
        subscription.endpoint,
        subscription.keys?.auth || null,
        subscription.keys?.p256dh || null,
        platform,
        device_name || null
      );
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/notifications/push/unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const db = await getDb();
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, error: 'endpoint required' });

    await db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`)
      .run(endpoint, req.user.id);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/notifications/push/subscriptions
router.get('/subscriptions', async (req, res) => {
  try {
    const db = await getDb();
    const subs = await db.prepare(
      `SELECT id, endpoint, platform, device_name, created_at, updated_at
       FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`
    ).all(req.user.id);

    res.json({ success: true, data: subs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/notifications/preferences
router.get('/preferences', async (req, res) => {
  try {
    const db = await getDb();
    let prefs = await db.prepare(
      `SELECT * FROM notification_preferences WHERE user_id = $1`
    ).get(req.user.id);

    if (!prefs) {
      // Create default preferences
      await db.prepare(
        `INSERT INTO notification_preferences (user_id) VALUES ($1)`
      ).run(req.user.id);
      prefs = await db.prepare(
        `SELECT * FROM notification_preferences WHERE user_id = $1`
      ).get(req.user.id);
    }

    res.json({ success: true, data: prefs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/notifications/preferences
router.put('/preferences', async (req, res) => {
  try {
    const db = await getDb();
    const {
      push_enabled, email_enabled, sms_enabled,
      sound_enabled, sound_volume,
      event_reminders, event_start_alarm, event_posted,
      discussion_replies, mentions, system_alerts,
      quiet_hours_start, quiet_hours_end,
    } = req.body;

    // Ensure preferences row exists
    const existing = await db.prepare(
      `SELECT id FROM notification_preferences WHERE user_id = $1`
    ).get(req.user.id);

    if (existing) {
      await db.prepare(`
        UPDATE notification_preferences SET
          push_enabled = COALESCE($1, push_enabled),
          email_enabled = COALESCE($2, email_enabled),
          sms_enabled = COALESCE($3, sms_enabled),
          sound_enabled = COALESCE($4, sound_enabled),
          sound_volume = COALESCE($5, sound_volume),
          event_reminders = COALESCE($6, event_reminders),
          event_start_alarm = COALESCE($7, event_start_alarm),
          event_posted = COALESCE($8, event_posted),
          discussion_replies = COALESCE($9, discussion_replies),
          mentions = COALESCE($10, mentions),
          system_alerts = COALESCE($11, system_alerts),
          quiet_hours_start = COALESCE($12, quiet_hours_start),
          quiet_hours_end = COALESCE($13, quiet_hours_end),
          updated_at = NOW()
        WHERE user_id = $14
      `).run(
        push_enabled ?? null, email_enabled ?? null, sms_enabled ?? null,
        sound_enabled ?? null, sound_volume ?? null,
        event_reminders ?? null, event_start_alarm ?? null, event_posted ?? null,
        discussion_replies ?? null, mentions ?? null, system_alerts ?? null,
        quiet_hours_start ?? null, quiet_hours_end ?? null,
        req.user.id
      );
    } else {
      await db.prepare(`
        INSERT INTO notification_preferences (user_id, push_enabled, email_enabled, sms_enabled, sound_enabled, sound_volume, event_reminders, event_start_alarm, event_posted, discussion_replies, mentions, system_alerts, quiet_hours_start, quiet_hours_end)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `).run(
        req.user.id,
        push_enabled ?? 1, email_enabled ?? 0, sms_enabled ?? 0,
        sound_enabled ?? 1, sound_volume ?? 70,
        event_reminders ?? 1, event_start_alarm ?? 1, event_posted ?? 1,
        discussion_replies ?? 1, mentions ?? 1, system_alerts ?? 1,
        quiet_hours_start ?? null, quiet_hours_end ?? null
      );
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
