const { getDb } = require('../db');

function ensureNotifyColumns() {
  const db = getDb();
  try { db.exec(`ALTER TABLE notification_log ADD COLUMN read_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE notification_log ADD COLUMN district TEXT`); } catch {}
}

// Which recipient_types each role can see
const ROLE_RECEIVES = {
  national_admin:      ['national_admin', 'district_officer', 'technician', 'health_officer', 'climate_scientist', 'ngo_officer', 'all'],
  district_officer:    ['district_officer', 'all'],
  technician:          ['technician', 'all'],
  health_officer:      ['health_officer', 'all'],
  climate_scientist:   ['climate_scientist', 'all'],
  ngo_officer:         ['ngo_officer', 'all'],
  community_committee: ['community_committee', 'all'],
  citizen:             ['citizen', 'all'],
};

// Incident type → roles to notify
const INCIDENT_ROLES = {
  water_contamination:   ['health_officer', 'district_officer'],
  sewage_leak:           ['health_officer', 'district_officer'],
  pollution:             ['health_officer', 'climate_scientist', 'district_officer'],
  water_quality_issue:   ['health_officer', 'district_officer'],
  broken_water_point:    ['technician', 'district_officer'],
  infrastructure_damage: ['technician', 'district_officer'],
  pump_failure:          ['technician', 'district_officer'],
  flooding:              ['climate_scientist', 'district_officer'],
  environmental_hazard:  ['climate_scientist', 'district_officer'],
  illegal_dumping:       ['district_officer', 'ngo_officer'],
  disease_outbreak:      ['health_officer', 'district_officer', 'national_admin'],
};

function notifyRoles(roles, district, subject, message, refType, refId) {
  try {
    ensureNotifyColumns();
    const db = getDb();
    const ins = db.prepare(
      `INSERT INTO notification_log (recipient_type, channel, subject, message, status, reference_type, reference_id, district)
       VALUES (?, 'in_app', ?, ?, 'sent', ?, ?, ?)`
    );
    const uniqueRoles = [...new Set(roles)];
    for (const role of uniqueRoles) {
      ins.run(role, subject, message, refType || null, refId || null, district || null);
    }
  } catch (e) {
    console.error('[notify] notifyRoles error:', e.message);
  }
}

function notifyForIncident(incidentType, severity, district, reportId, reporterName) {
  const roles = INCIDENT_ROLES[incidentType] || ['district_officer'];
  if (['critical', 'high'].includes(severity) && !roles.includes('national_admin')) {
    roles.push('national_admin');
  }
  const typeLabel = (incidentType || 'incident').replace(/_/g, ' ');
  notifyRoles(
    roles,
    district,
    `New ${severity} report: ${typeLabel}`,
    `${reporterName || 'A citizen'} reported a ${typeLabel} in ${district}. Immediate review required.`,
    'citizen_report',
    reportId
  );
}

function notifyForAlert(severity, alertTitle, district, alertId) {
  let roles;
  if (severity === 'critical') roles = ['national_admin', 'district_officer', 'health_officer', 'technician'];
  else if (severity === 'high')   roles = ['district_officer', 'technician', 'health_officer'];
  else                            roles = ['district_officer'];
  notifyRoles(roles, district, `${severity.toUpperCase()} Alert: ${alertTitle}`, `A ${severity} alert has been raised in ${district}: ${alertTitle}`, 'alert', alertId);
}

function notifyForMaintenance(district, waterPointName, requestId) {
  notifyRoles(['technician', 'district_officer'], district,
    `Maintenance request: ${waterPointName}`,
    `A new maintenance request has been submitted for ${waterPointName} in ${district}.`,
    'maintenance_request', requestId);
}

function notifyForHealthIncident(disease, district, cases, incidentId) {
  notifyRoles(['health_officer', 'district_officer', 'national_admin'], district,
    `Health Alert: ${disease} outbreak`,
    `A ${disease} outbreak with ${cases} case(s) has been reported in ${district}. Immediate health response required.`,
    'health_incident', incidentId);
}

module.exports = { notifyRoles, notifyForIncident, notifyForAlert, notifyForMaintenance, notifyForHealthIncident, ROLE_RECEIVES, ensureNotifyColumns };
