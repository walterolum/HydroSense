import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'water_point' | 'alert' | 'maintenance' | 'health' | 'report' | 'drought' | 'sensor' | 'budget';
}

const waterPointColors: Record<string, string> = {
  functional: 'bg-green-100 text-green-800',
  non_functional: 'bg-red-100 text-red-800',
  needs_repair: 'bg-orange-100 text-orange-800',
  under_maintenance: 'bg-yellow-100 text-yellow-800',
};

const alertColors: Record<string, string> = {
  emergency: 'bg-red-600 text-white',
  critical: 'bg-orange-500 text-white',
  warning: 'bg-yellow-100 text-yellow-800',
  info: 'bg-blue-100 text-blue-800',
  active: 'bg-red-100 text-red-800',
  acknowledged: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
};

const maintColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const healthColors: Record<string, string> = {
  monitoring: 'bg-blue-100 text-blue-700',
  alert: 'bg-orange-100 text-orange-700',
  outbreak: 'bg-red-100 text-red-800',
  contained: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
};

const droughtColors: Record<string, string> = {
  extreme_drought: 'bg-red-700 text-white',
  severe_drought: 'bg-red-100 text-red-800',
  moderate_drought: 'bg-orange-100 text-orange-800',
  mild_drought: 'bg-yellow-100 text-yellow-800',
  normal: 'bg-green-100 text-green-700',
  wet: 'bg-blue-100 text-blue-700',
};

const sensorColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  faulty: 'bg-red-100 text-red-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
};

const reportColors: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  under_review: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
};

const budgetColors: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
};

function getColor(type: string, status: string): string {
  const maps: Record<string, Record<string, string>> = {
    water_point: waterPointColors,
    alert: alertColors,
    maintenance: maintColors,
    health: healthColors,
    drought: droughtColors,
    sensor: sensorColors,
    report: reportColors,
    budget: budgetColors,
  };
  return (maps[type] || {})[status] || 'bg-gray-100 text-gray-600';
}

function formatLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function StatusBadge({ status, type = 'water_point' }: StatusBadgeProps) {
  return (
    <span className={`badge ${getColor(type, status)}`}>
      {formatLabel(status)}
    </span>
  );
}
