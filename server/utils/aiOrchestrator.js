const { getDb } = require('../db');

let io = null;

function setIO(socketIO) {
  io = socketIO;
}

const WELCOME_TEMPLATES = {
  morning: {
    national_admin: [
      'Good morning, {name}. HydroSense systems are fully operational. Your national water infrastructure is active across all districts.',
      'Rise and shine, {name}. The HydroSense network reports all systems nominal. Today brings new opportunities for water security.',
      'Morning, {name}. All districts are online. Your leadership keeps Uganda\'s water infrastructure flowing.',
    ],
    district_officer: [
      'Good morning, {name}. Your district systems are reporting in. Let\'s make today productive for {district}.',
      'Morning, {name}. {district} is online and operational. You have full visibility into your water infrastructure.',
      'Rise and shine, {name}. Today\'s data from {district} is ready for your review.',
    ],
    community_committee: [
      'Good morning, {name}. Your community is counting on you. All monitoring systems are active in {district}.',
      'Morning, {name}. The community dashboard is live. Stay connected with your neighbors and water points.',
      'Rise and shine, {name}. Your voice matters today. Community reports are flowing in from {district}.',
    ],
    citizen: [
      'Good morning, {name}. Welcome to HydroSense. Your community is connected and informed.',
      'Morning, {name}. Stay informed about your local water sources and community events today.',
      'Good morning, {name}. HydroSense is here to keep you connected with your water community.',
    ],
    ngo_officer: [
      'Good morning, {name}. Your project insights are updated. Ready to drive impact in {district} today.',
      'Morning, {name}. NGO monitoring systems are live. Track your supported water points across {district}.',
      'Rise and shine, {name}. Your transparency and impact data are ready for review.',
    ],
    technician: [
      'Good morning, {name}. Your maintenance queue is loaded. {district} needs your technical expertise today.',
      'Morning, {name}. Field operations are online. Check your assigned tasks and sensor alerts for {district}.',
      'Rise and shine, {name}. Your tools are ready. Time to keep {district}\'s water flowing.',
    ],
    health_officer: [
      'Good morning, {name}. Health surveillance systems are active. Water quality data is streaming from {district}.',
      'Morning, {name}. Public health monitoring is live. Disease outbreak data and water quality tests are ready.',
      'Rise and shine, {name}. Your health insights protect communities across {district}.',
    ],
    climate_scientist: [
      'Good morning, {name}. Climate monitoring arrays are online. Real-time weather and drought data await you.',
      'Morning, {name}. Environmental sensors are streaming. Your climate models are ready for analysis.',
      'Rise and shine, {name}. The data is rich today. Predictive insights are flowing in from all stations.',
    ],
  },
  afternoon: {
    national_admin: [
      'Good afternoon, {name}. HydroSense continues to monitor all systems. {stats}',
      'Afternoon, {name}. The network is steady. Your national oversight keeps Uganda resilient.',
      'Good afternoon, {name}. Mid-day check-in: {stats}. All systems remain under control.',
    ],
    district_officer: [
      'Good afternoon, {name}. {district} is tracking well. {stats}',
      'Afternoon, {name}. How\'s {district} looking? All systems are reporting in real-time.',
      'Good afternoon, {name}. Half-day report for {district} is available. {stats}',
    ],
    community_committee: [
      'Good afternoon, {name}. Your community is thriving. Stay engaged with local updates from {district}.',
      'Afternoon, {name}. Keep making a difference. New community activities have been logged.',
      'Good afternoon, {name}. Your dedication inspires. Check out the latest from your neighbors.',
    ],
    citizen: [
      'Good afternoon, {name}. Hope you\'re having a great day. Your community is active and informed.',
      'Afternoon, {name}. Stay connected with what matters — your water, your community.',
      'Good afternoon, {name}. HydroSense is here for you. Check for updates in your area.',
    ],
    ngo_officer: [
      'Good afternoon, {name}. Project metrics are updated. Your transparency dashboard is live.',
      'Afternoon, {name}. Impact tracking systems are online. Review your NGO portfolio performance.',
      'Good afternoon, {name}. Keep driving change. Your project insights are ready.',
    ],
    technician: [
      'Good afternoon, {name}. Field ops are active. {stats}. Your skills keep communities flowing.',
      'Afternoon, {name}. Maintenance updates streaming in. Check your task queue.',
      'Good afternoon, {name}. Your work matters. {stats} sensors and requests await.',
    ],
    health_officer: [
      'Good afternoon, {name}. Health data is current. Water quality surveillance continues across {district}.',
      'Afternoon, {name}. Public health metrics are updated. Disease surveillance is active.',
      'Good afternoon, {name}. Your vigilance saves lives. Health monitoring systems are green.',
    ],
    climate_scientist: [
      'Good afternoon, {name}. Climate models are converging. New environmental data is available for analysis.',
      'Afternoon, {name}. Sensor networks streaming. Your climate insights shape policy decisions.',
      'Good afternoon, {name}. Environmental intelligence is updated. Drought indices and forecasts ready.',
    ],
  },
  evening: {
    national_admin: [
      'Good evening, {name}. Day\'s summary: {stats}. HydroSense systems have performed nominally.',
      'Evening, {name}. A productive day for water security. End-of-day reports are compiled.',
      'Good evening, {name}. Your leadership made a difference today. Daily digest is ready.',
    ],
    district_officer: [
      'Good evening, {name}. Today in {district}: {stats}. Tomorrow brings new opportunities.',
      'Evening, {name}. End-of-day report for {district} is ready. Rest and recharge.',
      'Good evening, {name}. You\'ve made progress today. {district} is in good hands.',
    ],
    community_committee: [
      'Good evening, {name}. Your community engagement today made a difference. Tomorrow starts fresh.',
      'Evening, {name}. Daily community summary is ready. Your voice matters in {district}.',
      'Good evening, {name}. Reflect on today\'s impact and prepare for tomorrow\'s opportunities.',
    ],
    citizen: [
      'Good evening, {name}. Stay safe and informed. Your community will have new updates tomorrow.',
      'Evening, {name}. Thank you for being part of HydroSense. See you tomorrow.',
      'Good evening, {name}. Rest well. Your community network will be active again tomorrow.',
    ],
    ngo_officer: [
      'Good evening, {name}. Daily project summary is compiled. Your impact in {district} is measurable.',
      'Evening, {name}. End-of-day NGO dashboard ready. Review tomorrow\'s priorities.',
      'Good evening, {name}. Transparency reports generated. A productive day for water access.',
    ],
    technician: [
      'Good evening, {name}. Maintenance log for today is complete. Tomorrow\'s schedule is ready.',
      'Evening, {name}. Your work keeps communities hydrated. Rest up for tomorrow\'s challenges.',
      'Good evening, {name}. Field summary compiled. {stats} items were addressed today.',
    ],
    health_officer: [
      'Good evening, {name}. Daily health surveillance summary is ready. Water quality data logged.',
      'Evening, {name}. Your monitoring efforts protect public health. Tomorrow is a new day.',
      'Good evening, {name}. Health metrics finalized for today. Disease surveillance continues.',
    ],
    climate_scientist: [
      'Good evening, {name}. Today\'s environmental data archived. Climate models are updating overnight.',
      'Evening, {name}. Sensor data collected and processed. Tomorrow\'s forecasts are being generated.',
      'Good evening, {name}. Your climate intelligence shapes Uganda\'s resilience. Well done today.',
    ],
  },
};

