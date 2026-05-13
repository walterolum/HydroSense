export type UserRole = 'national_admin' | 'district_officer' | 'community_committee' | 'citizen' | 'ngo_officer' | 'technician' | 'health_officer' | 'climate_scientist';

export interface AIConversation {
  id: number;
  title: string;
  user_id: number;
  user_name?: string;
  role: string;
  district?: string;
  category: string;
  incident_id?: number;
  location_id?: number;
  is_multi_user: number;
  participants?: string;
  summary?: string;
  status: string;
  message_count?: number;
  last_message?: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: string;
  file_url?: string;
  file_type?: string;
  file_name?: string;
  file_size?: number;
  metadata?: string;
  tokens_used?: number;
  created_at: string;
}

export interface AIConversationDetail extends AIConversation {
  messages: AIMessage[];
}

export interface AIDecisionLog {
  id: number;
  decision_type: string;
  input_data?: string;
  output_data?: string;
  confidence_score: number;
  user_id?: number;
  user_name?: string;
  role?: string;
  district?: string;
  created_at: string;
}

export interface AIConversationStats {
  total: number;
  byCategory: { category: string; c: number }[];
  activeChats: number;
  totalMessages: number;
  decisions: number;
}

export interface AIRiskIndex {
  overall_risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  components: {
    water_quality_risk: number;
    infrastructure_risk: number;
    climate_risk: number;
    health_risk: number;
    community_risk: number;
  };
  district: string;
  generated_at: string;
}

export interface AIWaterSecurity {
  water_security_score: number;
  functionality_rate: number;
  avg_infrastructure_score: number;
  total_water_points: number;
  functional_count: number;
  total_beneficiaries: number;
  level: string;
  district: string;
}

export interface AILiveRiskSummary {
  critical_alerts: number;
  high_risk_water_points: number;
  contamination_events_30d: number;
  drought_affected_districts: number;
  active_outbreaks: number;
  pending_citizen_reports: number;
  overall_alert_level: 'normal' | 'elevated' | 'high' | 'critical';
  generated_at: string;
}

export interface AIDistrictRiskSummary {
  district: string;
  overall_risk: number;
  risk_level: string;
  water_security_score: number;
  security_level: string;
  components: {
    water_quality_risk: number;
    infrastructure_risk: number;
    climate_risk: number;
    health_risk: number;
    community_risk: number;
  };
}

export interface AIRiskHeatmapItem {
  district: string;
  water_point_id?: number;
  name?: string;
  lat?: number;
  lng?: number;
  status?: string;
  infrastructure_score?: number;
  water_points?: number;
  non_functional?: number;
  avg_infra_score?: number;
  alert_count: number;
  recent_reports: number;
  risk_score: number;
  risk_level: string;
}

export interface AIResponseStrategy {
  incident_type: string;
  severity: string;
  district: string;
  response_timeline: string;
  recommended_actions: string[];
  responsible_departments: string[];
  required_resources: string[];
  affected_population: number;
  generated_at: string;
}

export interface AIAssignment {
  assigned_to: { id: number; name: string; role: string; district: string } | null;
  priority: string;
  due_by: string;
  task_type: string;
  department: string;
  district: string;
  escalation_level: string;
}

export interface AIEscalation {
  should_escalate: boolean;
  escalation_level: string;
  reasons: string[];
  notify_roles: string[];
  recommended_action: string;
}

export interface AIOperationalInsights {
  total_water_points: number;
  non_functional_count: number;
  functionality_rate: number;
  active_alerts: number;
  pending_maintenance: number;
  reports_last_7_days: number;
  health_incidents_30_days: number;
  generated_at: string;
}

export interface AIPrioritizedIncident {
  id: number;
  reporter_name: string;
  incident_type: string;
  description: string;
  district: string;
  severity: string;
  status: string;
  ai_risk_score: number;
  ai_severity: string;
  ai_category: string;
  confidence_score: number;
  is_duplicate: number;
  response_recommendation: string;
  created_at: string;
}

