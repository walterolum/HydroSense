import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('hs_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('hs_token');
      sessionStorage.removeItem('hs_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const login = (email: string, password: string) => api.post('/auth/login', { email, password });
export const getMe = () => api.get('/auth/me');
export const getUsers = () => api.get('/auth/users');
// Password change (own account)
export const changePassword = (current_password: string, new_password: string) =>
  api.put('/auth/profile/password', { current_password, new_password });

export const createUser = (data: object) => api.post('/auth/users', data);
export const updateUser = (id: number, data: object) => api.put(`/auth/users/${id}`, data);
export const resetUserPassword = (id: number, password: string) => api.put(`/auth/users/${id}/password`, { password });
export const deleteUser = (id: number) => api.delete(`/auth/users/${id}`);
export const updateProfile = (data: object) => api.put('/auth/profile', data);

// Water Points
export const getWaterPoints = (params?: object) => api.get('/waterpoints', { params });
export const getWaterPointStats = (params?: object) => api.get('/waterpoints/stats', { params });
export const getWaterPoint = (id: number) => api.get(`/waterpoints/${id}`);
export const createWaterPoint = (data: object) => api.post('/waterpoints', data);
export const updateWaterPoint = (id: number, data: object) => api.put(`/waterpoints/${id}`, data);

// Sensors
export const getSensors = (params?: object) => api.get('/sensors', { params });
export const getSensorStats = () => api.get('/sensors/stats');
export const getSensorReadings = (id: number, hours?: number) => api.get(`/sensors/${id}/readings`, { params: { hours } });

// Climate
export const getClimateReadings = (params?: object) => api.get('/climate/readings', { params });
export const getDroughtIndex = () => api.get('/climate/drought-index');
export const getFloodAlerts = () => api.get('/climate/flood-alerts');
export const getClimateForecast = (district?: string) => api.get('/climate/forecast', { params: { district } });
export const getClimateSummary = () => api.get('/climate/summary');
export const getResilienceScores = () => api.get('/climate/resilience');

// Water Quality
export const getQualityTests = (params?: object) => api.get('/quality/tests', { params });
export const getQualityStats = (params?: object) => api.get('/quality/stats', { params });
export const submitQualityTest = (data: object) => api.post('/quality/tests', data);

// Maintenance
export const getMaintenanceRequests = (params?: object) => api.get('/maintenance', { params });
export const getMaintenanceStats = () => api.get('/maintenance/stats');
export const createMaintenanceRequest = (data: object) => api.post('/maintenance', data);
export const updateMaintenanceRequest = (id: number, data: object) => api.put(`/maintenance/${id}`, data);
export const getMaintenanceFunds = () => api.get('/maintenance/funds');

// Alerts
export const getAlerts = (params?: object) => api.get('/alerts', { params });
export const getAlertStats = () => api.get('/alerts/stats');
export const createAlert = (data: object) => api.post('/alerts', data);
export const resolveAlert = (id: number) => api.put(`/alerts/${id}/resolve`);
export const acknowledgeAlert = (id: number) => api.put(`/alerts/${id}/acknowledge`);

// Community Reports
export const getCommunityReports = (params?: object) => api.get('/reports', { params });
export const getCommunityReportStats = () => api.get('/reports/stats');
export const submitCommunityReport = (data: object) => api.post('/reports', data);
export const updateCommunityReport = (id: number, data: object) => api.put(`/reports/${id}`, data);

// Health
export const getHealthIncidents = (params?: object) => api.get('/health/incidents', { params });
export const getHealthStats = () => api.get('/health/stats');
export const createHealthIncident = (data: object) => api.post('/health/incidents', data);
export const updateHealthIncident = (id: number, data: object) => api.put(`/health/incidents/${id}`, data);

// Analytics
export const getAnalyticsOverview = () => api.get('/analytics/overview');
export const getWaterSecurity = () => api.get('/analytics/water-security');
export const getAnalyticsTrends = (months?: number) => api.get('/analytics/trends', { params: { months } });
export const getPredictions = () => api.get('/analytics/predictions');
export const getClimateRisk = () => api.get('/analytics/climate-risk');

// Citizen module
export const getCitizenDashboard = () => api.get('/citizen/dashboard');
export const getDiscussions = (params?: object) => api.get('/citizen/discussions', { params });
export const createDiscussion = (data: object) => api.post('/citizen/discussions', data);
export const likeDiscussion = (id: number) => api.post(`/citizen/discussions/${id}/like`);
export const getDiscussionReplies = (id: number) => api.get(`/citizen/discussions/${id}/replies`);
export const postDiscussionReply = (id: number, content: string) => api.post(`/citizen/discussions/${id}/replies`, { content });
export const getVolunteerEvents = (params?: object) => api.get('/citizen/events', { params });
export const createVolunteerEvent = (data: object) => api.post('/citizen/events', data);
export const joinEvent = (id: number) => api.post(`/citizen/events/${id}/join`);
export const leaveEvent = (id: number) => api.delete(`/citizen/events/${id}/leave`);
export const getCitizenAchievements = () => api.get('/citizen/achievements');
export const submitObservation = (data: object) => api.post('/citizen/observations', data);

// Governance
export const getAuditLog = (params?: object) => api.get('/governance/audit', { params });
export const getBudget = (params?: object) => api.get('/governance/budget', { params });
export const createBudget = (data: object) => api.post('/governance/budget', data);
export const getTransparency = () => api.get('/governance/transparency');
export const getPerformance = () => api.get('/governance/performance');

// Auth - Citizen Registration & OTP
export const registerCitizen = (data: object) => api.post('/auth/register', data);
export const sendOTP = (email: string) => api.post('/auth/send-otp', { email });
export const verifyOTP = (email: string, otp: string) => api.post('/auth/verify-otp', { email, otp });
export const resendOTP = (email: string) => api.post('/auth/resend-otp', { email });

// Citizen Reports (multi-channel)
export const submitCitizenReport = (data: object) => api.post('/citizen-reports', data);
export const getCitizenReports = (params?: object) => api.get('/citizen-reports', { params });
export const getCitizenReport = (id: number) => api.get(`/citizen-reports/${id}`);
export const getCitizenReportStats = (params?: object) => api.get('/citizen-reports/stats', { params });
export const updateCitizenReportStatus = (id: number, data: object) => api.put(`/citizen-reports/${id}/status`, data);
export const analyzeCitizenReport = (id: number) => api.post(`/citizen-reports/${id}/analyze`);

// Citizen Tracking
export const getMyReports = () => api.get('/citizen-tracking/my-reports');
export const getMyReportStats = () => api.get('/citizen-tracking/my-reports/stats');

// Task Assignment
export const getTaskAssignments = (params?: object) => api.get('/task-assignment', { params });
export const getMyTasks = () => api.get('/task-assignment/my-tasks');
export const autoAssignTask = (data: object) => api.post('/task-assignment/auto-assign', data);
export const createTaskAssignment = (data: object) => api.post('/task-assignment', data);
export const updateTaskStatus = (id: number, data: object) => api.put(`/task-assignment/${id}/status`, data);
export const getTaskStats = () => api.get('/task-assignment/stats');

// Notifications
export const sendNotification = (data: object) => api.post('/notifications/send', data);
export const broadcastNotification = (data: object) => api.post('/notifications/broadcast', data);
export const getNotifications = (params?: object) => api.get('/notifications', { params });
export const getNotificationStats = () => api.get('/notifications/stats');
export const getNotificationUnreadCount = () => api.get('/notifications/unread-count');
export const markNotificationRead = (id: number) => api.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.patch('/notifications/read-all');

// Incident Analysis
export const getIncidentAnalysisDashboard = (params?: object) => api.get('/incident-analysis/dashboard', { params });
export const getIncidentAnalysis = (params?: object) => api.get('/incident-analysis', { params });
export const getPendingAnalysis = () => api.get('/incident-analysis/pending');
export const analyzeAllPending = () => api.post('/incident-analysis/analyze-all-pending');

// Emergency Response
export const getEmergencyDashboard = (params?: object) => api.get('/emergency-response/dashboard', { params });
export const getLiveMapData = () => api.get('/emergency-response/live-map');
export const getResponseTickets = (params?: object) => api.get('/emergency-response/tickets', { params });
export const createResponseTicket = (data: object) => api.post('/emergency-response/tickets', data);
export const updateTicketStatus = (id: number, data: object) => api.put(`/emergency-response/tickets/${id}/status`, data);

// AI Conversations
export const getAIConversations = (params?: object) => api.get('/ai-conversations', { params });
export const createAIConversation = (data: object) => api.post('/ai-conversations', data);
export const getAIConversation = (id: number) => api.get(`/ai-conversations/${id}`);
export const updateAIConversation = (id: number, data: object) => api.put(`/ai-conversations/${id}`, data);
export const deleteAIConversation = (id: number) => api.delete(`/ai-conversations/${id}`);
export const addAIMessage = (id: number, data: object) => api.post(`/ai-conversations/${id}/messages`, data);
export const getAIConversationHistory = (id: number, limit?: number) => api.get(`/ai-conversations/${id}/history`, { params: { limit } });
export const summarizeConversation = (id: number) => api.post(`/ai-conversations/${id}/summarize`);
export const getAIConversationStats = () => api.get('/ai-conversations/stats/overview');
export const getAIDecisionLogs = (limit?: number) => api.get('/ai-conversations/decisions/log', { params: { limit } });

// System
export const getSystemStatus = () => api.get('/system/status');
