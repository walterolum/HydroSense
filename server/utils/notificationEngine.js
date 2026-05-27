const { getDb } = require('../db');

let io = null;
let notifQueue = [];
let processing = false;

function setIO(socketIO) {
  io = socketIO;
}

async function enqueue(notif) {
  notifQueue.push(notif);
  if (!processing) processQueue();
}

async function processQueue() {
  processing = true;
  while (notifQueue.length > 0) {
    const batch = notifQueue.splice(0, 20);
    try { await Promise.all(batch.map(n => dispatch(n))); } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  processing = false;
}

async function dispatch(notif) {
  const db = await getDb();
  const { userId, title, message, type, refType, refId, district, eventData, sound, priority } = notif;

  const user = await db.prepare('SELECT id, name, email, role, district, phone FROM users WHERE id = ? AND active = 1').get(userId);
  if (!user) return;

  const result = await db.prepare(
    `INSERT INTO notification_log (recipient_type, recipient_id, channel, subject, message, status, reference_type, reference_id, district, sent_at)
     VALUES (?, ?, 'in_app', ?, ?, 'sent', ?, ?, ?, NOW()) RETURNING id`
  ).run(user.role, userId, title, message, refType || null, refId || null, district || null);
  const notifId = result.lastInsertRowid;

  const record = {
    id: notifId,
    recipient_type: user.role,
    recipient_id: userId,
    channel: 'in_app',
    subject: title,
    message,
    status: 'sent',
    reference_type: refType,
    reference_id: refId,
    district: district || user.district,
    sent_at: new Date().toISOString(),
    type: type || 'event',
    sound: sound || 'chime',
    priority: priority || 'normal',
    event_data: eventData || null,
  };

  if (io) {
    io.to(`user_${userId}`).emit('notification:new', record);
    io.to(`district_${district || user.district}`).emit('notification:district', record);
    io.to(`role_${user.role}`).emit('notification:role', record);

    const countResult = await db.prepare(
      `SELECT COUNT(*) as c FROM notification_log WHERE recipient_id = ? AND read_at IS NULL`
    ).get(userId);
    io.to(`user_${userId}`).emit('notification:count', { count: countResult.c });
  }

  return record;
}

async function notifyEventCreated(event, creatorId) {
  const db = await getDb();
  const registrations = await db.prepare(
    `SELECT er.user_id, u.name, u.role, u.district FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND u.active = 1`
  ).all(event.id);

  const eventType = event.event_type || 'physical';
  const dateStr = event.event_date + (event.event_time ? ` at ${event.event_time}` : '');

  for (const reg of registrations) {
    await enqueue({
      userId: reg.user_id,
      title: '📢 New Community Event Posted',
      message: `${event.title} — ${dateStr}${event.location ? ` at ${event.location}` : ''}. Organized by ${event.organizer_name || 'Community'}.`,
      type: 'event_posted',
      refType: 'volunteer_event',
      refId: event.id,
      district: event.district,
      sound: 'new_event',
      priority: 'high',
      eventData: {
        title: event.title,
        description: event.description,
        date: event.event_date,
        time: event.event_time,
        location: event.location,
        district: event.district,
        event_type: eventType,
        organizer: event.organizer_name || 'Community',
        meeting_link: event.meeting_link || null,
        venue: event.venue || null,
        type: eventType,
      },
    });
  }
}

async function notifyEventStarting(event) {
  const db = await getDb();
  const registrations = await db.prepare(
    `SELECT er.user_id, u.name, u.role, u.district FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND u.active = 1`
  ).all(event.id);

  const isOnline = ['online', 'hybrid'].includes(event.event_type);
  const dateStr = event.event_date + (event.event_time ? ` at ${event.event_time}` : '');

  for (const reg of registrations) {
    await enqueue({
      userId: reg.user_id,
      title: '🔔 Your Event is Starting Now',
      message: `"${event.title}" is starting ${dateStr}${event.location ? ` at ${event.location}` : ''}${isOnline && event.meeting_link ? `. Join: ${event.meeting_link}` : ''}`,
      type: 'event_start',
      refType: 'volunteer_event',
      refId: event.id,
      district: event.district,
      sound: 'event_start',
      priority: 'urgent',
      eventData: {
        title: event.title,
        date: event.event_date,
        time: event.event_time,
        location: event.location,
        district: event.district,
        event_type: event.event_type,
        meeting_link: event.meeting_link || null,
        venue: event.venue || null,
        isOnline,
      },
    });
  }
}

async function sendEventReminder(event, minutesBefore) {
  const db = await getDb();
  const registrations = await db.prepare(
    `SELECT er.user_id, u.name, u.role, u.district FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = ? AND u.active = 1`
  ).all(event.id);

  const label = minutesBefore >= 1440 ? 'tomorrow' : minutesBefore >= 60 ? `${minutesBefore / 60} hours` : `${minutesBefore} minutes`;

  for (const reg of registrations) {
    const existing = await db.prepare(
      `SELECT 1 FROM notification_log WHERE recipient_id = ? AND reference_id = ? AND subject LIKE ? AND sent_at > NOW() - INTERVAL '${Math.max(minutesBefore - 5, 1)} minutes' LIMIT 1`
    ).get(reg.user_id, event.id, `%Reminder%${event.title}%`);
    if (existing) continue;

    await enqueue({
      userId: reg.user_id,
      title: `⏰ Reminder: ${event.title}`,
      message: `"${event.title}" starts in ${label}${event.location ? ` at ${event.location}` : ''}. ${event.meeting_link ? `Join: ${event.meeting_link}` : ''}`,
      type: 'event_reminder',
      refType: 'volunteer_event',
      refId: event.id,
      district: event.district,
      sound: 'reminder',
      priority: 'normal',
      eventData: {
        title: event.title,
        date: event.event_date,
        time: event.event_time,
        location: event.location,
        minutesBefore,
        meeting_link: event.meeting_link || null,
      },
    });
  }
}

async function getUnreadCount(userId) {
  const db = await getDb();
  const row = await db.prepare(
    `SELECT COUNT(*) as c FROM notification_log WHERE recipient_id = ? AND read_at IS NULL`
  ).get(userId);
  return row ? row.c : 0;
}

async function checkAndFireEventAlarms() {
  const db = await getDb();
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const currentTime = now.toTimeString().slice(0, 5);

  const eventsStarting = await db.prepare(
    `SELECT id, title, event_date, event_time, location, district, event_type, meeting_link, venue
     FROM volunteer_events
     WHERE status = 'active'
       AND event_date = ?
       AND event_time = ?
       AND id NOT IN (
         SELECT reference_id FROM notification_log
         WHERE reference_type = 'volunteer_event'
           AND type = 'event_start'
           AND sent_at > NOW() - INTERVAL '2 minutes'
       )`
  ).all(currentDate, currentTime);

  for (const event of eventsStarting) {
    await notifyEventStarting(event);
  }
}

async function checkAndFireReminders() {
  const db = await getDb();
  const events = await db.prepare(
    `SELECT id, title, event_date, event_time, location, district, event_type, meeting_link, venue, reminder_minutes
     FROM volunteer_events
     WHERE status = 'active' AND reminder_minutes IS NOT NULL AND reminder_minutes > 0`
  ).all();

  for (const event of events) {
    if (!event.event_date || !event.event_time) continue;
    const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);
    const diffMs = eventDateTime.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);

    if (diffMin > 0 && diffMin <= event.reminder_minutes && diffMin > event.reminder_minutes - 2) {
      await sendEventReminder(event, event.reminder_minutes);
    }
  }
}