const MOTIVATIONAL_LINES = [
  'Water is life. Every data point represents a community served.',
  'Your work today ensures clean water for thousands of Ugandans tomorrow.',
  'Resilience is built one water point at a time. You are part of something bigger.',
  'Access to clean water is a human right. HydroSense helps deliver that promise.',
  'Every alert you respond to saves lives. Every data point you analyze shapes policy.',
  'Uganda\'s water future is being written today. You are the author.',
  'Climate resilience starts with data. Your decisions create ripples across generations.',
  'Communities thrive when water flows. You keep the data flowing.',
];

const INSIGHT_HEADLINES = {
  national_admin: [
    'National water security index updated across all districts',
    'Inter-district resource allocation algorithm recalibrated',
    'Cross-regional infrastructure risk assessment completed',
  ],
  district_officer: [
    'District-level water quality trends detected',
    'Community engagement metrics show positive correlation with maintenance response',
    'Local infrastructure vulnerability patterns identified',
  ],
  community_committee: [
    'Community participation rates are trending upward',
    'Local reporting accuracy improving month over month',
    'Neighborhood water stewardship program gaining momentum',
  ],
  citizen: [
    'Your voice matters — reports from your area are being analyzed',
    'Community discussions are active near you',
    'Local water point status updates available',
  ],
  ngo_officer: [
    'NGO project efficiency metrics calculated',
    'Funding allocation optimization suggestions ready',
    'Cross-organization collaboration opportunities identified',
  ],
  technician: [
    'Predictive maintenance windows detected for your area',
    'Sensor calibration schedules optimized',
    'Spare parts inventory levels suggest proactive ordering',
  ],
  health_officer: [
    'Waterborne disease correlation patterns updated',
    'High-risk water quality zones identified for surveillance',
    'Health intervention prioritization algorithm refined',
  ],
  climate_scientist: [
    'Seasonal forecast models refreshed with latest data',
    'Drought prediction accuracy improved 12% this month',
    'Climate vulnerability indices recalculated across regions',
  ],
};

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getSystemAlertLevel(stats) {
  if (!stats) return 'normal';
  if (stats.critAlerts >= 5) return 'critical';
  if (stats.critAlerts > 0 || stats.allAlerts > 10) return 'elevated';
  if (stats.nonFunc > stats.total * 0.3) return 'warning';
  return 'normal';
}

