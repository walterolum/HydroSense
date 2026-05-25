import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'cyan' | 'yellow' | 'gray';
  trend?: { value: number; label?: string };
  loading?: boolean;
  onClick?: () => void;
}

const colorMap = {
  blue:   { bg: 'bg-blue-50   dark:bg-blue-900/20',   icon: 'bg-blue-100   dark:bg-blue-900/40   text-blue-600   dark:text-blue-400',   value: 'text-blue-700   dark:text-blue-300'   },
  green:  { bg: 'bg-green-50  dark:bg-green-900/20',  icon: 'bg-green-100  dark:bg-green-900/40  text-green-600  dark:text-green-400',  value: 'text-green-700  dark:text-green-300'  },
  red:    { bg: 'bg-red-50    dark:bg-red-900/20',    icon: 'bg-red-100    dark:bg-red-900/40    text-red-600    dark:text-red-400',    value: 'text-red-700    dark:text-red-300'    },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', icon: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400', value: 'text-orange-700 dark:text-orange-300' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400', value: 'text-purple-700 dark:text-purple-300' },
  cyan:   { bg: 'bg-cyan-50   dark:bg-cyan-900/20',   icon: 'bg-cyan-100   dark:bg-cyan-900/40   text-cyan-600   dark:text-cyan-400',   value: 'text-cyan-700   dark:text-cyan-300'   },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', icon: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400', value: 'text-yellow-700 dark:text-yellow-300' },
  gray:   { bg: 'bg-gray-50   dark:bg-gray-800',      icon: 'bg-gray-100   dark:bg-gray-700      text-gray-600   dark:text-gray-400',   value: 'text-gray-700   dark:text-gray-300'   },
};

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue', trend, loading, onClick }: StatCardProps) {
  const colors = colorMap[color];

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="flex-1">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card hover:shadow-md transition-all ${onClick ? 'cursor-pointer' : ''} ${colors.bg}`}
      onClick={onClick}
    >
      {/* Mobile: stacked (icon above text). sm+: side by side */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium leading-snug">{title}</p>
          <p className={`text-xl sm:text-2xl font-bold mt-0.5 leading-tight break-all ${colors.value}`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${
              trend.value > 0 ? 'text-green-600 dark:text-green-400'
              : trend.value < 0 ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
            }`}>
              {trend.value > 0 ? <TrendingUp size={12} /> : trend.value < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
              <span>{trend.value > 0 ? '+' : ''}{trend.value}% {trend.label || ''}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
