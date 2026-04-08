/**
 * HyperBabel React Demo — Header Component
 *
 * Sticky navigation bar showing the HyperBabel logo, navigation links,
 * the current user's identity, and a live presence status toggle.
 *
 * Presence status toggle:
 *   Clicking the status dot next to the user name opens a dropdown
 *   letting the user manually set their status (online / away / dnd).
 *   Changes are persisted via the HyperBabel Presence API
 *   (POST /presence/status) and stored locally so the dot updates immediately.
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import * as presenceService from '../services/presenceService';

// Status metadata: label, dot CSS class, emoji
const STATUS_OPTIONS = [
  { value: 'online',  label: 'Online',        dotClass: 'presence-dot-online',  emoji: '🟢' },
  { value: 'away',    label: 'Away',           dotClass: 'presence-dot-away',    emoji: '🟡' },
  { value: 'dnd',     label: 'Do Not Disturb', dotClass: 'presence-dot-dnd',     emoji: '🔴' },
];

// Persist status in localStorage so the dot is correct across page navigations
const STORAGE_KEY = 'hb_presence_status';

export default function Header() {
  const navigate  = useNavigate();
  const location  = useLocation();

  // Read the current user from localStorage (set during login)
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // ── Presence status state ────────────────────────────────────────────────
  const [status, setStatus]           = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'online'
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [isUpdating, setIsUpdating]     = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Log out ──────────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem('hb_user');
    localStorage.removeItem(STORAGE_KEY);
    navigate('/login');
  };

  // ── Presence status change ───────────────────────────────────────────────
  const handleStatusChange = async (newStatus) => {
    if (!user?.user_id || isUpdating || newStatus === status) {
      setShowDropdown(false);
      return;
    }

    setIsUpdating(true);
    setShowDropdown(false);

    // Optimistic UI update
    setStatus(newStatus);
    localStorage.setItem(STORAGE_KEY, newStatus);

    try {
      await presenceService.updateStatus(user.user_id, newStatus);
    } catch (err) {
      // Non-critical — revert on failure
      console.warn('[Header] Presence status update failed:', err?.message);
      const prev = status;
      setStatus(prev);
      localStorage.setItem(STORAGE_KEY, prev);
    } finally {
      setIsUpdating(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const isActive     = (path) => location.pathname.startsWith(path);
  const currentOpt   = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];

  return (
    <header className="header">
      {/* ── Logo ── */}
      <Link to="/dashboard" className="header-logo">
        <span className="header-logo-icon">⚡</span>
        HyperBabel Demo
      </Link>

      {/* ── Navigation Links ── */}
      <nav className="header-nav">
        <Link to="/dashboard">
          <button className={`btn btn-ghost ${isActive('/dashboard') ? 'btn-secondary' : ''}`}>
            🏠 Hub
          </button>
        </Link>
        <Link to="/chat">
          <button className={`btn btn-ghost ${isActive('/chat') ? 'btn-secondary' : ''}`}>
            💬 Chat
          </button>
        </Link>
        <Link to="/settings">
          <button className={`btn btn-ghost ${isActive('/settings') ? 'btn-secondary' : ''}`}>
            ⚙️ Settings
          </button>
        </Link>
      </nav>

      {/* ── User Info + Presence Status + Logout ── */}
      <div className="header-user">
        <div className="avatar avatar-sm">
          {(user.display_name || 'U')[0].toUpperCase()}
        </div>
        <span>{user.display_name || 'User'}</span>
        <span className="badge badge-primary">{user.preferred_lang_cd || 'en'}</span>

        {/* Presence status toggle */}
        <div className="presence-status-wrap" ref={dropdownRef}>
          <button
            className="presence-status-btn"
            onClick={() => setShowDropdown((v) => !v)}
            title="Change presence status"
            aria-label={`Status: ${currentOpt.label}. Click to change.`}
            aria-expanded={showDropdown}
          >
            <span
              className={`presence-status-dot ${currentOpt.dotClass}`}
              aria-hidden="true"
            />
            {isUpdating ? '…' : currentOpt.label}
            <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>▾</span>
          </button>

          {showDropdown && (
            <div className="presence-dropdown" role="menu" aria-label="Presence status options">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`presence-dropdown-item ${opt.value === status ? 'active' : ''}`}
                  onClick={() => handleStatusChange(opt.value)}
                  role="menuitem"
                  aria-current={opt.value === status}
                >
                  <span className={`presence-status-dot ${opt.dotClass}`} aria-hidden="true" />
                  {opt.emoji} {opt.label}
                  {opt.value === status && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
