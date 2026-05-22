import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AIServiceProvider } from './contexts/AIServiceContext';
import { LanguageProvider } from './contexts/LanguageContext';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import CitizenRegistration from './pages/CitizenRegistration';
import ForgotPassword from './pages/ForgotPassword';
import OTPVerification from './pages/OTPVerification';
import Dashboard from './pages/Dashboard';
import WaterInfrastructure from './pages/WaterInfrastructure';
import WaterPointDetail from './pages/WaterInfrastructure/Detail';
import SensorsPage from './pages/Sensors';
import ClimateMonitor from './pages/Climate';
import WaterQuality from './pages/WaterQuality';
import MaintenancePage from './pages/Maintenance';
import CommunityReports from './pages/Community';
import HealthSurveillance from './pages/Health';
import EmergencyCenter from './pages/Emergency';
import GISMap from './pages/GIS';
import Analytics from './pages/Analytics';
import Governance from './pages/Governance';
import AIHub from './pages/AIHub';
import UserManagement from './pages/Users';
import TechnicianPortal from './pages/TechnicianPortal';
import GWN from './pages/GWN';
import IncidentCommand from './pages/IncidentCommand';
import CitizenHub from './pages/CitizenHub';
import CitizenReport from './pages/CitizenReport';
import MultilingualReport from './pages/MultilingualReport';
import CitizenTracking from './pages/CitizenTracking';
import IncidentAnalysis from './pages/IncidentAnalysis';
import TaskAssignment from './pages/TaskAssignment';
import VerifyProfile from './pages/VerifyProfile';

/* ─────────────────────────────────────────────────────────────
   RBAC — Advanced Role-Based Access Control
   Roles map to real-world positions:
     national_admin      → System Administrator / National Water Authority
     district_officer    → District Water Officer / Government Official / Operations Manager
     technician          → Field Technician / IoT Engineer / Infrastructure Engineer
     health_officer      → Water Quality Analyst / Environmental Monitoring Officer
     climate_scientist   → Environmental Intelligence / Data Scientist / Researcher
     ngo_officer         → NGO / Environmental Activist
     community_committee → Community Leader
     citizen             → General public / Citizen
───────────────────────────────────────────────────────────── */
const ROUTE_ROLES: Record<string, string[]> = {
  // All authenticated users
  '/dashboard':           ['national_admin','district_officer','technician','health_officer','climate_scientist','ngo_officer','community_committee','citizen'],

  // Water Infrastructure — read: all; write guarded at component + API level
  '/water-infrastructure':['national_admin','district_officer','technician','health_officer','climate_scientist','ngo_officer','community_committee','citizen'],

  // IoT Sensors — Admins, IoT Engineers (technician), Water Quality Analysts (health_officer),
  //               Environmental Monitoring Officers (climate_scientist), District Officers
  '/sensors':             ['national_admin','district_officer','technician','health_officer','climate_scientist'],

  '/climate':             ['national_admin','district_officer','health_officer','climate_scientist'],
  '/water-quality':       ['national_admin','district_officer','health_officer','ngo_officer','climate_scientist'],

  // Maintenance — Field Technicians, Operations Managers
  '/maintenance':         ['national_admin','district_officer','technician'],

  '/community':           ['national_admin','district_officer','community_committee','ngo_officer','citizen'],
  '/health':              ['national_admin','district_officer','health_officer','ngo_officer'],

  // Emergency Response — Emergency/Disaster teams, Environmental Protection, Government Officials
  '/emergency':           ['national_admin','district_officer','health_officer'],

  '/gis':                 ['national_admin','district_officer','climate_scientist','ngo_officer','health_officer'],
  '/analytics':           ['national_admin','district_officer','climate_scientist','health_officer'],
  '/governance':          ['national_admin','district_officer'],

  // AI Hub — AI Analysts, Data Scientists, Environmental Intelligence, Research Institutions, Admins
  '/ai-hub':              ['national_admin','district_officer','technician','health_officer','climate_scientist'],

  '/users':               ['national_admin'],

  // My Tasks — ALL authenticated users
  '/technician-portal':   ['national_admin','district_officer','technician','health_officer','climate_scientist','ngo_officer','community_committee','citizen'],

  // GWN — Citizens, Community Leaders, NGOs, Researchers, Environmental Officers + admin oversight
  '/gwn':                 ['citizen','community_committee','ngo_officer','climate_scientist','health_officer','national_admin','district_officer'],

  // Citizen Hub — all authenticated users
  '/citizen-hub':         ['citizen','community_committee','ngo_officer','national_admin','district_officer','technician','health_officer','climate_scientist'],

  '/citizen-report':      ['citizen','community_committee','ngo_officer','national_admin','district_officer'],
  '/multilingual-report': ['citizen','community_committee','ngo_officer','national_admin','district_officer'],
  '/report-status':       ['citizen','community_committee','ngo_officer','district_officer','health_officer','national_admin'],
  '/track-reports':       ['citizen','community_committee','ngo_officer','national_admin','district_officer'],
  '/incident-analysis':   ['national_admin','district_officer','health_officer','climate_scientist'],
  '/task-assignment':     ['national_admin','district_officer','technician','health_officer'],

  '/incident-command':    ['national_admin','district_officer'],
};

