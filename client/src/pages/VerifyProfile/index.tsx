import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ROLE_LABELS: Record<string, string> = {
  national_admin: 'National Admin',
  district_officer: 'District Officer',
  community_committee: 'Committee Member',
  citizen: 'Citizen',
  ngo_officer: 'NGO Officer',
  technician: 'Technician',
  health_officer: 'Health Officer',
  climate_scientist: 'Climate Scientist',
};

const AVATAR_COLORS: Record<string, string> = {
  national_admin: '#7c3aed', district_officer: '#2563eb',
  community_committee: '#059669', citizen: '#6b7280',
  ngo_officer: '#d97706', technician: '#ca8a04',
  health_officer: '#dc2626', climate_scientist: '#0891b2',
};

const initials = (name: string) =>
  name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export default function VerifyProfile() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/auth/users/${id}/public`)
      .then(r => setUser(r.data.user))
      .catch(() => setError('User not found or account is inactive.'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '40px 36px',
        maxWidth: '420px', width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '28px' }}>💧</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#1e3a5f', letterSpacing: '1px' }}>HYDROSENSE</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Staff Credential Verification</div>
        </div>

        {loading && (
          <div style={{ padding: '40px 0', color: '#6b7280' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
            Loading profile...
          </div>
        )}

        {error && (
          <div style={{ padding: '40px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>Verification Failed</div>
            <div style={{ color: '#6b7280', fontSize: '14px' }}>{error}</div>
          </div>
        )}

        {user && (
          <>
            {/* Avatar */}
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: AVATAR_COLORS[user.role] || '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', fontWeight: 700, color: '#fff',
              margin: '0 auto 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}>
              {user.avatar
                ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : initials(user.name)}
            </div>

            {/* Name */}
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
              {user.name}
            </div>

            {/* Email */}
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
              ✉️ {user.email}
            </div>

            {/* Role badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: (AVATAR_COLORS[user.role] || '#6b7280') + '18',
              color: AVATAR_COLORS[user.role] || '#6b7280',
              border: `1.5px solid ${AVATAR_COLORS[user.role] || '#6b7280'}40`,
              borderRadius: '20px', padding: '6px 16px', fontSize: '13px', fontWeight: 600,
              marginBottom: '16px',
            }}>
              🏛️ {ROLE_LABELS[user.role] || user.role}
            </div>

            {/* District / Org */}
            {(user.district || user.organization) && (
              <div style={{ color: '#374151', fontSize: '14px', marginBottom: '8px' }}>
                {user.district && <div>📍 {user.district}</div>}
                {user.organization && <div>🏢 {user.organization}</div>}
              </div>
            )}

            {/* Verified badge */}
            <div style={{
              marginTop: '24px', padding: '12px', borderRadius: '12px',
              background: '#f0fdf4', border: '1.5px solid #86efac',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '18px' }}>✅</span>
              <span style={{ color: '#15803d', fontWeight: 600, fontSize: '14px' }}>
                Verified HydroSense Staff
              </span>
            </div>

            <div style={{ marginTop: '20px', color: '#9ca3af', fontSize: '11px' }}>
              HydroSense · Climate-Resilient Uganda
            </div>
          </>
        )}
      </div>
    </div>
  );
}
