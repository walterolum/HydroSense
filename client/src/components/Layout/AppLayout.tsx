import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatBot from '../ai/ChatBot';
import SessionTimeoutWarning from '../common/SessionTimeoutWarning';

const pageTitles: Record<string, string> = {
  '/dashboard':           'Dashboard Overview',
  '/water-infrastructure':'Water Infrastructure',
  '/sensors':             'IoT Sensor Monitoring',
  '/climate':             'Climate & Environment Monitor',
  '/water-quality':       'Water Quality Monitoring',
  '/maintenance':         'Maintenance Tracker',
  '/community':           'Community Reports',
  '/health':              'Public Health Surveillance',
  '/emergency':           'Emergency Response Center',
  '/gis':                 'GIS & Spatial Mapping',
  '/analytics':           'Analytics & AI Forecasting',
  '/governance':          'Governance & Transparency',
  '/ai-hub':              'AI Intelligence Hub',
  '/users':               'User Management',
  '/technician-portal':   'My Tasks',
  '/gwn':                 'Guardian Water Network — Citizen Science',
  '/incident-command':    'Environmental Incident Command Center',
  '/citizen-hub':         'Citizen Environmental Hub',
};

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const basePath = '/' + location.pathname.split('/')[1];
  const title = pageTitles[basePath] || 'HYDROSENSE';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 lg:ml-[260px]">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Hydro AI chatbot — available on every authenticated page */}
      <ChatBot />

      {/* Session timeout warning */}
      <SessionTimeoutWarning />
    </div>
  );
}
