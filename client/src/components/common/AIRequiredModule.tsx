import { ReactNode } from 'react';
import { useAIService } from '../../contexts/AIServiceContext';
import { Brain, RefreshCw, Wifi, Globe } from 'lucide-react';

interface AIRequiredModuleProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function AIRequiredModule({ children, fallback }: AIRequiredModuleProps) {
  const { status, aiOnline, checkNow } = useAIService();

  if (!aiOnline && status !== 'reconnecting' && status !== 'offline') {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(11,94,66,0.1)', border: '1px solid rgba(11,94,66,0.2)' }}>
          <Globe size={28} className="text-emerald-400" />
        </div>
        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">AI Services Initializing</h3>
        <p className="text-sm text-gray-400 mt-2 max-w-sm">
          Hydro AI is synchronizing. AI-powered features will be available shortly.
        </p>
        <button onClick={checkNow} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
          Check Connection
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
