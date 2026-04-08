/**
 * HyperBabel React Demo — Reusable Chat Message List
 *
 * Displays a scrollable list of chat messages with:
 * - Sender name and avatar
 * - Original message content with rich type renderers
 * - Auto-translated text (shown below original in accent color)
 * - Locale-aware timestamps (auto-adapts to user's browser language/region)
 * - Date separators between messages from different days
 * - Emoji reaction counts
 * - Own-message right-aligned, others left-aligned
 *
 * message_type rendering:
 *   'image'    → thumbnail (200px) + click → lightbox (ESC or background click to close)
 *   'video'    → native HTML5 video player with controls
 *   'audio'    → native HTML5 audio player with controls
 *   'file'     → download card with file name and size
 *   'location' → rich map card with pin icon, coordinates, and "Open in Maps" link
 *   'contact'  → contact card with colour-hashed avatar, name, phone, email
 *   default    → plain text (with translation if available)
 *
 * Hover action bar (all non-system messages):
 *   📋 Copy  — copies text content or URL to clipboard; contact/location → formatted string
 *   📤 Share — Web Share API (OS native share sheet), fallback to clipboard copy
 *   📌 Pin   — pin/unpin for eligible message types
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { formatMessageTime, formatDateSeparator, initLocale } from '../utils/timeUtils';

/**
 * @param {object}   props
 * @param {Array}    props.messages       — Message objects from HyperBabel API
 * @param {string}   props.currentUserId  — Current user's ID (own-message styling)
 * @param {string}   [props.pinnedMsgId]  — ID of the currently pinned message
 * @param {boolean}  [props.canPin]       — Whether current user can pin/unpin
 * @param {Function} [props.onPin]        — Callback(msgId) to pin a message
 * @param {string}   [props.hoveredMsgId] — Controlled hover state from parent
 * @param {Function} [props.onHover]      — Callback(msgId|null) to update hover state
 */
