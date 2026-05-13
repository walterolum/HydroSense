import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut, Activity } from 'lucide-react';

export default function SessionTimeoutWarning() {
  const { sessionWarning, sessionTimeRemaining, extendSession, logout } = useAuth();
  const navigate = useNavigate();

  if (!sessionWarning || sessionTimeRemaining === null) return null;

  const secondsLeft = Math.floor(sessionTimeRemaining / 1000);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-8 max-w-sm mx-4 w-full">
        <div className="w-16 h-16 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-4">
          <Clock size={32} className="text-yellow-600 dark:text-yellow-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">Session Expiring Soon</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
          Your session will expire in <strong className="text-yellow-600">{minutes}:{seconds.toString().padStart(2, '0')}</strong>. Extend to continue working.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => { extendSession(); }}
            className="w-full py-3 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <Activity size={16} /> Extend Session
          </button>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={16} /> Sign Out Now
          </button>
        </div>
      </div>
    </div>
  );
}