export interface AIMultiModalAnalysis {
  description?: string;
  issues?: string[];
  severity?: string;
  recommendation?: string;
  tags?: string[];
  summary?: string;
  key_findings?: string[];
  risks_identified?: string[];
  recommended_actions?: string[];
  error?: string;
  [key: string]: any;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  district?: string;
  sub_county?: string;
  organization?: string;
  phone?: string;
  avatar?: string;      // base64 data-URL or null
  active?: number;
  last_login?: string;
  created_at?: string;
}

export interface WaterPoint {
  id: number;
  name: string;
  type: string;
  status: 'functional' | 'non_functional' | 'needs_repair' | 'under_maintenance';
  lat: number;
  lng: number;
  district: string;
  sub_county?: string;
  village?: string;
  yield_lph?: number;
  depth_m?: number;
  pump_type?: string;
  solar_powered: number;
  beneficiaries: number;
  households: number;
  infrastructure_score: number;
  last_maintained?: string;
  next_maintenance?: string;
  installed_date?: string;
  notes?: string;
}

export interface Sensor {
  id: number;
  water_point_id: number;
  water_point_name?: string;
  district?: string;
  sensor_type: string;
  sensor_name: string;
  serial_number?: string;
  status: string;
  unit: string;
  last_reading?: number;
  last_seen?: string;
  battery_level: number;
  signal_strength: number;
  min_threshold?: number;
  max_threshold?: number;
}

export interface Alert {
  id: number;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  water_point_id?: number;
  water_point_name?: string;
  district?: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  resolved_at?: string;
}

export interface MaintenanceRequest {
  id: number;
  water_point_id: number;
  water_point_name?: string;
  district?: string;
  reporter_name?: string;
  technician_name?: string;
  status: string;
  priority: string;
  issue_type: string;
  description?: string;
  estimated_cost?: number;
  actual_cost?: number;
  created_at: string;
  completed_at?: string;
}

export interface WaterQualityTest {
  id: number;
  water_point_id: number;
  water_point_name?: string;
  district?: string;
  tester_name?: string;
  turbidity_ntu?: number;
  ph?: number;
  tds_ppm?: number;
  e_coli_cfu?: number;
  overall_safe: number;
  water_safety_score: number;
  tested_at: string;
  notes?: string;
}

export interface HealthIncident {
  id: number;
  district: string;
  sub_county?: string;
  village?: string;
  disease_type: string;
  cases: number;
  deaths: number;
  hospitalizations: number;
  water_source_linked: number;
  water_point_name?: string;
  lat?: number;
  lng?: number;
  outbreak_status: string;
  investigation_notes?: string;
  reported_date: string;
}

export interface CommunityReport {
  id: number;
  reporter_name?: string;
  reporter_phone?: string;
  water_point_id?: number;
  water_point_name?: string;
  district: string;
  sub_county?: string;
  village?: string;
  issue_type: string;
  description: string;
  severity: string;
  status: string;
  channel: string;
  lat?: number;
  lng?: number;
  created_at: string;
}

export interface ClimateReading {
  id: number;
  district: string;
  rainfall_mm: number;
  temperature_max: number;
  temperature_min: number;
  humidity_pct: number;
  timestamp: string;
}

export interface DroughtIndex {
  id: number;
  district: string;
  spi_value: number;
  severity: string;
  groundwater_recharge: number;
}

export interface ResilienceScore {
  district: string;
  water_access_score: number;
  infrastructure_score: number;
  climate_adaptation_score: number;
  governance_score: number;
  community_capacity_score: number;
  overall_resilience_score: number;
}

export interface BudgetRecord {
  id: number;
  district: string;
  project_name: string;
  project_type?: string;
  allocated_amount: number;
  spent_amount: number;
  fiscal_year?: string;
  funding_source?: string;
  status: string;
}