function setupNotificationCrons() {
  const cron = require('node-cron');
  cron.schedule('*/30 * * * * *', async () => {
    try { await checkAndFireEventAlarms(); } catch {}
    try { await checkAndFireReminders(); } catch {}
  });

  const { notifyRoles } = require('./notify');
  cron.schedule('0 */6 * * *', async () => {
    try {
      const db = await getDb();
      const upcomingEvents = await db.prepare(
        `SELECT id, title, event_date, event_time, location, district
         FROM volunteer_events WHERE status = 'active' AND event_date >= CURRENT_DATE AND event_date <= CURRENT_DATE + 7`
      ).all();

      for (const ev of upcomingEvents) {
        const dateLabel = ev.event_date + (ev.event_time ? ` at ${ev.event_time}` : '');
        await notifyRoles(
          ['citizen', 'community_committee', 'ngo_officer', 'district_officer'],
          ev.district,
          `📅 Upcoming: ${ev.title}`,
          `"${ev.title}" is coming up on ${dateLabel}${ev.location ? ` at ${ev.location}` : ''}${ev.district ? ` in ${ev.district} District` : ''}. Register now to participate!`,
          'volunteer_event', ev.id
        );
      }
    } catch {}
  });
}

module.exports = {
  setIO,
  enqueue,
  dispatch,
  notifyEventCreated,
  notifyEventStarting,
  sendEventReminder,
  getUnreadCount,
  checkAndFireEventAlarms,
  checkAndFireReminders,
  setupNotificationCrons,
};
