import { useEffect, useState } from 'react';
import { useAIService, AIStatus as AIStatusType } from '../../contexts/AIServiceContext';
import {
  Wifi, WifiOff, Loader2, RefreshCw, AlertTriangle, Brain, Activity,
  CheckCircle, Clock, Sparkles, Zap, Globe,
} from 'lucide-react';

const statusConfig: Record<AIStatusType, { label: string; color: string; dot: string; icon: React.ElementType; message: string }> = {
  idle:         { label: 'Hydro AI Online',  color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400', icon: CheckCircle, message: 'Environmental Intelligence Active' },
  thinking:     { label: 'Analyzing',        color: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-400 animate-pulse', icon: Sparkles, message: 'Processing Environmental Insights' },
  processing:   { label: 'Processing',       color: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-400 animate-pulse', icon: Activity, message: 'Processing Environmental Insights' },
  responding:   { label: 'Responding',       color: 'text-purple-600 dark:text-purple-400',   dot: 'bg-purple-400 animate-pulse', icon: Zap, message: 'Processing Environmental Insights' },
  completed:    { label: 'Complete',         color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400', icon: CheckCircle, message: 'Response complete' },
  reconnecting: { label: 'AI Online',        color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400', icon: Globe, message: 'Secure AI Services Operational' },
  offline:      { label: 'AI Online',        color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400', icon: Globe, message: 'AI Services Operational' },
  error:        { label: 'AI Online',        color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-400', icon: Globe, message: 'Secure AI Services Operational' },
};

export default function AIStatusIndicator({ compact = false }: { compact?: boolean }) {
  const { status, aiOnline, capabilities, checkNow, latency, lastChecked, statusMessage, activeRequest, networkQuality } = useAIService();
  const [showDetail, setShowDetail] = useState(false);
  const cfg = statusConfig[status];

  useEffect(() => {
    if (showDetail) {
      const t = setTimeout(() => setShowDetail(false), 5000);
      return () => clearTimeout(t);
    }
  }, [showDetail]);

  const getIcon = () => {
    if (aiOnline && (status === 'idle' || status === 'completed')) return <Wifi size={11} className="text-emerald-500" />;
    if (status === 'reconnecting' || status === 'error' || status === 'offline') return <Globe size={11} />;
    if (status === 'thinking' || status === 'processing' || status === 'responding') return <Activity size={11} className="animate-pulse" />;
    return <cfg.icon size={11} />;
  };

  const getBgClass = () => {
    if (aiOnline && (status === 'idle' || status === 'completed')) {
      return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
    }
    if (status === 'offline' || status === 'reconnecting' || status === 'error') {
      return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
    }
    if (status === 'thinking' || status === 'processing' || status === 'responding') {
      return 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 animate-pulse';
    }
    return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 relative">
        <button
          onClick={() => setShowDetail(!showDetail)}
          className="relative group"
          title={`Hydro AI: ${cfg.message}`}
        >
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${getBgClass()}`}>
            {getIcon()}
            <span>{cfg.label}</span>
          </div>
        </button>

        {showDetail && (
          <div className="absolute top-full right-0 mt-2 w-72 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-xl z-50 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-emerald-600" />
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">Hydro AI Status</span>
              </div>
              <button onClick={() => setShowDetail(false)} className="text-gray-400 hover:text-gray-600">X</button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`font-semibold ${cfg.color} flex items-center gap-1`}>
                  {aiOnline && <Wifi size={12} className="text-emerald-500" />}
                  Hydro AI Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Message</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300 text-right max-w-[180px]">{statusMessage}</span>
              </div>
              {networkQuality && networkQuality !== 'good' && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Network</span>
                  <span className={`font-semibold ${networkQuality === 'poor' ? 'text-amber-600' : 'text-blue-600'}`}>{networkQuality}</span>
                </div>
              )}
              {activeRequest && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Active</span>
                  <span className={`font-semibold ${activeRequest.status === 'completed' ? 'text-emerald-600' : activeRequest.status === 'failed' || activeRequest.status === 'timeout' ? 'text-red-600' : 'text-blue-600'}`}>{activeRequest.status}</span>
                </div>
              )}
              {latency !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Latency</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{latency}ms</span>
                </div>
              )}
              {lastChecked && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Last Check</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{lastChecked.toLocaleTimeString()}</span>
                </div>
              )}
              {capabilities.length > 0 && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500 block mb-1">Capabilities</span>
                  <div className="flex flex-wrap gap-1">
                    {capabilities.map(c => (
                      <span key={c} className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{c.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={checkNow}
                className="w-full mt-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1">
                <RefreshCw size={11} /> Check Now
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${getBgClass()}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {aiOnline && (status === 'idle' || status === 'completed') && (
          <Wifi size={10} className="text-emerald-500" />
        )}
        <span>{cfg.label}</span>
      </div>
      {aiOnline && latency !== null && (
        <span className="text-[10px] text-gray-400">{latency}ms</span>
      )}
    </div>
  );
}