async function generateWelcome(user) {
  const db = await getDb();
  const timeOfDay = getTimeOfDay();
  const role = user.role || 'citizen';
  const name = user.name || 'User';
  const district = user.district || 'Uganda';

  const stats = await fetchBaseStats(district);

  const templates = WELCOME_TEMPLATES[timeOfDay]?.[role] || WELCOME_TEMPLATES[timeOfDay]?.citizen || ['Welcome back, {name}. HydroSense is ready for you.'];
  let welcome = pickRandom(templates);
  welcome = welcome.replace(/{name}/g, name).replace(/{district}/g, district);

  const statSummary = stats ? `${stats.func} of ${stats.total} water points functional — ${stats.allAlerts} active alerts` : '';
  welcome = welcome.replace(/{stats}/g, statSummary);

  const motivational = pickRandom(MOTIVATIONAL_LINES);
  const systemStatus = getSystemAlertLevel(stats);

  const insights = INSIGHT_HEADLINES[role] || INSIGHT_HEADLINES.citizen;
  const aiInsight = pickRandom(insights);

  const userNotifs = await db.prepare(
    `SELECT COUNT(*) as c FROM notification_log WHERE recipient_id = ? AND read_at IS NULL`
  ).get(user.id);
  const unread = userNotifs?.c || 0;

  const greeting = {
    greeting: welcome,
    motivational,
    aiInsight,
    timeOfDay,
    systemStatus,
    role,
    district,
    unreadCount: unread,
    generatedAt: new Date().toISOString(),
  };

  return greeting;
}