/* ─────────────────────────────────────────────────────────────
   Guards
───────────────────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">💧</div>
        <div className="text-blue-700 font-bold text-lg tracking-tight">HYDROSENSE</div>
        <div className="text-gray-400 text-sm mt-1">Loading system...</div>
        <div className="mt-4 flex justify-center">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, path }: { children: React.ReactNode; path: string }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = ROUTE_ROLES[path] ?? [];
  if (!allowed.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}

/* ─────────────────────────────────────────────────────────────
   Unauthorized page
───────────────────────────────────────────────────────────── */
function UnauthorizedPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)' }}>
      <div className="text-center max-w-md">
        <div className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center text-4xl shadow-xl"
          style={{ background: 'linear-gradient(135deg, #fee2e2, #fef2f2)', border: '2px solid #fecaca' }}>
          🔒
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Access Restricted</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-4">
          Your account role does not have permission to access this page.
        </p>
        {user && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 mb-6"
            style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Signed in as: {user.role.replace(/_/g, ' ')} — {user.name}
          </div>
        )}
        <div className="flex items-center justify-center gap-3">
          <Link to="/dashboard"
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 6px 20px rgba(37,99,235,0.3)' }}>
            Back to Dashboard
          </Link>
          <Link to="/login"
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
            Sign Out
          </Link>
        </div>
        <p className="text-xs text-gray-400 mt-6">
          Contact your system administrator if you need access to this section.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   App
───────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <AIServiceProvider>
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          {/* Public — QR credential verification (no auth needed) */}
          <Route path="/verify/:id" element={<VerifyProfile />} />

          {/* Public — Authentication Gateway */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><CitizenRegistration /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/otp-verification" element={<PublicRoute><OTPVerification /></PublicRoute>} />

          {/* Unauthorized */}
          <Route path="/unauthorized" element={<ProtectedRoute><UnauthorizedPage /></ProtectedRoute>} />

          {/* Protected app shell */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/login" replace />} />

            <Route path="dashboard" element={<RoleRoute path="/dashboard"><Dashboard /></RoleRoute>} />
            <Route path="water-infrastructure" element={<RoleRoute path="/water-infrastructure"><WaterInfrastructure /></RoleRoute>} />
            <Route path="water-infrastructure/:id" element={<RoleRoute path="/water-infrastructure"><WaterPointDetail /></RoleRoute>} />
            <Route path="sensors" element={<RoleRoute path="/sensors"><SensorsPage /></RoleRoute>} />
            <Route path="climate" element={<RoleRoute path="/climate"><ClimateMonitor /></RoleRoute>} />
            <Route path="water-quality" element={<RoleRoute path="/water-quality"><WaterQuality /></RoleRoute>} />
            <Route path="maintenance" element={<RoleRoute path="/maintenance"><MaintenancePage /></RoleRoute>} />
            <Route path="community" element={<RoleRoute path="/community"><CommunityReports /></RoleRoute>} />
            <Route path="health" element={<RoleRoute path="/health"><HealthSurveillance /></RoleRoute>} />
            <Route path="emergency" element={<RoleRoute path="/emergency"><EmergencyCenter /></RoleRoute>} />
            <Route path="gis" element={<RoleRoute path="/gis"><GISMap /></RoleRoute>} />
            <Route path="analytics" element={<RoleRoute path="/analytics"><Analytics /></RoleRoute>} />
            <Route path="governance" element={<RoleRoute path="/governance"><Governance /></RoleRoute>} />
            <Route path="ai-hub" element={<RoleRoute path="/ai-hub"><AIHub /></RoleRoute>} />
            <Route path="users" element={<RoleRoute path="/users"><UserManagement /></RoleRoute>} />
            <Route path="technician-portal" element={<RoleRoute path="/technician-portal"><TechnicianPortal /></RoleRoute>} />
            <Route path="gwn" element={<RoleRoute path="/gwn"><GWN /></RoleRoute>} />
            <Route path="incident-command" element={<RoleRoute path="/incident-command"><IncidentCommand /></RoleRoute>} />
            <Route path="citizen-hub" element={<RoleRoute path="/citizen-hub"><CitizenHub /></RoleRoute>} />
          <Route path="citizen-report" element={<RoleRoute path="/water-infrastructure"><CitizenReport /></RoleRoute>} />
          <Route path="multilingual-report" element={<RoleRoute path="/water-infrastructure"><MultilingualReport /></RoleRoute>} />
          <Route path="report-status" element={<RoleRoute path="/water-infrastructure"><IncidentAnalysis /></RoleRoute>} />
          <Route path="track-reports" element={<RoleRoute path="/water-infrastructure"><CitizenTracking /></RoleRoute>} />
          <Route path="incident-analysis" element={<RoleRoute path="/incident-command"><IncidentAnalysis /></RoleRoute>} />
          <Route path="task-assignment" element={<RoleRoute path="/water-infrastructure"><TaskAssignment /></RoleRoute>} />
          </Route>

          {/* Catch-all — boot to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
    </AIServiceProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