export default function ChatMessageList({ messages = [], currentUserId, pinnedMsgId, canPin, onPin, hoveredMsgId, onHover, onCopy: notifyCopy, readStatuses = {}, roomType, isSelfChat, members = [], onRetry, onCancelSend, onEdit, onDelete, editingMsgId, editingContent, setEditingContent, deleteConfirmId, setDeleteConfirmId, replySnapshots = {}, onReply, userLang = 'en' }) {
  const bottomRef = useRef(null);
  const [localeReady, setLocaleReady] = useState(false);
  // Lightbox state for image click-to-enlarge
  const [lightboxUrl, setLightboxUrl] = useState(null);
  // Clipboard feedback: msgId that was just copied
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  // Reply toast: shown when original message is not in the current view
  const [replyToast, setReplyToast] = useState(false);
  const replyToastMsgRef = useRef('');
  const lang = (userLang || 'en').split('-')[0];

  /**
   * Render a compact preview of the original message content inside a reply quote box.
   * Adapts to each message_type: text shows translated content if available,
   * media types show an emoji icon + filename/name.
   */
  const renderQuoteContent = (snap) => {
    if (!snap) return null;
    const meta = snap.metadata || {};
    const fileName = meta.file?.original_name || meta.filename;
    switch (snap.message_type) {
      case 'image':    return <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>🖼️ {fileName || 'Image'}</span>;
      case 'video':    return <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>🎬 {fileName || 'Video'}</span>;
      case 'audio':    return <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>🎵 {fileName || 'Audio'}</span>;
      case 'file':     return <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>📎 {fileName || 'File'}</span>;
      case 'location': return <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>📍 {meta.name || 'Location'}</span>;
      case 'contact':  return <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px' }}>👤 {meta.name || 'Contact'}</span>;
      default: {
        // For text: prefer translated content in user's language, fall back to original
        const translated = snap.translated_content?.[lang];
        const rawC = snap.content;
        const displayC = rawC && typeof rawC === 'object' ? (rawC[lang] || rawC['en'] || Object.values(rawC)[0] || '') : rawC;
        return <span style={{ fontSize:'12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{translated || displayC}</span>;
      }
    }
  };

  /**
   * Handle click on a reply quote box.
   * If the original message is visible in the current message list, scroll to it
   * and highlight it briefly. If not visible (e.g. the message is too old and has
   * scrolled out of the loaded range), show a toast notification instead.
   */
  const handleReplyQuoteClick = (replyToId) => {
    const el = document.getElementById(`msg-${replyToId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('reply-highlight-pulse');
      setTimeout(() => el.classList.remove('reply-highlight-pulse'), 2000);
    } else {
      replyToastMsgRef.current = lang === 'ko' ? '원본 메시지가 현재 목록에 없습니다' : 'Original message is not in the current view';
      setReplyToast(true);
      setTimeout(() => setReplyToast(false), 2500);
    }
  };

  useEffect(() => {
    initLocale().then(() => setLocaleReady(true));
  }, []);

  // Auto-scroll to the latest message whenever messages change.
  // Uses instant + rAF chain to handle tall cards (images, location, contact)
  // that cause layout reflow AFTER paint.
  const lastMsgId = messages[messages.length - 1]?.id;
  useEffect(() => {
    // first frame: paint; second frame + 100ms: layout settled
    requestAnimationFrame(() => {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 60);
    });
  }, [lastMsgId]);

  // Close lightbox on ESC key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setLightboxUrl(null);
  }, []);
  useEffect(() => {
    if (lightboxUrl) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [lightboxUrl, handleKeyDown]);

  if (messages.length === 0) {
    return (
      <div className="messages-container">
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <div className="empty-state-title">No messages yet</div>
          <div className="empty-state-desc">
            Start the conversation by sending a message below.
          </div>
        </div>
      </div>
    );
  }

  const shouldShowDateSeparator = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const cur = dayjs(msg.created_at).startOf('day');
    const prev = dayjs(prevMsg.created_at).startOf('day');
    return !cur.isSame(prev);
  };

  /** Render message body based on message_type */
  const renderContent = (msg, isOwn) => {
    const type = msg.message_type;
    // Support both metadata.url (legacy storageService) and msg.content (new 3-step presign)
    const url = msg.metadata?.url || (type !== 'text' && type !== 'system' ? msg.content : null);
    const meta = msg.metadata || {};
    const filename = meta.filename || meta.original_name || meta.file?.original_name || '';
    const sizeBytes = meta.size || meta.size_bytes || meta.file?.size_bytes;
    const sizeMb = sizeBytes ? (sizeBytes / 1024 / 1024).toFixed(1) + ' MB' : '';

    // ── Image: thumbnail + click to open lightbox ────────────────
    if (type === 'image' && url) {
      return (
        <div
          style={{ cursor: 'pointer' }}
          onClick={() => setLightboxUrl(url)}
          title="Click to enlarge"
        >
          <img
            src={url}
            alt={filename || 'Image'}
            style={{ maxWidth: '200px', maxHeight: '180px', borderRadius: '8px', display: 'block', objectFit: 'cover' }}
          />
          {filename && (
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
              {filename}
            </div>
          )}
        </div>
      );
    }

    // ── Video: native HTML5 player ───────────────────────────────
    if (type === 'video' && url) {
      return (
        <div>
          <video
            src={url}
            controls
            style={{ maxWidth: '280px', maxHeight: '200px', borderRadius: '8px', display: 'block' }}
            preload="metadata"
          />
          {filename && (
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
              🎬 {filename}
            </div>
          )}
        </div>
      );
    }

    // ── Audio: native HTML5 player ───────────────────────────────
    if (type === 'audio' && url) {
      return (
        <div>
          <audio src={url} controls style={{ maxWidth: '250px' }} preload="metadata" />
          {filename && (
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
              🎵 {filename}
            </div>
          )}
        </div>
      );
    }

    // ── File: download card ──────────────────────────────────────
    if (type === 'file' && url) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px', borderRadius: '8px', minWidth: '180px',
            textDecoration: 'none',
            background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
            border: isOwn ? 'none' : '1px solid rgba(0,0,0,0.1)',
            color: 'inherit',
          }}
        >
          <div style={{ fontSize: '24px', flexShrink: 0 }}>📎</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {filename || 'Download File'}
            </div>
            {sizeMb && <div style={{ fontSize: '11px', opacity: 0.65 }}>{sizeMb}</div>}
          </div>
          <div style={{ fontSize: '16px', flexShrink: 0, opacity: 0.7 }}>⬇</div>
        </a>
      );
    }

    // ── Location: rich map card ──────────────────────────────────
    if (type === 'location') {
      const lat = meta.latitude;
      const lng = meta.longitude;
      const placeName = meta.name || msg.content || 'Location';
      const address   = meta.address || '';
      const mapsUrl   = lat && lng
        ? `https://maps.google.com/?q=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}`;
      return (
        <div style={{
          borderRadius: '14px', overflow: 'hidden', minWidth: '220px', maxWidth: '280px',
          border: '1px solid rgba(16,185,129,0.25)',
          boxShadow: '0 2px 12px rgba(16,185,129,0.12)',
          background: isOwn ? 'rgba(255,255,255,0.12)' : '#f0fdf4',
        }}>
          {/* Map preview header */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)',
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ fontSize: '28px', lineHeight: 1 }}>📍</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px', lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {placeName}
              </div>
              {address && (
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', marginTop: '2px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {address}
                </div>
              )}
            </div>
          </div>
          {/* Coordinates + Open link */}
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            {lat && lng ? (
              <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>
                {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
              </span>
            ) : <span />}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: '#059669', color: '#fff', borderRadius: '20px',
                padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              🗺 Open in Maps
            </a>
          </div>
        </div>
      );
    }

    // ── Contact: rich contact card ───────────────────────────────
    if (type === 'contact') {
      const contactName  = meta.name  || msg.content || 'Contact';
      const phone        = meta.phone || '';
      const email        = meta.email || '';
      // Deterministic colour from name
      const hue = (contactName.charCodeAt(0) + (contactName.charCodeAt(1) || 0)) % 360;
      const initials = contactName.split(' ').map(w => w[0]?.toUpperCase()).slice(0, 2).join('');
      return (
        <div style={{
          borderRadius: '14px', overflow: 'hidden', minWidth: '220px', maxWidth: '280px',
          border: '1px solid rgba(99,102,241,0.2)',
          boxShadow: '0 2px 12px rgba(99,102,241,0.1)',
          background: isOwn ? 'rgba(255,255,255,0.1)' : '#fafaff',
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, hsl(${hue},60%,40%) 0%, hsl(${hue},50%,55%) 100%)`,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            {/* Initials avatar */}
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: `hsl(${hue},40%,30%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '16px', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}>{initials || '👤'}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px', lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                👤 {contactName}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', marginTop: '2px' }}>Contact</div>
            </div>
          </div>
          {/* Details */}
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {phone && (
              <a href={`tel:${phone}`} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                textDecoration: 'none', color: '#374151', fontSize: '13px',
              }}>
                <span style={{ fontSize: '16px' }}>📞</span>
                <span>{phone}</span>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                textDecoration: 'none', color: '#374151', fontSize: '13px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: '16px' }}>✉️</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
              </a>
            )}
            {!phone && !email && (
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>No contact details provided</span>
            )}
          </div>
        </div>
      );
    }

    // ── Default: text (with optional translation) ────────────────
    // Deleted message: render tombstone placeholder
    if (msg.deleted_at) {
      const deletedText = lang === 'ko' ? '이 메시지는 삭제되었습니다.' : 'This message has been deleted.';
      return <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '13px' }}>🗑 {deletedText}</span>;
    }

    // msg.content may be a multilingual object {en: '...', ko: '...'} or a plain string.
    const rawContent = msg.content;
    const displayContent = rawContent && typeof rawContent === 'object'
      ? (rawContent[lang] || rawContent['en'] || Object.values(rawContent)[0] || '')
      : rawContent;

    // msg.translated_content may be a multilingual object or a plain string.
    const rawTranslated = msg.translated_content;
    const displayTranslated = rawTranslated && typeof rawTranslated === 'object'
      ? (rawTranslated[lang] || rawTranslated['en'] || Object.values(rawTranslated)[0] || null)
      : rawTranslated;

    return (
      <>
        <div>{displayContent}</div>
        {displayTranslated && displayTranslated !== displayContent && (
          <div className="message-translated">
            🌐 {displayTranslated}
          </div>
        )}
      </>
    );
  };

  // ── Copy & Share helper ──────────────────────────────────────────────
  const getCopyText = (msg) => {
    const meta = msg.metadata || {};
    const url  = meta.url || meta.file?.url;
    switch (msg.message_type) {
      case 'location': {
        const parts = [meta.name, meta.address];
        if (meta.latitude && meta.longitude) parts.push(`${meta.latitude}, ${meta.longitude}`);
        return parts.filter(Boolean).join('\n');
      }
      case 'contact':
        return [meta.name, meta.phone, meta.email].filter(Boolean).join('\n');
      case 'image': case 'video': case 'audio': case 'file':
        return url || msg.content || '';
      default:
        return msg.content || '';
    }
  };

  const handleCopy = async (msg) => {
    try {
      await navigator.clipboard.writeText(getCopyText(msg));
      setCopiedMsgId(msg.id);
      notifyCopy?.(msg.id);                        // notify parent for toast
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      // clipboard not available in insecure context — silent fail
    }
  };

  const handleShare = async (msg) => {
    const meta = msg.metadata || {};
    const url  = meta.url || meta.file?.url;
    const text = getCopyText(msg);
    const shareData = {
      title: meta.name || meta.filename || 'Shared via HyperBabel',
      text,
      ...(url ? { url } : {}),
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(url || text);
        setCopiedMsgId(msg.id);
        setTimeout(() => setCopiedMsgId(null), 2000);
      }
    } catch {
      // User cancelled share — ignore
    }
  };

  return (
    <>
      <div className="messages-container">
        {messages.map((msg, idx) => {
          const isOwn = msg.sender_id === currentUserId;
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const showDateSep = msg.created_at && shouldShowDateSeparator(msg, prevMsg);

          return (
            <div key={msg.id || idx}>
              {/* ── Date separator ── */}
              {showDateSep && (
                <div className="date-separator">
                  <span className="date-separator-label">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                </div>
              )}

              {/* ── System message (centered, no avatar) ── */}
              {msg.message_type === 'system' ? (
                msg.content ? <div className="message-system">{msg.content}</div> : null
              ) : (
                /* ── Regular message ── */
                <div
                  id={`msg-${msg.id}`}
                  className={`message-row ${isOwn ? 'own' : ''}`}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => onHover?.(msg.id)}
                  onMouseLeave={() => onHover?.(null)}
                >
                  {/* Avatar — only for other users */}
                  {!isOwn && (
                    <div className="avatar avatar-sm">
                      {(msg.sender_name || msg.sender_id || '?')[0].toUpperCase()}
                    </div>
                  )}

                   {/* ── Hover action bar: Copy · Share · Pin ── */}
                  {hoveredMsgId === msg.id && msg.message_type !== 'system' && msg.message_type !== 'video_call' && (
                    <div style={{
                      position: 'absolute',
                      top: '-36px',
                      [isOwn ? 'right' : 'left']: 0,
                      display: 'flex', alignItems: 'center', gap: '2px',
                      background: '#ffffff',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '20px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      padding: '4px 6px',
                      zIndex: 20,
                      animation: 'fadeInUp 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}>
                      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } } @keyframes replyHighlightPulse { 0% { background-color: rgba(59,130,246,0.18); } 100% { background-color: transparent; } } .reply-highlight-pulse { animation: replyHighlightPulse 2s ease-out; }`}</style>

                      {/* Copy */}
                      <button
                        onClick={() => handleCopy(msg)}
                        title="Copy"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '4px 8px', borderRadius: '14px', fontSize: '15px',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          color: copiedMsgId === msg.id ? '#10b981' : '#6b7280',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        {copiedMsgId === msg.id ? '✅' : '📋'}
                        {copiedMsgId === msg.id && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>Copied!</span>
                        )}
                      </button>

                      {/* Divider */}
                      <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 2px' }} />

                      {/* Share */}
                      <button
                        onClick={() => handleShare(msg)}
                        title="Share"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '4px 8px', borderRadius: '14px', fontSize: '15px',
                          color: '#6b7280', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >📤</button>

                      {/* Pin (only for pinnable types) */}
                      {canPin && onPin && !['video_call', 'system'].includes(msg.message_type) && (
                        <>
                          <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 2px' }} />
                          <button
                            onClick={() => onPin(msg.id)}
                            title={pinnedMsgId === msg.id ? 'Already pinned' : 'Pin message'}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '4px 8px', borderRadius: '14px', fontSize: '15px',
                              color: pinnedMsgId === msg.id ? '#d97706' : '#6b7280',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >📌</button>
                        </>
                      )}
                      {/* Reply — available for non-deleted, non-system messages */}
                      {!msg.deleted_at && msg.message_type !== 'video_call' && msg.message_type !== 'system' && onReply && (
                        <>
                          <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 2px' }} />
                          <button
                            onClick={() => onReply(msg)}
                            title="Reply"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '4px 8px', borderRadius: '14px', fontSize: '15px',
                              color: '#6b7280', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >↩</button>
                        </>
                      )}
                      {/* Edit (own text messages only, not deleted) */}
                      {isOwn && msg.message_type === 'text' && !msg.deleted_at && onEdit && (
                        <>
                          <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 2px' }} />
                          <button
                            onClick={() => { onEdit('start', msg.id, msg.content); }}
                            title="Edit"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '4px 8px', borderRadius: '14px', fontSize: '15px',
                              color: '#6b7280', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >✎</button>
                        </>
                      )}
                      {/* Delete */}
                      {!msg.deleted_at && (isOwn || (members.find(m => m.user_id === currentUserId)?.role === 'owner' || members.find(m => m.user_id === currentUserId)?.role === 'sub_admin')) && onDelete && roomType !== '1to1' || (!msg.deleted_at && isOwn && onDelete) ? (
                        <>
                          <div style={{ width: '1px', height: '18px', background: '#e5e7eb', margin: '0 2px' }} />
                          {deleteConfirmId === msg.id ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                onClick={() => onDelete(msg.id)}
                                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
                              >삭제</button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}
                              >취소</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(msg.id)}
                              title="Delete"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '4px 8px', borderRadius: '14px', fontSize: '15px',
                                color: '#6b7280', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >🗑</button>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}

                  {/* Zero padding for media types so card renders edge-to-edge (WhatsApp / Telegram style) */}
                  <div
                    className="message-bubble"
                    style={['image','video','audio','file','location','contact'].includes(msg.message_type)
                      ? { padding: 0, background: 'none', boxShadow: 'none', border: 'none' }
                      : {}}
                  >
                    {/* Sender name — only for other users */}
                    {!isOwn && (
                      <div className="message-sender">
                        {msg.sender_name || msg.sender_id}
                      </div>
                    )}

                    {/* ── Reply Quote Box ──
                     * When a message is a reply (has reply_to field), display the original
                     * message as a compact, clickable quote above the message content.
                     * Shows sender name + preview. Handles 3 states:
                     *   1. Normal: sender name + content preview (all 7 message types)
                     *   2. Deleted original: "Deleted message" tombstone
                     *   3. Not found: "Cannot load original message" fallback
                     */}
                    {msg.reply_to && (() => {
                      const snap = replySnapshots[msg.reply_to];
                      // Reply Quote Box — rendered OUTSIDE the bubble on light background.
                      // isOwn: teal-tinted bg + dark text (NOT white — would be invisible)
                      return (
                        <div
                          onClick={() => handleReplyQuoteClick(msg.reply_to)}
                          style={{
                            cursor: 'pointer',
                            marginBottom: '4px',
                            borderLeft: isOwn ? '3px solid #0d9488' : '3px solid #60a5fa',
                            borderRadius: '0 8px 8px 0',
                            padding: '5px 10px',
                            background: isOwn ? 'rgba(16,185,129,0.10)' : 'rgba(0,0,0,0.04)',
                            maxWidth: '280px',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = isOwn ? 'rgba(16,185,129,0.18)' : 'rgba(0,0,0,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isOwn ? 'rgba(16,185,129,0.10)' : 'rgba(0,0,0,0.04)'; }}
                        >
                          {!snap ? (
                            <span style={{ fontSize:'11px', fontStyle:'italic', color: '#94a3b8' }}>
                              {lang === 'ko' ? '원본 메시지를 불러올 수 없습니다' : 'Cannot load original message'}
                            </span>
                          ) : snap.deleted_at ? (
                            <span style={{ fontSize:'11px', fontStyle:'italic', color: '#94a3b8' }}>
                              🗑 {lang === 'ko' ? '삭제된 메시지입니다' : 'Deleted message'}
                            </span>
                          ) : (
                            <>
                              <div style={{ fontSize:'10px', fontWeight:700, color: isOwn ? '#0d9488' : '#3b82f6', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                ↩ {snap.sender_name}
                              </div>
                              <div style={{ color: '#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {renderQuoteContent(snap)}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Media / text content ── */}
                    {editingMsgId === msg.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <textarea
                          value={editingContent}
                          onChange={e => setEditingContent(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEdit('save', msg.id, editingContent); }
                            if (e.key === 'Escape') onEdit('cancel');
                          }}
                          autoFocus
                          style={{
                            width: '100%', minWidth: '220px', fontSize: '13px',
                            border: '1.5px solid #10b981', borderRadius: '8px',
                            padding: '6px 10px', resize: 'none', outline: 'none',
                            background: '#fff', color: '#111',
                          }}
                          rows={Math.min(5, editingContent.split('\n').length + 1)}
                        />
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => onEdit('cancel')}
                            style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '12px', padding: '3px 12px', fontSize: '12px', cursor: 'pointer' }}
                          >취소</button>
                          <button
                            onClick={() => onEdit('save', msg.id, editingContent)}
                            style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', padding: '3px 12px', fontSize: '12px', cursor: 'pointer' }}
                          >저장</button>
                        </div>
                      </div>
                    ) : renderContent(msg, isOwn)}

                    {/* Emoji reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <span
                            key={emoji}
                            className="badge"
                            style={{ background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
                          >
                            {emoji} {Array.isArray(users) ? users.length : users}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Locale-aware timestamp */}
                    <div
                      className="message-time"
                      title={msg.created_at ? formatDateSeparator(msg.created_at) + ' ' + dayjs(msg.created_at).format('LT') : ''}
                      style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      {localeReady
                        ? formatMessageTime(msg.created_at)
                        : msg.created_at
                          ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      {/* (edited) badge */}
                      {msg.edited_at && !msg.deleted_at && (
                        <span style={{ fontSize: '10px', color: '#9ca3af', fontStyle: 'italic' }}>(edited)</span>
                      )}
                      {/* ─ Delivery / Read Status Icon ─ own messages, non-self-chat */}
                      {isOwn && !isSelfChat && (() => {
                        const s = msg.sendStatus;
                        if (s === 'sending') return (
                          <span style={{ fontSize: '11px', lineHeight: 1 }}>⌛</span>
                        );
                        if (s === 'failed') return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <span title="Send failed" style={{ fontSize: '11px', color: '#ef4444' }}>❌</span>
                            {onRetry && (
                              <button onClick={() => onRetry(msg)} title="Retry"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: 0, lineHeight: 1 }}>🔄</button>
                            )}
                            {onCancelSend && (
                              <button onClick={() => onCancelSend(msg.id)} title="Cancel"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: 0, lineHeight: 1, color: '#6b7280' }}>✕</button>
                            )}
                          </span>
                        );
                        if (roomType === '1to1') {
                          const counterpartId = members.find(m => m.user_id !== currentUserId)?.user_id;
                          const rs = counterpartId ? readStatuses[counterpartId] : null;
                          const isRead = rs && new Date(msg.created_at) <= new Date(rs.read_at || rs.last_read_at);
                          return isRead
                            ? <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700, letterSpacing: '-1px' }}>✓✓</span>
                            : <span style={{ fontSize: '11px', color: '#9ca3af' }}>✓</span>;
                        }
                        if (roomType === 'group') {
                          const readCount = Object.entries(readStatuses)
                            .filter(([uid, rs]) => uid !== currentUserId && new Date(msg.created_at) <= new Date((rs.read_at || rs.last_read_at))).length;
                          const unread = Math.max(0, (members.length - 1) - readCount);
                          return unread > 0
                            ? <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, lineHeight: 1 }}>{unread}</span>
                            : <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700, letterSpacing: '-1px' }}>✓✓</span>;
                        }
                        return <span style={{ fontSize: '11px', color: '#9ca3af' }}>✓</span>;
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Image Lightbox (click background or ESC to close) ── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: '100%',
              objectFit: 'contain', borderRadius: '10px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white',
              width: '36px', height: '36px', borderRadius: '50%',
              fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Reply-to toast: shown when the original message is not in the current view */}
      {replyToast && (
        <div style={{
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.9)', color: '#fff', borderRadius: '20px',
          padding: '8px 18px', fontSize: '13px', fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          💬 {replyToastMsgRef.current}
        </div>
      )}
    </>
  );
}