async function fetchBaseStats(district) {
  const db = await getDb();
  try {
    const totalWp = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM water_points WHERE district = ?` : `SELECT COUNT(*) as c FROM water_points`
    ).get(...(district ? [district] : []));
    const funcWp = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM water_points WHERE status='functional' AND district = ?` : `SELECT COUNT(*) as c FROM water_points WHERE status='functional'`
    ).get(...(district ? [district] : []));
    const nonFuncWp = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM water_points WHERE status!='functional' AND district = ?` : `SELECT COUNT(*) as c FROM water_points WHERE status!='functional'`
    ).get(...(district ? [district] : []));
    const critAlerts = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM alerts WHERE severity='critical' AND status='active' AND district = ?` : `SELECT COUNT(*) as c FROM alerts WHERE severity='critical' AND status='active'`
    ).get(...(district ? [district] : []));
    const allAlerts = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM alerts WHERE status='active' AND district = ?` : `SELECT COUNT(*) as c FROM alerts WHERE status='active'`
    ).get(...(district ? [district] : []));
    const pendMaint = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM maintenance_requests WHERE status='pending' AND district = ?` : `SELECT COUNT(*) as c FROM maintenance_requests WHERE status='pending'`
    ).get(...(district ? [district] : []));
    const unsafeQ = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0 AND district = ?` : `SELECT COUNT(*) as c FROM water_quality_tests WHERE overall_safe=0`
    ).get(...(district ? [district] : []));
    const pendRep = await db.prepare(
      district ? `SELECT COUNT(*) as c FROM citizen_reports WHERE status='pending' AND district = ?` : `SELECT COUNT(*) as c FROM citizen_reports WHERE status='pending'`
    ).get(...(district ? [district] : []));

    return {
      total: totalWp?.c || 0, func: funcWp?.c || 0, nonFunc: nonFuncWp?.c || 0,
      critAlerts: critAlerts?.c || 0, allAlerts: allAlerts?.c || 0,
      pendMaint: pendMaint?.c || 0, unsafeQ: unsafeQ?.c || 0, pendRep: pendRep?.c || 0,
    };
  } catch {
    return null;
  }
}

async function getDashboardData(user) {
  const db = await getDb();
  const s = await fetchBaseStats(user.district);

  const weather = await db.prepare(
    `SELECT * FROM climate_readings WHERE district = ? ORDER BY timestamp DESC LIMIT 1`
  ).get(user.district || 'Kampala');

  const upcomingEvents = await db.prepare(
    `SELECT id, title, event_date, event_time, location, district, event_type, meeting_link
     FROM volunteer_events WHERE status = 'active' AND event_date >= CURRENT_DATE
     ORDER BY event_date ASC, event_time ASC LIMIT 5`
  ).all();

  const recentNotifs = await db.prepare(
    `SELECT id, subject, message, type, sent_at, sound, priority
     FROM notification_log WHERE recipient_id = ? ORDER BY sent_at DESC LIMIT 10`
  ).all(user.id);

  const healthIncidents = await db.prepare(
    `SELECT disease_type, SUM(cases) as total_cases, outbreak_status
     FROM health_incidents GROUP BY disease_type, outbreak_status
     ORDER BY total_cases DESC LIMIT 5`
  ).all();

  const sensorSummary = await db.prepare(
    `SELECT status, COUNT(*) as c FROM sensors GROUP BY status`
  ).all();

  const systemHealth = {
    waterPoints: s?.total || 0,
    functionalRate: s?.total ? Math.round((s.func / s.total) * 100) : 0,
    activeAlerts: s?.allAlerts || 0,
    criticalAlerts: s?.critAlerts || 0,
    pendingMaintenance: s?.pendMaint || 0,
    unsafeQualityTests: s?.unsafeQ || 0,
    pendingCitizenReports: s?.pendRep || 0,
    sensorsOnline: sensorSummary.find(x => x.status === 'online')?.c || 0,
    sensorsOffline: sensorSummary.find(x => x.status === 'offline')?.c || 0,
  };

  const funcRate = systemHealth.functionalRate;
  const healthScore = Math.round(
    (funcRate * 0.35) +
    (Math.max(0, 100 - systemHealth.activeAlerts * 3) * 0.25) +
    (systemHealth.sensorsOnline > 0 ? 90 : 40) * 0.20 +
    (systemHealth.pendingMaintenance === 0 ? 100 : Math.max(0, 100 - systemHealth.pendingMaintenance * 5)) * 0.20
  );

  return {
    systemHealth,
    weather: weather ? {
      temperature: weather.temperature_max,
      humidity: weather.humidity_pct,
      rainfall: weather.rainfall_mm,
      district: weather.district,
    } : null,
    upcomingEvents: upcomingEvents || [],
    recentNotifications: (recentNotifs || []).map(n => ({
      id: n.id, title: n.subject, message: n.message,
      type: n.type, time: n.sent_at, sound: n.sound, priority: n.priority,
    })),
    healthIncidents: healthIncidents || [],
    healthScore,
    sensorStatus: sensorSummary || [],
    timestamp: new Date().toISOString(),
  };
}

async function getRecommendations(user) {
  const db = await getDb();
  const s = await fetchBaseStats(user.district);

  const recommendations = [];
  const role = user.role || 'citizen';

  if (s) {
    if (s.nonFunc > 0) {
      recommendations.push({
        type: 'infrastructure',
        title: 'Non-functional Water Points Detected',
        description: `${s.nonFunc} water point${s.nonFunc > 1 ? 's are' : ' is'} non-functional in your area. Prioritize maintenance scheduling to restore service.`,
        priority: s.nonFunc > 5 ? 'high' : 'medium',
        action: 'View Water Points',
        link: '/water-infrastructure',
      });
    }

    if (s.critAlerts > 0) {
      recommendations.push({
        type: 'alert',
        title: 'Critical Alerts Require Attention',
        description: `${s.critAlerts} critical alert${s.critAlerts > 1 ? 's' : ''} active in your district. Immediate review recommended.`,
        priority: 'high',
        action: 'Open Emergency Center',
        link: '/emergency',
      });
    }

    if (s.unsafeQ > 0) {
      recommendations.push({
        type: 'quality',
        title: 'Water Quality Concerns',
        description: `${s.unsafeQ} water quality test${s.unsafeQ > 1 ? 's' : ''} flagged as unsafe. Health surveillance may be needed.`,
        priority: s.unsafeQ > 5 ? 'high' : 'medium',
        action: 'View Water Quality',
        link: '/water-quality',
      });
    }

    if (s.pendMaint > 0) {
      recommendations.push({
        type: 'maintenance',
        title: 'Pending Maintenance Requests',
        description: `${s.pendMaint} maintenance request${s.pendMaint > 1 ? 's' : ''} awaiting action. Assign technicians to prevent infrastructure degradation.`,
        priority: s.pendMaint > 10 ? 'high' : 'medium',
        action: 'Manage Maintenance',
        link: '/maintenance',
      });
    }

    if (s.pendRep > 0 && ['national_admin', 'district_officer', 'health_officer', 'ngo_officer'].includes(role)) {
      recommendations.push({
        type: 'citizen',
        title: 'Citizen Reports Pending Review',
        description: `${s.pendRep} citizen report${s.pendRep > 1 ? 's' : ''} from your community require analysis and response.`,
        priority: s.pendRep > 10 ? 'high' : 'medium',
        action: 'Review Reports',
        link: '/incident-analysis',
      });
    }
  }

  const healthIncidents = await db.prepare(
    `SELECT COUNT(*) as c, SUM(cases) as total_cases FROM health_incidents WHERE outbreak_status = 'active'`
  ).get();
  if (healthIncidents?.c > 0 && ['national_admin', 'district_officer', 'health_officer'].includes(role)) {
    recommendations.push({
      type: 'health',
      title: 'Active Disease Outbreaks',
      description: `${healthIncidents.c} active outbreak${healthIncidents.c > 1 ? 's' : ''} with ${healthIncidents.total_cases} total cases. Health surveillance teams should investigate water-linked transmission.`,
      priority: 'high',
      action: 'Health Dashboard',
      link: '/health',
    });
  }

  const riskScore = s ? Math.round(
    (s.nonFunc / Math.max(s.total, 1)) * 30 +
    Math.min(s.critAlerts * 8, 30) +
    Math.min(s.pendRep * 4, 20) +
    Math.min(s.pendMaint * 3, 20)
  ) : 0;

  return {
    recommendations,
    overallRiskScore: riskScore,
    riskLevel: riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'elevated' : 'stable',
    generatedAt: new Date().toISOString(),
  };
}

async function trackBehavior(userId, action, metadata = {}) {
  const db = await getDb();
  try {
    await db.prepare(
      `INSERT INTO user_behavior_log (user_id, action, metadata, created_at)
       VALUES (?, ?, ?, NOW())`
    ).run(userId, action, JSON.stringify(metadata));
  } catch {}
}

async function getBehaviorInsights(userId) {
  const db = await getDb();
  try {
    const recent = await db.prepare(
      `SELECT action, COUNT(*) as c FROM user_behavior_log
       WHERE user_id = ? AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY action ORDER BY c DESC LIMIT 10`
    ).all(userId);

    const topSections = await db.prepare(
      `SELECT action, COUNT(*) as c FROM user_behavior_log
       WHERE user_id = ? AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY action ORDER BY c DESC LIMIT 5`
    ).all(userId);

    return { recentActions: recent || [], topSections: topSections || [] };
  } catch {
    return { recentActions: [], topSections: [] };
  }
}

module.exports = {
  setIO,
  generateWelcome,
  fetchBaseStats,
  getDashboardData,
  getRecommendations,
  trackBehavior,
  getBehaviorInsights,
  getSystemAlertLevel,
};