export interface CitizenReport {
  id: number;
  user_id?: number;
  reporter_name: string;
  reporter_phone?: string;
  reporter_email?: string;
  incident_type: string;
  description: string;
  district: string;
  sub_county?: string;
  village?: string;
  lat?: number;
  lng?: number;
  severity: string;
  status: string;
  channel: string;
  water_impact?: string;
  affected_population?: number;
  is_anonymous?: number;
  current_status?: string;
  latest_note?: string;
  ai_severity?: string;
  ai_risk_score?: number;
  ai_category?: string;
  is_duplicate?: number;
  duplicate_of_id?: number;
  is_false_report?: number;
  confidence_score?: number;
  speech_to_text?: string;
  image_analysis?: string;
  response_recommendation?: string;
  analyzed_at?: string;
  media?: ReportMedia[];
  tracking?: ReportTracking[];
  created_at: string;
  updated_at?: string;
}

export interface ReportMedia {
  id: number;
  report_id: number;
  media_type: string;
  file_path?: string;
  file_data?: string;
  mime_type?: string;
  created_at: string;
}

export interface ReportTracking {
  id: number;
  report_id: number;
  status: string;
  note?: string;
  updated_by?: number;
  updated_by_name?: string;
  created_at: string;
}

export interface IncidentAnalysis {
  id: number;
  report_id: number;
  ai_severity: string;
  ai_category: string;
  ai_urgency: string;
  ai_risk_score: number;
  extracted_location?: string;
  ai_summary?: string;
  is_duplicate: number;
  duplicate_of_id?: number;
  is_false_report: number;
  confidence_score: number;
  speech_to_text?: string;
  image_analysis?: string;
  response_recommendation?: string;
  analyzed_at: string;
  incident_type?: string;
  description?: string;
  district?: string;
  severity?: string;
  report_status?: string;
  reporter_name?: string;
  report_date?: string;
}

export interface TaskAssignment {
  id: number;
  report_id?: number;
  incident_id?: number;
  assigned_to: number;
  assigned_by: number;
  task_type: string;
  priority: string;
  status: string;
  department?: string;
  due_by?: string;
  description?: string;
  location?: string;
  district?: string;
  notes?: string;
  completed_at?: string;
  created_at: string;
  assigned_to_name?: string;
  assigned_by_name?: string;
  incident_type?: string;
  report_description?: string;
  report_district?: string;
  severity?: string;
}

export interface ResponseTicket {
  id: number;
  report_id?: number;
  incident_id?: number;
  ticket_number: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  assigned_team?: string;
  assigned_agency?: string;
  district: string;
  location?: string;
  lat?: number;
  lng?: number;
  response_deadline?: string;
  resolution_notes?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  resolved_at?: string;
}

export interface NotificationLog {
  id: number;
  recipient_type: string;
  recipient_id?: number;
  recipient_contact?: string;
  channel: string;
  subject?: string;
  message: string;
  status: string;
  reference_type?: string;
  reference_id?: number;
  sent_at: string;
  delivered_at?: string;
}

export interface CitizenReportStats {
  total: number;
  by_status: { status: string; c: number }[];
  by_type: { incident_type: string; c: number }[];
  by_channel: { channel: string; c: number }[];
  pending: number;
  resolved: number;
  in_progress?: number;
  escalated?: number;
  status_flow?: { status: string; label: string; count: number }[];
}

export interface EmergencyDashboard {
  summary: {
    active_incidents: number;
    critical_incidents: number;
    citizen_reports: number;
    pending_tasks: number;
    active_tickets: number;
    active_alerts: number;
  };
  live_incidents: any[];
  citizen_reports_list: any[];
  tickets: ResponseTicket[];
  agencies: any[];
  risk_levels: any[];
  by_severity: any[];
  by_type: any[];
}

export interface IncidentAnalysisDashboard {
  total_analyzed: number;
  high_risk: number;
  duplicates: number;
  false_reports: number;
  by_category: { ai_category: string; c: number }[];
  avg_confidence: number;
  pending_analysis: number;
  recent: IncidentAnalysis[];
}
