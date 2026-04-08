/**
 * HyperBabel React Demo — Unified Chat Hub Page
 *
 * Demonstrates the full HyperBabel messaging stack with
 * REAL-TIME message delivery (no polling):
 *
 * - United Chat API      : Room management, message CRUD, video call lifecycle
 * - HyperBabel Real-Time : Instant message push, typing indicators, call events
 * - Translation API      : Auto-translate messages into the reader's language
 * - Storage API          : File upload (3-step presign flow)
 * - Presence API         : Online/offline status heartbeat
 *
 * Real-time architecture overview:
 *   When a user sends a message via the REST API, HyperBabel broadcasts
 *   a 'message' event on the room's real-time channel. All channel
 *   subscribers receive the message immediately — no polling required.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// Sample_demos i18n convention: Korean if device language is Korean, otherwise English
const isKo = navigator.language?.startsWith('ko');
const t = (en, ko) => isKo ? ko : en;

import Header from '../components/Header';
import ChatMessageList from '../components/ChatMessageList';
import ChatInput from '../components/ChatInput';
import * as unitedChat from '../services/unitedChatService';
import * as chatService from '../services/chatService';
import * as storageService from '../services/storageService';
import * as presenceService from '../services/presenceService';
import realtimeService from '../services/realtimeService';

export default function ChatHubPage() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const user = JSON.parse(localStorage.getItem('hb_user') || '{}');

  // ── State ──
  const [rooms, setRooms] = useState([]);
  const [openRooms, setOpenRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [readStatuses, setReadStatuses] = useState({}); // { userId: { last_read_message_id, read_at } }
  const [members, setMembers] = useState([]);
  const [bans, setBans] = useState([]);
  const [memberPage, setMemberPage] = useState(0);
  const [memberSearch, setMemberSearch] = useState('');
  const [pendingMemberAction, setPendingMemberAction] = useState(null); // { type, userId, userName }
  const MEMBER_PAGE_SIZE = 50;

  const [typingText, setTypingText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ room_type: 'group', room_name: '', members: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [rtConnected, setRtConnected] = useState(false);
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [customRoomName, setCustomRoomName] = useState('');
  // ── Pin state ──
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [pinConfirm, setPinConfirm] = useState(null); // { msgId }
  const [isPinning, setIsPinning] = useState(false);
  // ── Location / Contact send modals ──
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationForm, setLocationForm] = useState({ name: '', address: '', latitude: '', longitude: '' });
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '' });
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  // Copy toast state
  const [copyToastMsgId, setCopyToastMsgId] = useState(null);
  const copyToastText = isKo ? '클립보드에 복사되었습니다' : 'Copied to clipboard';
  // ── Typing prefs state ──
  const [typingPrefs, setTypingPrefs] = useState({}); // { [userId]: { send, recv } }
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  // ── Mute state ──
  const [isMuted, setIsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState(null);
  const [isMuteLoading, setIsMuteLoading] = useState(false);
  // ── Block state ──
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [isBlockLoading, setIsBlockLoading] = useState(false);
  const [unblockTarget, setUnblockTarget] = useState(null); // { user_id, user_name } for custom modal
  // ── Block Management panel ──
  const [showBlockMgmt, setShowBlockMgmt] = useState(false);
  const [blockMgmtSearch, setBlockMgmtSearch] = useState('');
  const [blockMgmtPage, setBlockMgmtPage] = useState(1);
  const BLOCK_MGMT_PAGE_SIZE = 10;
  // ── Reply-to state ──
  // replyTo: the message being replied to (null when not replying)
  // replySnapshots: map of original message data for rendering quote boxes
  const [replyTo, setReplyTo] = useState(null);
  const [replySnapshots, setReplySnapshots] = useState({});
  const [replyToastVisible, setReplyToastVisible] = useState(false);
  // ── Group Video Call Modal state ──
  const [showGroupCallModal, setShowGroupCallModal] = useState(false);
  const [groupCallTargets, setGroupCallTargets] = useState([]);  // selected user_ids
  const [callMemberSearch, setCallMemberSearch] = useState('');
  const MAX_CALL_TARGETS = 4;
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const settingsRef = useRef(null);
  const [activeCallSession, setActiveCallSession] = useState(null); // Active video call session (null when no call is in progress)
  // ── Edit / Delete state ──
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  // C1: Open room member management state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  // If user has no DB row yet, default to BOTH enabled (fail-open) so typing works out-of-the-box
  const myTypingPrefs = typingPrefs[user?.user_id] ?? { send: true, recv: true };
  // ref: prevents stale closure in subscribeToTyping callback (myTypingPrefs changes after prefs load)
  const myTypingPrefsRef = useRef(myTypingPrefs);
  useEffect(() => { myTypingPrefsRef.current = myTypingPrefs; }, [myTypingPrefs.send, myTypingPrefs.recv]);
  // i18n helper for room settings (ko/en/es/hi based on preferred_lang_cd)
  const _lang = user?.preferred_lang_cd || 'en';
  const roomSettingsT = (key) => ({
    roomSettings:   { ko: '채팅방 설정',       en: 'Room Settings',             es: 'Configuración de sala',             hi: 'रूम सेटिंग्स' },
    markAllRead:    { ko: '모두 읽음 처리',     en: 'Mark All as Read',          es: 'Marcar todo como leído',           hi: 'सब पढ़ा हुआ मार्क करें' },
    typingIndicator:{ ko: '타이핑 인디케이터', en: 'Typing Indicator',           es: 'Indicador de escritura',           hi: 'टाइ핑 संकेतक' },
    send:           { ko: '📤 발신',            en: '📤 Send',                    es: '📤 Enviar',               hi: '📤 भेजें' },
    sendDesc:       { ko: '타이핑 시 상대방에게 알림', en: 'Notify others when you type',    es: 'Notificar a otros cuando escribas', hi: 'टाइप करते समय अन्यों को सूचित करें' },
    recv:           { ko: '📥 수신',            en: '📥 Receive',                 es: '📥 Recibir',              hi: '📥 प्राप्त करें' },
    recvDesc:       { ko: '상대방 타이핑 알림 표시', en: 'Show when others are typing',    es: 'Mostrar cuando otros escriban',   hi: 'जब अन्य टाइप कर रहे हों तो दिखाएं' },
    footer:         { ko: '이 채팅방에만 적용됩니다', en: 'Settings apply to this room only', es: 'La configuración aplica solo a esta sala', hi: 'सेटिंग्स केवल इस रूम पर लागू होती हैं' },
  })[key]?.[isKo ? 'ko' : 'en'] || ({ roomSettings:'Room Settings', markAllRead:'Mark All as Read', typingIndicator:'Typing Indicator', send:'📤 Send', sendDesc:'Notify others when you type', recv:'📥 Receive', recvDesc:'Show when others are typing', footer:'Settings apply to this room only' })[key] || key;
  // Cached online status of the 1:1 counterpart (fetched on room entry)
  const [counterpartOnline, setCounterpartOnline] = useState(false);
  // ── Pin handlers ─────────────────────────────────────────────────
  const myRole = members.find(m => m.user_id === user.user_id)?.role || 'member';
  const canPin = myRole === 'owner' || myRole === 'sub_admin' || (activeRoom?.room_type === '1to1');
  const isAdmin = myRole === 'owner' || myRole === 'sub_admin';
  const pinnedMsg = activeRoom?.pinned_message_id ? messages.find(m => m.id === activeRoom.pinned_message_id) : null;

  // Rich JSX for pinned message banner (thumbnail for images, icon+filename for files)
  const pinnedBannerContent = (msg) => {
    if (!msg) return null;
    const fileName = msg.metadata?.file?.original_name || msg.metadata?.filename;
    const fileUrl  = msg.metadata?.file?.url || msg.metadata?.url;
    switch (msg.message_type) {
      case 'image':
        return (
          <span style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
            {fileUrl
              ? <img src={fileUrl} alt={fileName || 'Image'}
                  style={{ height:'24px', width:'24px', objectFit:'cover', borderRadius:'4px', flexShrink:0, border:'1px solid #fde68a' }} />
              : <span style={{ flexShrink:0 }}>🖼️</span>}
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500, color:'#92400e' }}>
              {fileName || 'Image'}
            </span>
          </span>
        );
      case 'video':
        return <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span>🎬</span><span style={{ fontWeight:500, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fileName || 'Video'}</span></span>;
      case 'audio':
        return <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span>🎵</span><span style={{ fontWeight:500, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fileName || 'Audio'}</span></span>;
      case 'file':
        return <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span>📎</span><span style={{ fontWeight:500, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fileName || 'File'}</span></span>;
      case 'location':
        return <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span>📍</span><span style={{ fontWeight:500, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.metadata?.name || 'Location'}</span></span>;
      case 'contact':
        return <span style={{ display:'flex', alignItems:'center', gap:'6px' }}><span>👤</span><span style={{ fontWeight:500, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{msg.metadata?.name || 'Contact'}</span></span>;
      default: {
        const c = msg.content;
        const text = c && typeof c === 'object' ? (c[isKo ? 'ko' : 'en'] || c['en'] || Object.values(c)[0] || '') : (c || '');
        return <span style={{ fontWeight:500, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{text}</span>;
      }
    }
  };

  const doPinMessage = async (msgId) => {
    if (!activeRoom) return;
    setIsPinning(true);
    try {
      await unitedChat.pinMessage(activeRoom.id, msgId, user.user_id);
      setActiveRoom(prev => ({ ...prev, pinned_message_id: msgId }));
    } catch (err) { console.error('Pin failed:', err); }
    setIsPinning(false);
    setPinConfirm(null);
  };

  // Load mute status and block list when active room changes
  useEffect(() => {
    if (!activeRoom?.id || !user?.user_id) return;
    // Mute status
    unitedChat.getMuteStatus(activeRoom.id, user.user_id)
      .then(res => {
        const isActive = res.is_muted && (res.muted_until === null || new Date(res.muted_until) > new Date());
        setIsMuted(isActive);
        setMutedUntil(res.muted_until || null);
      })
      .catch(() => { setIsMuted(false); setMutedUntil(null); });
    // Block list
    unitedChat.getBlockList(user.user_id)
      .then(res => setBlockedUsers(res.blocked_users || []))
      .catch(() => setBlockedUsers([]));
  }, [activeRoom?.id, user?.user_id]);

  // Toggle mute (durationMinutes=null for indefinite, undefined to unmute)
  const handleToggleMute = async (durationMinutes) => {
    if (!activeRoom?.id || !user?.user_id || isMuteLoading) return;
    setIsMuteLoading(true);
    try {
      if (isMuted) {
        await unitedChat.unmuteRoom(activeRoom.id, user.user_id);
        setIsMuted(false); setMutedUntil(null);
      } else {
        const res = await unitedChat.muteRoom(activeRoom.id, user.user_id, durationMinutes ?? undefined);
        setIsMuted(true); setMutedUntil(res.muted_until || null);
      }
    } catch { /* non-fatal */ } finally { setIsMuteLoading(false); }
  };

  const handleBlockUser = async (targetUserId) => {
    if (!targetUserId || isBlockLoading) return;
    setIsBlockLoading(true);
    try {
      await unitedChat.blockUser(user.user_id, targetUserId);
      setBlockedUsers(prev => [...prev.filter(u => u.blocked_id !== targetUserId), { blocked_id: targetUserId, created_at: new Date().toISOString() }]);
    } catch { /* non-fatal */ } finally { setIsBlockLoading(false); }
  };

  const handleUnblockUser = async (targetUserId) => {
    if (!targetUserId || isBlockLoading) return;
    setIsBlockLoading(true);
    try {
      await unitedChat.unblockUser(user.user_id, targetUserId);
      setBlockedUsers(prev => prev.filter(u => u.blocked_id !== targetUserId));
      setUnblockTarget(null);
    } catch { /* non-fatal */ } finally { setIsBlockLoading(false); }
  };

  // ── Edit / Delete message handlers ──
  const handleEditMessage = async (action, msgId, newContent) => {
    if (action === 'start') {
      setEditingMsgId(msgId);
      setEditingContent(newContent);
      return;
    }
    if (action === 'cancel') {
      setEditingMsgId(null);
      return;
    }
    // action === 'save'
    if (!newContent?.trim() || !msgId) return;
    // Optimistic update
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, content: newContent, edited_at: new Date().toISOString() } : m
    ));
    setEditingMsgId(null);
    try {
      await unitedChat.editMessage(activeRoom.id, msgId, user.user_id, newContent);
    } catch (err) {
      console.error('Edit failed:', err);
    }
  };

  const handleDeleteMessage = async (msgId) => {
    // Optimistic update
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, deleted_at: new Date().toISOString() } : m
    ));
    setDeleteConfirmId(null);
    try {
      await unitedChat.deleteMessage(activeRoom.id, msgId, user.user_id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handlePinMessage = (msgId) => {
    if (!canPin || isPinning) return;
    if (activeRoom?.pinned_message_id && activeRoom.pinned_message_id !== msgId) {
      setPinConfirm({ msgId }); return;
    }
    if (activeRoom?.pinned_message_id === msgId) return;
    doPinMessage(msgId);
  };

  const handleUnpinMessage = async () => {
    if (!activeRoom || !canPin) return;
    try {
      await unitedChat.unpinMessage(activeRoom.id, user.user_id);
      setActiveRoom(prev => ({ ...prev, pinned_message_id: null }));
    } catch (err) { console.error('Unpin failed:', err); }
  };

  // Refs to hold cleanup functions for real-time subscriptions
  const unsubRoomRef = useRef(null);
  const unsubTypingRef = useRef(null);
  const unsubPrivateRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const readStatusRefreshTimer = useRef(null);

  // Lightweight re-fetch of readStatuses from API (backup for HyperBabel Real-Time read_receipt events)
  const refreshReadStatuses = () => {
    if (!activeRoom?.id) return;
    if (readStatusRefreshTimer.current) clearTimeout(readStatusRefreshTimer.current);
    readStatusRefreshTimer.current = setTimeout(async () => {
      try {
        const res = await unitedChat.getMessages(activeRoom.id, { limit: 1 });
        const data = res.data || res;
        if (data.read_statuses?.length) {
          const map = {};
          data.read_statuses.forEach(rs => {
            map[rs.user_id] = {
              last_read_message_id: rs.last_read_message_id,
              read_at: rs.last_read_at || rs.read_at || new Date().toISOString(),
            };
          });
          setReadStatuses(map);
        }
      } catch { /* non-critical */ }
    }, 3000);
  };

  // ── Init ──────────────────────────────────────────────────────────────


  useEffect(() => {
    if (!user.user_id) { navigate('/login'); return; }

    loadRooms();

    // Start presence heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      presenceService.heartbeat(user.user_id, 'web').catch(() => {});
    }, 30000);
    presenceService.heartbeat(user.user_id, 'web').catch(() => {});

    // Initialise the HyperBabel Real-Time connection
    // Token is issued by the HyperBabel /rtm/token endpoint
    realtimeService
      .init(user.user_id, user.display_name, user.preferred_lang_cd)
      .then(async (channelService) => {
        setRtConnected(true);

        // Subscribe to private events (incoming call invitations, etc.)
        unsubPrivateRef.current?.();
        unsubPrivateRef.current = channelService.subscribeToPrivate(
          user.user_id,
          handlePrivateEvent
        );

        // Store channelService in a ref for room subscriptions
        window.__hbRt = channelService;
      })
      .catch((err) => {
        console.warn('Real-time connection unavailable, falling back to polling:', err.message);
        // Graceful degradation — fall back to 5-second polling
        const poll = setInterval(() => {
          if (activeRoom) loadMessages(activeRoom.id);
        }, 5000);
        return () => clearInterval(poll);
      });

    return () => {
      clearInterval(heartbeat);
      unsubRoomRef.current?.();
      unsubTypingRef.current?.();
      unsubPrivateRef.current?.();
      realtimeService.disconnect();
    };
  }, []);

  // ── Subscribe to the active room when it changes ──
  useEffect(() => {
    if (roomId) loadRoom(roomId);
  }, [roomId]);

  // ── Room Data ──────────────────────────────────────────────────────────

  const loadRooms = async () => {
    try {
      const data = await unitedChat.listRooms(user.user_id);
      setRooms(data.rooms || []);
      setOpenRooms(data.open_rooms || []);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  };

  const loadMessages = async (id) => {
    try {
      const data = await unitedChat.getMessages(id, { limit: 50 });
      setMessages(data.messages || data || []);
      // Merge reply snapshots from the API response for rendering reply quote boxes
      if (data.reply_snapshots && Object.keys(data.reply_snapshots).length > 0) {
        setReplySnapshots(prev => ({ ...prev, ...data.reply_snapshots }));
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const loadRoom = async (id) => {
    try {
      const [roomData, msgData, memberData] = await Promise.all([
        unitedChat.getRoom(id),
        unitedChat.getMessages(id, { limit: 50 }),
        unitedChat.getMembers(id),
      ]);

      const room = roomData.room || roomData;
      setActiveRoom(room);
      const messageList = msgData.messages || msgData || [];
      setMessages(messageList);
      // Populate initial read statuses
      if (msgData.read_statuses?.length) {
        const map = {};
        msgData.read_statuses.forEach(rs => {
          map[rs.user_id] = {
            last_read_message_id: rs.last_read_message_id,
            // Backend returns DB column 'last_read_at'; normalize to 'read_at'
            read_at: rs.last_read_at || rs.read_at || new Date().toISOString(),
          };
        });
        setReadStatuses(map);
      }
      // Merge reply snapshots (original message data for reply quote boxes)
      if (msgData.reply_snapshots && Object.keys(msgData.reply_snapshots).length > 0) {
        setReplySnapshots(prev => ({ ...prev, ...msgData.reply_snapshots }));
      }
      setMembers(memberData.members || memberData || []);

      unitedChat.markAsRead(id, user.user_id).catch(() => {});

      // Fetch typing prefs for this room
      unitedChat.getTypingPrefs(id)
        .then(res => {
          const map = {};
          (res.data?.prefs || []).forEach(p => {
            map[p.user_id] = { send: p.send_enabled, recv: p.recv_enabled };
          });
          setTypingPrefs(map);
        })
        .catch(() => {});

      // Immediately update presence to 'online' on room entry (avoids appearing offline until next heartbeat)
      presenceService.updateStatus(user.user_id, 'online').catch(() => {});

      // For 1:1 rooms: check if the counterpart is currently online
      if (room.room_type === '1to1') {
        const otherId = (room.members || []).find(m => m.user_id !== user.user_id)?.user_id;
        if (otherId) {
          presenceService.getPresence([otherId])
            .then(res => {
              const p = (res.data?.presence || []).find(x => x.user_id === otherId);
              setCounterpartOnline(p?.status === 'online' || p?.status === 'away');
            })
            .catch(() => setCounterpartOnline(false));
        } else {
          setCounterpartOnline(false); // self-chat — no counterpart
        }
      } else {
        setCounterpartOnline(true); // group rooms: backend handles presence check per-publish
      }

      // Unsubscribe from previous room channels
      unsubRoomRef.current?.();
      unsubTypingRef.current?.();

      // Subscribe to the new room's real-time channel
      if (window.__hbRt) {
        // New messages arrive instantly via HyperBabel Real-Time
        unsubRoomRef.current = window.__hbRt.subscribeToRoom(id, (event) => {
          const { message, type } = event;

          // read_receipt: HyperBabel Real-Time event type = 'read_receipt', payload = { type, data:{ user_id, read_at } }
          if (type === 'read_receipt') {
            const rs = message?.data;   // publishMessageEvent wraps as { type, data:{...} }
            if (rs?.user_id && rs.user_id !== user.user_id) {
              setReadStatuses(prev => ({
                ...prev,
                [rs.user_id]: { last_read_message_id: rs.last_read_message_id ?? null, read_at: rs.read_at ?? new Date().toISOString() },
              }));
            }
            return;
          }

          // Typing event: backend sends via publishToChannel with eventName 'message'
          // and payload { type: 'typing', userId, userName }
          if (type === 'message' && message?.type === 'typing') {
            const { userId: typingUserId, userName } = message;
            if (typingUserId && typingUserId !== user.user_id && myTypingPrefsRef.current.recv) {
              setTypingText(`${userName || typingUserId} is typing...`);
              clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setTypingText(''), 3000);
            }
            return;
          }

          // call_started / call_ended: update the active call banner in real time
          if (type === 'call_started' || (type === 'message' && message?.type === 'call_started')) {
            const payload = message?.data || message;
            if (payload?.session) setActiveCallSession(payload.session);
            return;
          }
          if (type === 'call_ended' || (type === 'message' && message?.type === 'call_ended')) {
            setActiveCallSession(null);
            return;
          }

          // message.updated / message.deleted: apply edit/delete in real time
          if (type === 'message.updated' || (type === 'message' && message?.type === 'message.updated')) {
            const payload = message?.data || message;
            if (payload?.message_id) {
              setMessages(prev => prev.map(m =>
                m.id === payload.message_id ? { ...m, content: payload.content, edited_at: payload.edited_at } : m
              ));
            }
            return;
          }
          if (type === 'message.deleted' || (type === 'message' && message?.type === 'message.deleted')) {
            const payload = message?.data || message;
            if (payload?.message_id) {
              setMessages(prev => prev.map(m =>
                m.id === payload.message_id ? { ...m, deleted_at: new Date().toISOString() } : m
              ));
              if (activeRoom?.pinned_message_id === payload.message_id) {
                setActiveRoom(prev => ({ ...prev, pinned_message_id: null }));
              }
            }
            return;
          }

          // Regular chat message: HyperBabel Real-Time event type = 'message', payload is the message object
          const chatMsg = (type === 'message' && message?.data) ? message.data   // publishMessageEvent path: { type:'message', data:{...} }
                        : (message?.id ? message : null);                         // legacy direct path
          if (!chatMsg?.id || !chatMsg?.created_at) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === chatMsg.id)) return prev;
            // For reply messages: auto-generate snapshot from local messages if available.
            // This ensures the quote box renders immediately even before the next API fetch.
            if (chatMsg.reply_to) {
              const origMsg = prev.find(m => m.id === chatMsg.reply_to);
              if (origMsg) {
                setReplySnapshots(p => ({
                  ...p,
                  [origMsg.id]: {
                    id: origMsg.id,
                    sender_id: origMsg.sender_id,
                    sender_name: origMsg.sender_name || origMsg.sender_id,
                    content: origMsg.content,
                    message_type: origMsg.message_type,
                    metadata: origMsg.metadata,
                    deleted_at: origMsg.deleted_at || null,
                    translated_content: origMsg.translated_content,
                  }
                }));
              }
            }
            return [...prev, chatMsg];
          });

          // Auto mark-as-read when receiving a message from another user while in the room
          if (chatMsg.sender_id !== user.user_id) {
            unitedChat.markAsRead(id, user.user_id).catch(() => {});
          }

          // Auto-translate incoming messages
          if (chatMsg.sender_id !== user.user_id && user.preferred_lang_cd) {
            unitedChat
              .batchTranslateMessages(id, [chatMsg.id], user.preferred_lang_cd)
              .then((translated) => {
                if (Array.isArray(translated) && translated.length > 0) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === translated[0].id
                        ? { ...m, translated_content: translated[0].translated_content }
                        : m
                    )
                  );
                }
              })
              .catch(() => {});
          }
        });

        // subscribeToTyping removed: backend publishes typing to main room channel,
        // so it is now handled inside the subscribeToRoom callback above.
        unsubTypingRef.current = () => {};
      }

      // Batch-translate existing messages on load
      if (messageList.length > 0 && user.preferred_lang_cd) {
        const othersIds = messageList
          .filter((m) => m.sender_id !== user.user_id && m.message_type === 'text')
          .map((m) => m.id);

        if (othersIds.length > 0) {
          unitedChat
            .batchTranslateMessages(id, othersIds, user.preferred_lang_cd)
            .then((translated) => {
              if (!Array.isArray(translated)) return;
              setMessages((prev) =>
                prev.map((msg) => {
                  const t = translated.find((tr) => tr.id === msg.id);
                  return t ? { ...msg, translated_content: t.translated_content } : msg;
                })
              );
            })
            .catch(() => {});
        }
      }
      // After room load: check for an active video call session (one-time)
      if (id) {
        try {
          const activeCR = await unitedChat.getActiveVideoCall(id);
          const sess = activeCR?.session || activeCR;
          setActiveCallSession(sess?.id && sess.status === 'active' ? sess : null);
        } catch {
          setActiveCallSession(null);
        }
      }
    } catch (err) {
      console.error('Failed to load room:', err);
    }
  };

  /**
   * Handle private channel events (e.g., incoming video call invitation).
   */
  const handlePrivateEvent = ({ event, data }) => {
    if (event === 'video_call.started') {
      // Optionally notify the user of an incoming call here
      console.info('Incoming call in room:', data.room_id);
    }
  };

  // ── Message Actions ────────────────────────────────────────────────────

  const handleSendMessage = async (content) => {
    if (!activeRoom) return;
    const optId = `opt-${Date.now()}`;
    // Include reply_to field if user is replying to a specific message.
    // The API validates this as a UUID reference to an existing message.
    const retryPayload = {
      sender_id: user.user_id,
      content,
      message_type: 'text',
      ...(replyTo ? { reply_to: replyTo.id } : {}),
    };
    // Pre-populate the reply snapshot so the quote box renders immediately (optimistic UI)
    if (replyTo) {
      setReplySnapshots(prev => ({
        ...prev,
        [replyTo.id]: {
          id: replyTo.id,
          sender_id: replyTo.sender_id,
          sender_name: replyTo.sender_name || replyTo.sender_id,
          content: replyTo.content,
          message_type: replyTo.message_type,
          metadata: replyTo.metadata,
          deleted_at: replyTo.deleted_at || null,
          translated_content: replyTo.translated_content,
        }
      }));
    }
    const optMsg = {
      id: optId,
      sender_id: user.user_id,
      sender_name: user.display_name || user.user_id,
      content,
      message_type: 'text',
      created_at: new Date().toISOString(),
      reply_to: replyTo?.id,
      sendStatus: 'sending',
      _retryPayload: retryPayload,
    };
    setReplyTo(null);  // Clear reply state after capturing in payload
    setMessages(prev => [...prev, optMsg]);
    try {
      await unitedChat.sendMessage(activeRoom.id, retryPayload);
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, sendStatus: 'sent' } : m));
      refreshReadStatuses();
    } catch (err) {
      console.error('Send failed:', err);
      // Keep failed message — user can retry/cancel
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, sendStatus: 'failed' } : m));
    }
  };

  // ── Room name editing ─────────────────────────────────────────────────
  const handleSaveRoomName = async () => {
    if (!activeRoom || !customRoomName.trim()) return;
    try {
      await unitedChat.updateRoomName(activeRoom.id, user.user_id, customRoomName.trim());
      // Update local state so the header reflects the new name immediately
      setActiveRoom(prev => ({ ...prev, room_name: customRoomName.trim() }));
      setRooms(prev => prev.map(r => r.id === activeRoom.id ? { ...r, room_name: customRoomName.trim() } : r));
      setEditingRoomName(false);
    } catch (err) {
      console.error('Failed to update room name:', err);
    }
  };

  const handleTyping = async (isTypingNow) => {
    if (!activeRoom) return;
    const isSelfChat = activeRoom.room_type === '1to1' && (activeRoom.members?.length ?? 0) === 1;
    if (isSelfChat) return;                        // self-chat room — no counterpart, publish unnecessary
    // For 1:1 rooms: skip publish if counterpart is offline (reduces API cost)
    if (activeRoom.room_type === '1to1' && !counterpartOnline) return;
    const isSmallGroup = activeRoom.room_type === 'group' && (activeRoom.members?.length ?? 0) <= 4;
    if (activeRoom.room_type !== '1to1' && !isSmallGroup) return;
    if (!myTypingPrefs.send) return; // send_enabled off
    try {
      await unitedChat.sendTypingIndicator(
        activeRoom.id,
        user.user_id,
        user.display_name || user.user_id
      );
    } catch { /* Non-critical */ }
  };

  const saveTypingPrefs = async (send, recv) => {
    if (!activeRoom || !user?.user_id) return;
    setSavingPrefs(true);
    try {
      await unitedChat.updateTypingPrefs(activeRoom.id, user.user_id, send, recv);
      setTypingPrefs(prev => ({ ...prev, [user.user_id]: { send, recv } }));
    } catch (e) { console.error('Failed to save typing prefs', e); }
    finally { setSavingPrefs(false); }
  };

  // Send a location message
  const handleSendLocation = async () => {
    if (!activeRoom || !locationForm.name.trim()) return;
    const optId = `opt-loc-${Date.now()}`;
    const payload = {
      sender_id: user.user_id,
      content: `📍 ${locationForm.name.trim()}`,
      message_type: 'location',
      metadata: { name: locationForm.name.trim(), address: locationForm.address.trim()||null, latitude: locationForm.latitude?Number(locationForm.latitude):null, longitude: locationForm.longitude?Number(locationForm.longitude):null },
    };
    const newMsg = {
      id: optId,
      sender_id: user.user_id,
      sender_name: user.display_name || user.user_id,
      content: payload.content,
      message_type: 'location',
      metadata: payload.metadata,
      created_at: new Date().toISOString(),
      sendStatus: 'sending',
      _retryPayload: payload,
    };
    setMessages(prev => [...prev, newMsg]);
    setShowLocationModal(false);
    setShowPlusMenu(false);
    setLocationForm({ name: '', address: '', latitude: '', longitude: '' });
    try {
      await unitedChat.sendMessage(activeRoom.id, payload);
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, sendStatus: 'sent' } : m));
      refreshReadStatuses();
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, sendStatus: 'failed' } : m));
    }
  };

  // Send a contact card message
  const handleSendContact = async () => {
    if (!activeRoom || !contactForm.name.trim()) return;
    const optId = `opt-con-${Date.now()}`;
    const payload = {
      sender_id: user.user_id,
      content: `👤 ${contactForm.name.trim()}`,
      message_type: 'contact',
      metadata: { name: contactForm.name.trim(), phone: contactForm.phone.trim()||null, email: contactForm.email.trim()||null },
    };
    const newMsg = {
      id: optId,
      sender_id: user.user_id,
      sender_name: user.display_name || user.user_id,
      content: payload.content,
      message_type: 'contact',
      metadata: payload.metadata,
      created_at: new Date().toISOString(),
      sendStatus: 'sending',
      _retryPayload: payload,
    };
    setMessages(prev => [...prev, newMsg]);
    setShowContactModal(false);
    setShowPlusMenu(false);
    setContactForm({ name: '', phone: '', email: '' });
    try {
      await unitedChat.sendMessage(activeRoom.id, payload);
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, sendStatus: 'sent' } : m));
      refreshReadStatuses();
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, sendStatus: 'failed' } : m));
    }
  };

  // Retry a failed message
  const handleRetry = async (msg) => {
    if (!msg._retryPayload || !activeRoom) return;
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, sendStatus: 'sending' } : m));
    try {
      await unitedChat.sendMessage(activeRoom.id, msg._retryPayload);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, sendStatus: 'sent' } : m));
      refreshReadStatuses();
    } catch {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, sendStatus: 'failed' } : m));
    }
  };

  // Cancel a failed send
  const handleCancelSend = (msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleFileUpload = async (file) => {
    if (!activeRoom) return;
    try {
      const meta = await storageService.uploadFile(file, activeRoom.id);
      await unitedChat.sendMessage(activeRoom.id, {
        sender_id: user.user_id,
        content: `📎 ${file.name}`,
        message_type: file.type.startsWith('image/') ? 'image' : 'file',
        metadata: { url: meta.url, filename: file.name, size: file.size, mimeType: file.type },
      });
    } catch (err) {
      alert(`File upload failed: ${err.message}`);
    }
  };

  // ── Video Call: check for an existing active session before starting a new one ─

  const handleStartVideoCall = async () => {
    if (!activeRoom) return;

    // For group rooms: check if a call is already in progress
    if (activeRoom.room_type === 'group') {
      try {
        const existing = await unitedChat.getActiveVideoCall(activeRoom.id);
        const activeSession = existing?.session || existing;

        if (activeSession?.id && activeSession.status === 'active') {
          // Gap 2: check if I am an invited participant
          const amParticipant = (activeSession.participants || [])
            .some((p) => p.user_id === user.user_id);

          if (!amParticipant) {
            // Non-invited member: button should already be disabled, but guard here too
            return;
          }

          const activeParticipants = (activeSession.participants || [])
            .filter((p) => p.status === 'active');

          if (activeParticipants.length >= 2) {
            // Call in progress with 2+ active participants — offer rejoin
            navigate(`/video-call/${activeRoom.id}`, {
              state: {
                session: activeSession,
                roomType: activeRoom.room_type,
                roomName: activeRoom.room_name || activeRoom.display_name,
                rejoin: true,
              },
            });
            return;
          }
          // < 2 active: session about to auto-end → fall through to start new call
        }
      } catch {
        // 404 or error: no active call, proceed to start
      }

      // Group room: open member selection modal (Gap 1 fix)
      setGroupCallTargets([]);
      setCallMemberSearch('');
      setShowGroupCallModal(true);
      return;
    }

    // 1:1 room: start immediately
    try {
      const result = await unitedChat.startVideoCall(activeRoom.id, user.user_id);
      navigate(`/video-call/${activeRoom.id}`, {
        state: {
          session: result.session || result,
          roomType: activeRoom.room_type,
          roomName: activeRoom.room_name || activeRoom.display_name,
          rejoin: false,
        },
      });
    } catch (err) {
      alert(`Failed to start video call: ${err.message}`);
    }
  };

  // Confirm group call after member selection
  const confirmGroupCall = async () => {
    if (groupCallTargets.length === 0 || !activeRoom) return;
    setShowGroupCallModal(false);
    try {
      const result = await unitedChat.startVideoCall(
        activeRoom.id,
        user.user_id,
        groupCallTargets  // target_user_ids (Gap 1 fix)
      );
      navigate(`/video-call/${activeRoom.id}`, {
        state: {
          session: result.session || result,
          roomType: 'group',
          roomName: activeRoom.room_name || activeRoom.display_name,
          rejoin: false,
        },
      });
    } catch (err) {
      alert(`Failed to start group call: ${err.message}`);
    }
  };


  // ── Room Helpers ───────────────────────────────────────────────────────

  const handleCreateRoom = async () => {
    try {
      const payload = {
        room_type: newRoom.room_type,
        creator_id: user.user_id,
      };
      if (newRoom.room_type !== '1to1' && newRoom.room_name.trim()) {
        payload.room_name = newRoom.room_name.trim();
      }
      if (newRoom.members.trim()) {
        payload.members = newRoom.members.split(',').map((m) => m.trim()).filter(Boolean);
      }
      const result = await unitedChat.createRoom(payload);
      setShowCreateModal(false);
      setNewRoom({ room_type: 'group', room_name: '', members: '' });
      await loadRooms();
      const newId = result.room?.id || result.id;
      if (newId) navigate(`/chat/${newId}`);
    } catch (err) {
      alert(`Failed to create room: ${err.message}`);
    }
  };

  const handleJoinOpenRoom = async (openRoomId) => {
    try {
      await unitedChat.joinRoom(openRoomId, user.user_id, user.display_name || user.user_id);
      await loadRooms();
      navigate(`/chat/${openRoomId}`);
    } catch (err) {
      alert(`Failed to join room: ${err.message}`);
    }
  };

  // C1: Load bans for open rooms
  const loadBans = async (roomId) => {
    try {
      const res = await unitedChat.getBans(roomId);
      setBans(res.data?.bans || []);
    } catch { /* non-critical */ }
  };

  const getRoomTypeIcon = (type) =>
    ({ '1to1': '👤', group: '👥', open: '🌐' }[type] || '💬');

  // Self-chat: a 1:1 room where the only member is the creator themselves
  const isSelfChatRoom = (room) =>
    room?.room_type === '1to1' && (room?.members?.length ?? 0) <= 1;

  // Display name for a room (returns 'Me' / language-localised equivalent for self-chat)
  const getRoomDisplayName = (room) => {
    if (!room) return 'Chat';
    if (isSelfChatRoom(room)) return navigator.language.startsWith('ko') ? '나에게' : 'Me';
    return room.room_name || room.display_name || room.id?.slice(0, 8) || 'Chat';
  };

  // Click-outside: close the settings dropdown
  useEffect(() => {
    if (!showSettingsDropdown) return;
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettingsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsDropdown]);

  // Create a self-chat room (1:1 room with no additional members)
  const handleCreateSelfChat = async () => {
    try {
      const result = await unitedChat.createRoom({
        room_type: '1to1',
        creator_id: user.user_id,
        // Omitting 'members' signals the server to treat this as a self-chat room
      });
      const newId = result.room?.id || result.id;
      if (newId) {
        await loadRooms();
        navigate(`/chat/${newId}`);
      }
    } catch (err) {
      alert(`Failed to create Me room: ${err.message}`);
    }
  };

  return (
    <>
      <Header />
      <div className="chat-layout">
        {/* ══════════ SIDEBAR ══════════ */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-header">
            <div>
              <h2 className="chat-sidebar-title">💬 Chat Hub</h2>
              {rtConnected && (
                <span style={{ fontSize: '0.7rem', color: 'var(--hb-accent-alt)' }}>
                  ● Live
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn btn-secondary btn-sm"
                title={navigator.language.startsWith('ko') ? '나만의 메모방' : 'My Notes (Self Chat)'}
                onClick={handleCreateSelfChat}
                style={{ fontSize: '16px', padding: '4px 8px' }}
              >📝</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
                + New
              </button>
            </div>
          </div>

          <div style={{ padding: '8px 12px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            />
          </div>

          <div className="chat-room-list">
            {rooms
              .filter((r) => {
                if (!searchQuery) return true;
                const name = r.room_name || r.display_name || '';
                return name.toLowerCase().includes(searchQuery.toLowerCase());
              })
              .map((room) => (
                <div
                  key={room.id}
                  className={`chat-room-item ${activeRoom?.id === room.id ? 'active' : ''}`}
                  onClick={() => navigate(`/chat/${room.id}`)}
                >
                  <div className="avatar" style={isSelfChatRoom(room) ? { background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' } : {}}
                  >{isSelfChatRoom(room) ? '🙋' : getRoomTypeIcon(room.room_type)}</div>
                  <div className="chat-room-info">
                    <div className="chat-room-name">
                      {getRoomDisplayName(room)}
                      {isSelfChatRoom(room) && (
                        <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: '#ede9fe', color: '#7c3aed', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>Me</span>
                      )}
                    </div>
                    <div className="chat-room-preview">
                      {(() => {
                        const raw = room.last_message?.content;
                        const text = raw && typeof raw === 'object'
                          ? (raw[isKo ? 'ko' : 'en'] || raw['en'] || Object.values(raw)[0])
                          : raw;
                        return text || (isSelfChatRoom(room)
                          ? (isKo ? '📝나만의 메모방' : '📝 My Notes')
                          : 'No messages yet');
                      })()}
                    </div>
                  </div>
                  <div className="chat-room-meta">
                    <span className="badge badge-primary" style={{ fontSize: '0.6rem', ...(isSelfChatRoom(room) ? { background: '#ede9fe', color: '#7c3aed' } : {}) }}>
                      {isSelfChatRoom(room) ? 'me' : room.room_type}
                    </span>
                    {room.unread_count > 0 && (
                      <span className="unread-badge">{room.unread_count}</span>
                    )}
                  </div>
                </div>
              ))}

            {openRooms.length > 0 && (
              <>
                <div style={{ padding: '12px 16px 4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--hb-text-dim)', textTransform: 'uppercase' }}>
                  Open Rooms
                </div>
                {openRooms.map((room) => (
                  <div key={room.id} className="chat-room-item" onClick={() => handleJoinOpenRoom(room.id)}>
                    <div className="avatar" style={{ background: 'linear-gradient(135deg, var(--hb-accent-alt), var(--hb-accent))' }}>
                      🌐
                    </div>
                    <div className="chat-room-info">
                      <div className="chat-room-name">{room.room_name}</div>
                      <div className="chat-room-preview">
                        {room.description_translated || room.description
                          ? (room.description_translated || room.description).slice(0, 50) + ((room.description_translated || room.description).length > 50 ? '…' : '')
                          : `Click to join • ${room.member_count || 0} members`
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {rooms.length === 0 && openRooms.length === 0 && (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-state-icon">💬</div>
                <div className="empty-state-title">No rooms yet</div>
                <div className="empty-state-desc">Create your first chat room!</div>
              </div>
            )}
          </div>

          {/* ── Block Management sidebar button ── */}
          <div style={{ padding: '8px 12px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 'auto' }}>
            <button
              onClick={() => {
                setShowBlockMgmt(true);
                setBlockMgmtSearch('');
                setBlockMgmtPage(1);
              }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: showBlockMgmt ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: showBlockMgmt ? '#f87171' : 'var(--hb-text-dim)',
                fontSize: '13px', fontWeight: 500, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!showBlockMgmt) { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='var(--hb-text)'; }}}
              onMouseLeave={e => { if (!showBlockMgmt) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--hb-text-dim)'; }}}
            >
              <span style={{ fontSize: '15px', flexShrink: 0 }}>🚫</span>
              <span>{isKo ? '차단 관리' : 'Block Management'}</span>
              {blockedUsers.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px', background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>
                  {blockedUsers.length}
                </span>
              )}
            </button>
          </div>

          {/* ── Block Management sidebar button ── */}
          <div style={{ padding: '8px 12px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 'auto' }}>
            <button
              onClick={() => {
                setShowBlockMgmt(true);
                setBlockMgmtSearch('');
                setBlockMgmtPage(1);
              }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                background: showBlockMgmt ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: showBlockMgmt ? '#f87171' : 'var(--hb-text-dim)',
                fontSize: '13px', fontWeight: 500, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!showBlockMgmt) { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color='var(--hb-text)'; }}}
              onMouseLeave={e => { if (!showBlockMgmt) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--hb-text-dim)'; }}}
            >
              <span style={{ fontSize: '15px', flexShrink: 0 }}>🚫</span>
              <span>{isKo ? '차단 관리' : 'Block Management'}</span>
              {blockedUsers.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '12px', background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>
                  {blockedUsers.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ══════════ MAIN AREA ══════════ */}
        <div className="chat-main">
          {showBlockMgmt ? (
            /* ══ Block Management Panel ══ */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--hb-bg)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--hb-border)', flexShrink: 0 }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                  🚫
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--hb-text)' }}>
                    {isKo ? '차단 관리' : 'Block Management'}
                  </h2>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--hb-text-dim)', marginTop: '2px' }}>
                    {isKo ? '전역 차단된 사용자 목록. 해제하면 모든 채팅방에 즉시 반영됩니다.' : 'Globally blocked users. Unblocking takes effect across all rooms immediately.'}
                  </p>
                </div>
                {blockedUsers.length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239,68,68,0.12)', color: '#f87171', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
                    👤 {blockedUsers.length}
                  </span>
                )}
                <button
                  onClick={() => setShowBlockMgmt(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hb-text-dim)', fontSize: '18px', padding: '4px', lineHeight: 1 }}
                >✕</button>
              </div>

              {/* Search */}
              <div style={{ padding: '12px 20px 8px', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--hb-text-dim)', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
                  <input
                    type="text"
                    value={blockMgmtSearch}
                    onChange={e => { setBlockMgmtSearch(e.target.value); setBlockMgmtPage(1); }}
                    placeholder={isKo ? '이름 또는 ID 검색...' : 'Search by name or ID...'}
                    style={{ width: '100%', paddingLeft: '32px', paddingRight: blockMgmtSearch ? '32px' : '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '13px', background: 'var(--hb-surface)', border: '1px solid var(--hb-border)', borderRadius: '10px', color: 'var(--hb-text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {blockMgmtSearch && (
                    <button onClick={() => { setBlockMgmtSearch(''); setBlockMgmtPage(1); }}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--hb-text-dim)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>✕</button>
                  )}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--hb-text-dim)' }}>
                  ⚠️ {isKo ? '차단은 이 방뿐만 아니라 모든 채팅방에 적용됩니다.' : 'Blocks apply across all rooms, not just one.'}
                </p>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px' }}>
                {(() => {
                  const filtered = blockMgmtSearch
                    ? blockedUsers.filter(u => (u.blocked_id || '').toLowerCase().includes(blockMgmtSearch.toLowerCase()))
                    : blockedUsers;
                  const totalPages = Math.max(1, Math.ceil(filtered.length / BLOCK_MGMT_PAGE_SIZE));
                  const paginated = filtered.slice((blockMgmtPage - 1) * BLOCK_MGMT_PAGE_SIZE, blockMgmtPage * BLOCK_MGMT_PAGE_SIZE);

                  if (paginated.length === 0) return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
                      <span style={{ fontSize: '40px' }}>🛡️</span>
                      <p style={{ color: 'var(--hb-text-dim)', fontSize: '14px', margin: 0 }}>
                        {blockMgmtSearch ? (isKo ? '검색 결과가 없습니다.' : 'No results found.') : (isKo ? '차단된 사용자가 없습니다.' : 'No blocked users.')}
                      </p>
                    </div>
                  );

                  return (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {paginated.map((u, idx) => {
                          const displayName = u.blocked_id;
                          const initials = displayName.substring(0, 2).toUpperCase();
                          return (
                            <div key={u.blocked_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'var(--hb-surface)', border: '1px solid transparent', transition: 'border-color 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.borderColor='var(--hb-border)'}
                              onMouseLeave={e => e.currentTarget.style.borderColor='transparent'}
                            >
                              <span style={{ color: 'var(--hb-text-dim)', fontSize: '11px', fontWeight: 600, width: '18px', textAlign: 'right', flexShrink: 0 }}>
                                {(blockMgmtPage - 1) * BLOCK_MGMT_PAGE_SIZE + idx + 1}
                              </span>
                              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, #475569, #334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                {initials}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--hb-text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {displayName}
                                </p>
                                {u.created_at && (
                                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--hb-text-dim)' }}>
                                    {isKo ? '차단 일시' : 'Blocked at'}: {new Date(u.created_at).toLocaleString()}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => setUnblockTarget({ user_id: u.blocked_id, user_name: u.blocked_id })}
                                disabled={isBlockLoading}
                                style={{ flexShrink: 0, padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--hb-border)', background: 'var(--hb-bg)', color: 'var(--hb-text)', fontSize: '12px', fontWeight: 500, cursor: isBlockLoading ? 'not-allowed' : 'pointer', opacity: isBlockLoading ? 0.5 : 1, transition: 'background 0.15s, color 0.15s, border-color 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.1)'; e.currentTarget.style.color='#f87171'; e.currentTarget.style.borderColor='rgba(239,68,68,0.3)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background='var(--hb-bg)'; e.currentTarget.style.color='var(--hb-text)'; e.currentTarget.style.borderColor='var(--hb-border)'; }}
                              >
                                {isKo ? '차단 해제' : 'Unblock'}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--hb-border)' }}>
                          <button onClick={() => setBlockMgmtPage(p => Math.max(1, p - 1))} disabled={blockMgmtPage === 1}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--hb-border)', background: 'var(--hb-surface)', color: 'var(--hb-text)', fontSize: '12px', cursor: blockMgmtPage === 1 ? 'not-allowed' : 'pointer', opacity: blockMgmtPage === 1 ? 0.4 : 1 }}>
                            ← {isKo ? '이전' : 'Prev'}
                          </button>
                          <span style={{ fontSize: '12px', color: 'var(--hb-text-dim)' }}>{blockMgmtPage} / {totalPages}</span>
                          <button onClick={() => setBlockMgmtPage(p => Math.min(totalPages, p + 1))} disabled={blockMgmtPage === totalPages}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--hb-border)', background: 'var(--hb-surface)', color: 'var(--hb-text)', fontSize: '12px', cursor: blockMgmtPage === totalPages ? 'not-allowed' : 'pointer', opacity: blockMgmtPage === totalPages ? 0.4 : 1 }}>
                            {isKo ? '다음' : 'Next'} →
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : activeRoom ? (
            <>
              <div className="chat-header" style={{ position: 'relative', zIndex: 10 }}>
                <div className="chat-header-info">
                  <div className="avatar" style={isSelfChatRoom(activeRoom) ? { background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' } : {}}>
                    {isSelfChatRoom(activeRoom) ? '🙋' : getRoomTypeIcon(activeRoom.room_type)}
                  </div>
                  <div>
                    {/* Room name */}
                    {!isSelfChatRoom(activeRoom) && editingRoomName ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          className="chat-header-name"
                          style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '2px 6px', fontSize: '14px', width: '160px' }}
                          value={customRoomName}
                          onChange={e => setCustomRoomName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveRoomName(); if (e.key === 'Escape') setEditingRoomName(false); }}
                          autoFocus
                        />
                        <button onClick={handleSaveRoomName} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Save">✓</button>
                        <button onClick={() => setEditingRoomName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Cancel">✕</button>
                      </div>
                    ) : (
                      <div className="chat-header-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSelfChatRoom(activeRoom)
                          ? <><span>📝</span><span>{navigator.language.startsWith('ko') ? '나에게 (나만의 메모방)' : 'Me — My Notes'}</span></>
                          : <>
                              {getRoomDisplayName(activeRoom)}
                              {(activeRoom.room_type === '1to1' || activeRoom.room_type === 'group') && (
                                <button
                                  onClick={() => { setCustomRoomName(activeRoom.room_name || activeRoom.display_name || ''); setEditingRoomName(true); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', opacity: 0.5 }}
                                  title="Edit room name"
                                >✏️</button>
                              )}
                            </>
                        }
                      </div>
                    )}
                    <div className="chat-header-status">
                      {isSelfChatRoom(activeRoom)
                        ? (navigator.language.startsWith('ko') ? '나만의 작업 공간 — 메모 및 데이터 보관' : 'Your private space — notes & saved data')
                        : activeRoom.room_type === 'open'
                          ? `🌐 Open · ${members.length} members${(activeRoom.description_translated || activeRoom.description) ? ` · ${(activeRoom.description_translated || activeRoom.description).slice(0, 60)}${(activeRoom.description_translated || activeRoom.description).length > 60 ? '…' : ''}` : ''}`
                          : `${members.length} members • ${activeRoom.room_type} room`
                      }
                    </div>
                  </div>
                </div>
                <div className="chat-header-actions">
                  {/* Self-chat (Me room): video call and settings are not applicable */}
                  {!isSelfChatRoom(activeRoom) && (activeRoom.room_type === '1to1' || activeRoom.room_type === 'group') && (
                    <button className="btn btn-secondary btn-sm" onClick={handleStartVideoCall}>
                      📹 {activeRoom.room_type === '1to1' ? 'Video Call' : 'Group Call'}
                    </button>
                  )}
                  {/* 👥 Open Room Member Management — owner / sub_admin only */}
                  {activeRoom.room_type === 'open' && isAdmin && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { loadBans(activeRoom.id); setShowMembersModal(true); }}
                      title="Manage Members"
                    >
                      👥
                    </button>
                  )}
                  {/* ⋮ Room Settings — 1:1 and group ≤4 */}
                  {(activeRoom.room_type === '1to1' ||
                    (activeRoom.room_type === 'group' && (activeRoom.members?.length ?? 0) <= 4)) && (
                    <div style={{ position: 'relative' }} ref={settingsRef}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowSettingsDropdown(v => !v)}
                        title="Room Settings"
                      >
                        ⋮
                      </button>
                      {showSettingsDropdown && (
                        <div style={{
                          position: 'absolute', right: 0, top: '110%', zIndex: 200,
                          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '160px', padding: '4px 0'
                        }}>
                          <button
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#374151' }}
                            onClick={() => { setShowRoomSettings(true); setShowSettingsDropdown(false); }}
                          >
                          ⚙️ {roomSettingsT('roomSettings')}
                          </button>
                          <button
                            style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#374151' }}
                            onClick={() => { unitedChat.markAsRead(activeRoom.id, user.user_id).catch(() => {}); setShowSettingsDropdown(false); }}
                          >
                          ✅ {roomSettingsT('markAllRead')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Active Call Banner — shows when a video call is in progress (invited: rejoin / not invited: locked) */}
              {activeCallSession && activeRoom?.room_type !== 'open' && (() => {
                const amInvited = (activeCallSession.participants || []).some(
                  (p) => p.user_id === user.user_id
                );
                const activePCount = (activeCallSession.participants || []).filter(
                  (p) => p.status === 'active'
                ).length;
                return (
                  <div
                    onClick={amInvited ? () => navigate(`/video-call/${activeRoom.id}`, {
                      state: {
                        session: activeCallSession,
                        roomType: activeRoom.room_type,
                        roomName: getRoomDisplayName(activeRoom),
                        rejoin: true,
                      },
                    }) : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 16px',
                      background: 'linear-gradient(90deg, #10b981, #0d9488)',
                      color: '#fff',
                      cursor: amInvited ? 'pointer' : 'default',
                      opacity: amInvited ? 1 : 0.75,
                      userSelect: 'none',
                      fontSize: '13px',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <span>📹</span>
                      {isKo ? '영상통화 진행 중' : 'Video call in progress'}
                      {activePCount > 0 && (
                        <span style={{
                          background: 'rgba(255,255,255,0.25)', borderRadius: 999,
                          padding: '1px 8px', fontSize: 11,
                        }}>
                          {activePCount}{isKo ? '명' : ' active'}
                        </span>
                      )}
                    </span>
                    {amInvited ? (
                      <span style={{
                        background: 'rgba(255,255,255,0.2)', borderRadius: 6,
                        padding: '3px 10px', fontSize: 12, fontWeight: 600,
                        border: '1px solid rgba(255,255,255,0.35)',
                      }}>
                        {isKo ? '재참여' : 'Join'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, opacity: 0.8 }}>
                        {isKo ? '초대받지 않음' : 'Not invited'}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Pinned Message Banner */}
              {pinnedMsg && (
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 16px', background:'#fffbeb', borderBottom:'1px solid #fde68a', fontSize:'12px', cursor:'pointer' }}
                  onClick={() => document.getElementById(`msg-${pinnedMsg.id}`)?.scrollIntoView({ behavior:'smooth', block:'center' })}
                >
                  <span>📌</span>
                  <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center' }}>{pinnedBannerContent(pinnedMsg)}</div>
                  {canPin && (
                    <button onClick={e => { e.stopPropagation(); handleUnpinMessage(); }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#b45309', fontSize:'14px' }} title="Unpin"
                    >✕</button>
                  )}
                </div>
              )}

              {/* Message list */}
              <ChatMessageList
                messages={messages}
                currentUserId={user.user_id}
                pinnedMsgId={activeRoom.pinned_message_id}
                canPin={canPin}
                onPin={handlePinMessage}
                hoveredMsgId={hoveredMsgId}
                onHover={setHoveredMsgId}
                onCopy={(msgId) => {
                  setCopyToastMsgId(msgId);
                  setTimeout(() => setCopyToastMsgId(null), 2000);
                }}
                readStatuses={readStatuses}
                roomType={activeRoom.room_type}
                isSelfChat={isSelfChatRoom(activeRoom)}
                members={members}
                onRetry={handleRetry}
                onCancelSend={handleCancelSend}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                editingMsgId={editingMsgId}
                editingContent={editingContent}
                setEditingContent={setEditingContent}
                deleteConfirmId={deleteConfirmId}
                setDeleteConfirmId={setDeleteConfirmId}
                replySnapshots={replySnapshots}
                onReply={(msg) => setReplyTo(msg)}
                userLang={user?.preferred_lang_cd || 'en'}
              />

              {/* ── Reply preview bar (shown when replying to a message) ── */}
              {replyTo && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px',
                  background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                  borderBottom: '1px solid #bfdbfe',
                  borderRadius: '0',
                }}>
                  {/* Blue accent bar */}
                  <div style={{ width: '3px', height: '28px', borderRadius: '2px', background: '#3b82f6', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Sender name of the original message */}
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6' }}>
                      ↩ {replyTo.sender_name || replyTo.sender_id}
                    </div>
                    {/* Preview of original message content (truncated) */}
                    <div style={{
                      fontSize: '12px', color: '#64748b',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {replyTo.message_type === 'image' ? '🖼️ Image'
                        : replyTo.message_type === 'video' ? '🎬 Video'
                        : replyTo.message_type === 'audio' ? '🎵 Audio'
                        : replyTo.message_type === 'file'  ? '📎 File'
                        : replyTo.message_type === 'location' ? `📍 ${replyTo.metadata?.name || 'Location'}`
                        : replyTo.message_type === 'contact'  ? `👤 ${replyTo.metadata?.name || 'Contact'}`
                        : replyTo.content
                      }
                    </div>
                  </div>
                  {/* Cancel reply button */}
                  <button
                    onClick={() => setReplyTo(null)}
                    title="Cancel reply"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94a3b8', fontSize: '18px', flexShrink: 0,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                  >✕</button>
                </div>
              )}

              {/* Input area: "+" KakaoTalk-style overlay + ChatInput */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', position: 'relative' }}>
                {/* Plus button */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {/* Overlay popup (appears above) */}
                  {showPlusMenu && (
                    <div
                      style={{
                        position: 'absolute', bottom: '48px', left: '0',
                        background: '#fff', borderRadius: '16px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                        border: '1px solid rgba(0,0,0,0.07)',
                        padding: '12px 8px',
                        display: 'flex', flexDirection: 'column', gap: '4px',
                        minWidth: '160px', zIndex: 50,
                        animation: 'slideUpFade 0.18s ease',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <style>{`@keyframes slideUpFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`}</style>
                      {[
                        { icon: '📍', label: isKo ? '위치'   : 'Location', color: '#059669', bg: '#f0fdf4', action: () => { setShowPlusMenu(false); setShowLocationModal(true); } },
                        { icon: '👤', label: isKo ? '연락처' : 'Contact',  color: '#6366f1', bg: '#f5f3ff', action: () => { setShowPlusMenu(false); setShowContactModal(true); } },
                        { icon: '📎', label: isKo ? '파일'   : 'File',     color: '#0ea5e9', bg: '#f0f9ff', action: () => { setShowPlusMenu(false); document.getElementById('chat-file-input')?.click(); } },
                      ].map(({ icon, label, color, bg, action }) => (
                        <button key={label} onClick={action}
                          style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', borderRadius:'12px', border:'none', background:'none', cursor:'pointer', textAlign:'left', transition:'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = bg}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <span style={{ width:'34px', height:'34px', borderRadius:'50%', background: bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>{icon}</span>
                          <span style={{ fontSize:'13px', fontWeight:600, color }}>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* The "+" button itself */}
                  <button
                    onClick={() => setShowPlusMenu(v => !v)}
                    title={isKo ? '더 보기' : 'More options'}
                    style={{
                      width: '38px', height: '38px', borderRadius: '50%',
                      background: showPlusMenu ? '#1e293b' : '#64748b',
                      border: 'none', cursor: 'pointer', fontSize: '22px', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)', transition: 'background 0.15s, transform 0.15s',
                      transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)',
                    }}
                  >+</button>
                </div>

                <div style={{ flex: 1 }}>
                  <ChatInput
                    onSendMessage={handleSendMessage}
                    onFileUpload={(file) => { setShowPlusMenu(false); handleFileUpload(file); }}
                    onTyping={handleTyping}
                    typingText={typingText}
                    placeholder="Type a message... (auto-translated for recipients)"
                    fileInputId="chat-file-input"
                  />
                </div>
              </div>
              {/* Click-away to close plus menu */}
              {showPlusMenu && <div style={{ position:'fixed', inset:0, zIndex:49 }} onClick={() => setShowPlusMenu(false)} />}

              {/* Copy toast */}
              {copyToastMsgId && (
                <div style={{
                  position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(15,23,42,0.9)', color: '#fff', borderRadius: '20px',
                  padding: '8px 18px', fontSize: '13px', fontWeight: 500,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 999,
                  display: 'flex', alignItems: 'center', gap: '8px',
                  animation: 'fadeInUp 0.2s ease',
                }}>
                  ✅ {copyToastText}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">Select a room to start chatting</div>
              <div className="empty-state-desc">
                Choose a room from the sidebar or create a new one.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════ PIN REPLACE CONFIRMATION ══════════ */}
      {pinConfirm && (
        <div className="modal-overlay" onClick={() => setPinConfirm(null)}>
          <div className="modal animate-slide" style={{ maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">📌 {navigator.language.startsWith('ko') ? '고정 메시지 교체' : 'Replace Pinned Message?'}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {navigator.language.startsWith('ko') ? '이미 고정된 메시지가 있습니다. 교체하시겠습니까?' : 'A message is already pinned. Replace it with this one?'}
            </p>
            {pinnedMsg && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'#92400e', marginBottom:'16px', display:'flex', alignItems:'center', gap:'6px' }}>
                <strong style={{ flexShrink:0 }}>{isKo ? '현재 고정: ' : 'Currently pinned: '}</strong>
                <div style={{ minWidth:0, flex:1, display:'flex', alignItems:'center' }}>{pinnedBannerContent(pinnedMsg)}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPinConfirm(null)}>
                {navigator.language.startsWith('ko') ? '취소' : 'Cancel'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => doPinMessage(pinConfirm.msgId)} disabled={isPinning}>
                {isPinning ? '...' : (navigator.language.startsWith('ko') ? '교체' : 'Replace')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ GROUP VIDEO CALL MODAL ══════════ */}
      {showGroupCallModal && activeRoom?.room_type === 'group' && (
        <div className="modal-overlay" onClick={() => setShowGroupCallModal(false)}>
          <div className="modal animate-slide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 className="modal-title">📹 {isKo ? '그룹 영상통화' : 'Group Video Call'}</h3>

            {/* Selected member chips */}
            {groupCallTargets.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {groupCallTargets.map((uid) => {
                  const m = members.find((x) => x.user_id === uid);
                  return (
                    <span key={uid} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 999, fontSize: 12,
                      background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
                      color: 'var(--hb-success, #10b981)'
                    }}>
                      {m?.user_name || uid}
                      <button
                        onClick={() => setGroupCallTargets((t) => t.filter((x) => x !== uid))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
                      >✕</button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search input */}
            <div className="input-group" style={{ marginBottom: 6 }}>
              <input
                className="input"
                type="text"
                placeholder={isKo ? '멤버 이름 검색...' : 'Search members...'}
                value={callMemberSearch}
                onChange={(e) => setCallMemberSearch(e.target.value)}
              />
            </div>

            {/* Counter */}
            <p style={{ fontSize: 12, color: 'var(--hb-text-muted)', marginBottom: 8 }}>
              {isKo
                ? `최대 ${MAX_CALL_TARGETS}명 선택 (${groupCallTargets.length}/${MAX_CALL_TARGETS})`
                : `Select up to ${MAX_CALL_TARGETS} members (${groupCallTargets.length}/${MAX_CALL_TARGETS})`}
            </p>

            {/* Member list */}
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {members
                .filter((m) => m.user_id !== user.user_id)
                .filter((m) => !callMemberSearch ||
                  (m.user_name || '').toLowerCase().includes(callMemberSearch.toLowerCase()))
                .map((m) => {
                  const isSel = groupCallTargets.includes(m.user_id);
                  const isDis = !isSel && groupCallTargets.length >= MAX_CALL_TARGETS;
                  return (
                    <button
                      key={m.user_id}
                      disabled={isDis}
                      onClick={() => setGroupCallTargets((prev) =>
                        isSel ? prev.filter((x) => x !== m.user_id) : [...prev, m.user_id]
                      )}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                        background: isSel ? 'rgba(16,185,129,0.12)' : 'transparent',
                        border: isSel ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent',
                        color: isDis ? 'var(--hb-text-muted)' : 'var(--hb-text)',
                        opacity: isDis ? 0.45 : 1,
                        cursor: isDis ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{isSel ? '✅' : '⬜'}</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: isSel ? 600 : 400 }}>
                        {m.user_name || m.user_id}
                      </span>
                      {m.role === 'owner' && <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', padding: '1px 6px', borderRadius: 4 }}>Owner</span>}
                      {m.role === 'sub_admin' && <span style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(167,139,250,0.15)', padding: '1px 6px', borderRadius: 4 }}>Admin</span>}
                    </button>
                  );
                })}
              {members.filter((m) => m.user_id !== user.user_id && (!callMemberSearch || (m.user_name || '').toLowerCase().includes(callMemberSearch.toLowerCase()))).length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--hb-text-muted)', fontSize: 13, padding: '16px 0' }}>
                  {isKo ? '검색 결과가 없습니다' : 'No members found'}
                </p>
              )}
            </div>

            {/* Footer buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowGroupCallModal(false)}>
                {isKo ? '취소' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, opacity: groupCallTargets.length === 0 ? 0.5 : 1, cursor: groupCallTargets.length === 0 ? 'not-allowed' : 'pointer' }}
                disabled={groupCallTargets.length === 0}
                onClick={confirmGroupCall}
              >
                📹 {isKo ? `영상통화 시작 (${groupCallTargets.length}명)` : `Start Call (${groupCallTargets.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ CREATE ROOM MODAL ══════════ */}
      {showCreateModal && (

        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal animate-slide" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Create New Room</h3>
            <div className="input-group">
              <label className="input-label">Room Type</label>
              <div className="flex gap-sm">
                {['1to1', 'group', 'open'].map((type) => (
                  <button
                    key={type}
                    className={`btn ${newRoom.room_type === type ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setNewRoom({ ...newRoom, room_type: type })}
                    style={{ flex: 1 }}
                  >
                    {getRoomTypeIcon(type)} {type === '1to1' ? '1:1' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {newRoom.room_type !== '1to1' && (
              <div className="input-group">
                <label className="input-label">Room Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Project Alpha"
                  value={newRoom.room_name}
                  onChange={(e) => setNewRoom({ ...newRoom, room_name: e.target.value })}
                  maxLength={50}
                />
              </div>
            )}
            {newRoom.room_type !== 'open' && (
              <div className="input-group">
                <label className="input-label">
                  {newRoom.room_type === '1to1' ? 'User ID to chat with' : 'Members (comma-separated)'}
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder={newRoom.room_type === '1to1' ? 'user-002' : 'user-002, user-003'}
                  value={newRoom.members}
                  onChange={(e) => setNewRoom({ ...newRoom, members: e.target.value })}
                />
              </div>
            )}
            <div className="flex gap-sm" style={{ justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateRoom}>Create Room</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Location Send Modal ───────────────────────────────────── */}
      {showLocationModal && (
        <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowLocationModal(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', width:'360px', background:'#fff', borderRadius:'20px', boxShadow:'0 24px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#059669,#10b981)', padding:'18px 22px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'22px' }}>📍</span>
              <span style={{ color:'#fff', fontWeight:700, fontSize:'15px' }}>Share Location</span>
              <button onClick={() => setShowLocationModal(false)} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'50%', width:'26px', height:'26px', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>✕</button>
            </div>
            {/* Form */}
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:'12px' }}>
              {[
                { label:'Place Name *', key:'name', placeholder:'e.g. HyperBabel HQ', type:'text' },
                { label:'Address (optional)', key:'address', placeholder:'e.g. 110 Sejong-daero, Seoul', type:'text' },
                { label:'Latitude (optional)', key:'latitude', placeholder:'e.g. 37.5665', type:'number' },
                { label:'Longitude (optional)', key:'longitude', placeholder:'e.g. 126.9780', type:'number' },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label style={{ fontSize:'11px', fontWeight:600, color:'#6b7280', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'4px' }}>{label}</label>
                  <input
                    type={type}
                    value={locationForm[key]}
                    onChange={e => setLocationForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'13px', outline:'none', transition:'border 0.2s' }}
                    onFocus={e => e.target.style.borderColor = '#10b981'}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              ))}
              {/* Use my location shortcut */}
              <button
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(pos => {
                      setLocationForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
                    });
                  }
                }}
                style={{ background:'#f0fdf4', border:'1px solid #a7f3d0', borderRadius:'10px', padding:'8px 14px', fontSize:'12px', color:'#059669', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'6px' }}
              >🎯 Use my current location</button>
            </div>
            <div style={{ padding:'0 22px 20px', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowLocationModal(false)} style={{ padding:'8px 18px', borderRadius:'10px', border:'1px solid #e5e7eb', background:'#fff', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
              <button
                onClick={handleSendLocation}
                disabled={!locationForm.name.trim()}
                style={{ padding:'8px 20px', borderRadius:'10px', border:'none', background: locationForm.name.trim() ? 'linear-gradient(135deg,#059669,#10b981)' : '#e5e7eb', color: locationForm.name.trim() ? '#fff' : '#9ca3af', fontSize:'13px', fontWeight:600, cursor: locationForm.name.trim() ? 'pointer' : 'default' }}
              >📍 Send Location</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Send Modal ────────────────────────────────────── */}
      {showContactModal && (
        <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowContactModal(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', width:'360px', background:'#fff', borderRadius:'20px', boxShadow:'0 24px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', padding:'18px 22px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'22px' }}>👤</span>
              <span style={{ color:'#fff', fontWeight:700, fontSize:'15px' }}>Share Contact</span>
              <button onClick={() => setShowContactModal(false)} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'50%', width:'26px', height:'26px', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>✕</button>
            </div>
            {/* Form */}
            <div style={{ padding:'20px 22px', display:'flex', flexDirection:'column', gap:'12px' }}>
              {[
                { label:'Name *', key:'name', placeholder:'e.g. Jane Smith', type:'text', icon:'👤' },
                { label:'Phone (optional)', key:'phone', placeholder:'e.g. +82-10-1234-5678', type:'tel', icon:'📞' },
                { label:'Email (optional)', key:'email', placeholder:'e.g. jane@example.com', type:'email', icon:'✉️' },
              ].map(({ label, key, placeholder, type, icon }) => (
                <div key={key}>
                  <label style={{ fontSize:'11px', fontWeight:600, color:'#6b7280', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:'4px' }}>{icon} {label}</label>
                  <input
                    type={type}
                    value={contactForm[key]}
                    onChange={e => setContactForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:'10px', border:'1px solid #e5e7eb', fontSize:'13px', outline:'none', transition:'border 0.2s' }}
                    onFocus={e => e.target.style.borderColor = '#8b5cf6'}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding:'0 22px 20px', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setShowContactModal(false)} style={{ padding:'8px 18px', borderRadius:'10px', border:'1px solid #e5e7eb', background:'#fff', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
              <button
                onClick={handleSendContact}
                disabled={!contactForm.name.trim()}
                style={{ padding:'8px 20px', borderRadius:'10px', border:'none', background: contactForm.name.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#e5e7eb', color: contactForm.name.trim() ? '#fff' : '#9ca3af', fontSize:'13px', fontWeight:600, cursor: contactForm.name.trim() ? 'pointer' : 'default' }}
              >👤 Send Contact</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Room Settings Modal ───────────────────────────────────── */}
      {showRoomSettings && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowRoomSettings(false)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} />
          <div
            style={{ position: 'relative', width: '360px', background: '#fff', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Gradient header */}
            <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>⚙️</span>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>
                  {roomSettingsT('roomSettings')}
                </span>
              </div>
              <button onClick={() => setShowRoomSettings(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              {/* Typing indicator section — hidden for self-chat rooms (Me rooms) where there is no counterpart */}
              {!isSelfChatRoom(activeRoom) && (
                <>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>
                    {roomSettingsT('typingIndicator')}
                  </p>
                  {[
                    { key: 'send', label: roomSettingsT('send'), desc: roomSettingsT('sendDesc'), value: myTypingPrefs.send, onClick: () => saveTypingPrefs(!myTypingPrefs.send, myTypingPrefs.recv) },
                    { key: 'recv', label: roomSettingsT('recv'), desc: roomSettingsT('recvDesc'), value: myTypingPrefs.recv, onClick: () => saveTypingPrefs(myTypingPrefs.send, !myTypingPrefs.recv) },
                  ].map(({ key, label, desc, value, onClick }, idx, arr) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', marginBottom: '2px' }}>{label}</p>
                        <p style={{ fontSize: '11px', color: '#94a3b8' }}>{desc}</p>
                      </div>
                      <button
                        onClick={onClick}
                        disabled={savingPrefs}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: value ? '#7c3aed' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                      >
                        <span style={{ position: 'absolute', top: '4px', left: value ? '22px' : '4px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* ── Mute Notifications Section ── */}
              {!isSelfChatRoom(activeRoom) && (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '8px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
                    {t('Notifications', '알림 설정')}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', marginBottom: '2px' }}>
                        {isMuted ? '🔕' : '🔔'} {t('Mute Notifications', '알림 뮤트')}
                      </p>
                      {isMuted && (
                        <p style={{ fontSize: '11px', color: '#d97706' }}>
                          {mutedUntil
                            ? `${t('Until', '해제')}: ${new Date(mutedUntil).toLocaleString()}`
                            : t('Muted indefinitely', '영구 뮤트')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleMute(isMuted ? undefined : null)}
                      disabled={isMuteLoading}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: isMuteLoading ? 'not-allowed' : 'pointer', background: isMuted ? '#f59e0b' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: isMuteLoading ? 0.5 : 1 }}
                    >
                      <span style={{ position: 'absolute', top: '4px', left: isMuted ? '22px' : '4px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                  {/* Duration shortcuts (shown only when not muted) */}
                  {!isMuted && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[
                        { label: t('1 hour', '1시간'), mins: 60 },
                        { label: t('8 hours', '8시간'), mins: 480 },
                        { label: t('24 hours', '24시간'), mins: 1440 },
                        { label: t('Forever', '영구'), mins: null },
                      ].map(({ label, mins }) => (
                        <button key={label} onClick={() => handleToggleMute(mins)} disabled={isMuteLoading}
                          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: isMuteLoading ? 'not-allowed' : 'pointer', opacity: isMuteLoading ? 0.5 : 1 }}
                        >🔕 {label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Blocked Users Section ── */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '8px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
                  {t('User Block', '사용자 차단')}
                  {blockedUsers.length > 0 && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', background: '#e2e8f0', color: '#64748b', borderRadius: '10px', padding: '1px 6px' }}>{blockedUsers.length}</span>
                  )}
                </p>

                {/* Room members only — block / unblock */}
                {members.filter(m => m.user_id !== user.user_id).length > 0 ? (
                  <div>
                    {members.filter(m => m.user_id !== user.user_id).map(m => {
                      const isBlocked = blockedUsers.some(b => b.blocked_id === m.user_id);
                      return (
                        <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                            {m.user_name || m.user_id}
                          </span>
                          <button
                            onClick={() => isBlocked ? setUnblockTarget({ user_id: m.user_id, user_name: m.user_name || m.user_id }) : handleBlockUser(m.user_id)}
                            disabled={isBlockLoading}
                            style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', border: 'none', cursor: isBlockLoading ? 'not-allowed' : 'pointer', opacity: isBlockLoading ? 0.5 : 1, background: isBlocked ? '#f1f5f9' : '#fef2f2', color: isBlocked ? '#64748b' : '#ef4444', fontWeight: 600 }}
                          >
                            {isBlocked ? t('Unblock', '차단 해제') : t('Block', '차단')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                    {t('No other members in this room', '이 방에 다른 멤버가 없습니다')}
                  </p>
                )}

                {/* Global scope note */}
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>
                  {t('⚠️ Blocks apply across all rooms, not just this one.', '⚠️ 차단은 모든 채팅방에 적용됩니다.')}
                </p>
              </div>
            </div>
            <div style={{ padding: '0 24px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>
                {t('Mute settings apply to this room only', '알림 뮤트 설정은 이 채팅방에만 적용됩니다')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Open Room Members Modal (C1) ───────────────────────────────────── */}
      {showMembersModal && activeRoom && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowMembersModal(false)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
          <div
            style={{ position: 'relative', width: '380px', maxHeight: '80vh', background: '#1e293b', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🛡️</span>
                 <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>{t('Member Management', '멤버 관리')}</span>
              </div>
              <button onClick={() => setShowMembersModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Invite Code Box (C4) */}
              {activeRoom.invite_code && (
                <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Invite Code</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ flex: 1, fontFamily: 'monospace', fontSize: '14px', color: '#fbbf24', letterSpacing: '0.15em', background: '#1e293b', borderRadius: '6px', padding: '4px 8px' }}>{activeRoom.invite_code}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/join?code=${activeRoom.invite_code}`);
                        setCopiedInvite(true);
                        setTimeout(() => setCopiedInvite(false), 2000);
                      }}
                      style={{ padding: '4px 10px', background: '#78350f', border: 'none', borderRadius: '6px', color: '#fbbf24', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {copiedInvite ? '✓ Copied' : '📋 Copy Link'}
                    </button>
                  </div>
                   <p style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>{t('Share this code or link to invite others to join', '이 코드 또는 링크를 공유하여 다른 사람을 초대하세요')}</p>
                </div>
              )}

              {/* Description (C3) */}
              {activeRoom.description && (
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '12px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>About this room</p>
                  <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>{activeRoom.description}</p>
                </div>
              )}

              {/* Members List */}
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  {t('Members', '멤버')}
                  {' '}({memberSearch.trim() ? `${(() => { const q = memberSearch.trim().toLowerCase(); return members.filter(m => (m.user_name || m.user_id).toLowerCase().includes(q) || m.user_id.toLowerCase().includes(q)); })().length}/` : ''}{members.length})
                </p>
                {/* Search input */}
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '12px', pointerEvents: 'none' }}>🔍</span>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => { setMemberSearch(e.target.value); setMemberPage(0); }}
                    placeholder={t('Search members...', '멤버 검색...')}
                    style={{ width: '100%', paddingLeft: '28px', paddingRight: memberSearch ? '28px' : '8px', paddingTop: '6px', paddingBottom: '6px', fontSize: '12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: '#e2e8f0', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {memberSearch && (
                    <button
                      onClick={() => { setMemberSearch(''); setMemberPage(0); }}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
                {(() => {
                  const searchQuery = memberSearch.trim().toLowerCase();
                  const filteredMembers = searchQuery
                    ? members.filter(m => (m.user_name || m.user_id).toLowerCase().includes(searchQuery) || m.user_id.toLowerCase().includes(searchQuery))
                    : members;
                  const sorted = [
                    ...filteredMembers.filter(m => m.role === 'owner' || m.role === 'sub_admin'),
                    ...filteredMembers.filter(m => m.role !== 'owner' && m.role !== 'sub_admin'),
                  ];
                  const totalPages = Math.ceil(sorted.length / MEMBER_PAGE_SIZE);
                  const paged = sorted.slice(memberPage * MEMBER_PAGE_SIZE, (memberPage + 1) * MEMBER_PAGE_SIZE);
                  return (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {paged.map(m => (
                          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#0f172a', borderRadius: '8px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                              {(m.user_name || m.user_id).slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.user_name || m.user_id}</p>
                              <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                                {m.role === 'owner' ? '👑 Owner' : m.role === 'sub_admin' ? '🛡️ Admin' : '👤 Member'}
                              </p>
                            </div>
                            {m.user_id !== user.user_id && (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {isAdmin && m.role !== 'owner' && !(m.role === 'sub_admin' && myRole !== 'owner') && (
                                  <button onClick={() => setPendingMemberAction({ type: 'ban', userId: m.user_id, userName: m.user_name || m.user_id })}
                                    style={{ padding: '3px 8px', background: '#450a0a', border: 'none', borderRadius: '5px', color: '#f87171', fontSize: '11px', cursor: 'pointer' }} title="Ban">🚫</button>
                                )}
                                {myRole === 'owner' && m.role === 'member' && (
                                  <button onClick={() => setPendingMemberAction({ type: 'promote', userId: m.user_id, userName: m.user_name || m.user_id })}
                                    style={{ padding: '3px 8px', background: '#1e1b4b', border: 'none', borderRadius: '5px', color: '#a5b4fc', fontSize: '11px', cursor: 'pointer' }} title="Promote">🛡️+</button>
                                )}
                                {myRole === 'owner' && m.role === 'sub_admin' && (
                                  <button onClick={() => setPendingMemberAction({ type: 'demote', userId: m.user_id, userName: m.user_name || m.user_id })}
                                    style={{ padding: '3px 8px', background: '#1c1917', border: 'none', borderRadius: '5px', color: '#78716c', fontSize: '11px', cursor: 'pointer' }} title="Demote">🛡️-</button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #1e293b' }}>
                          <button onClick={() => setMemberPage(p => Math.max(0, p - 1))} disabled={memberPage === 0}
                            style={{ padding: '4px 10px', background: '#1e293b', border: 'none', borderRadius: '5px', color: memberPage === 0 ? '#475569' : '#94a3b8', fontSize: '11px', cursor: memberPage === 0 ? 'default' : 'pointer' }}>← {t('Prev', '이전')}</button>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{memberPage + 1} / {totalPages}</span>
                          <button onClick={() => setMemberPage(p => Math.min(totalPages - 1, p + 1))} disabled={memberPage === totalPages - 1}
                            style={{ padding: '4px 10px', background: '#1e293b', border: 'none', borderRadius: '5px', color: memberPage === totalPages - 1 ? '#475569' : '#94a3b8', fontSize: '11px', cursor: memberPage === totalPages - 1 ? 'default' : 'pointer' }}>{t('Next', '다음')} →</button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Banned Users */}
              {bans.filter(b => b.is_active).length > 0 && (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    Banned ({bans.filter(b => b.is_active).length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {bans.filter(b => b.is_active).map(b => (
                      <div key={b.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#1c0b0b', border: '1px solid #450a0a', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px' }}>🚫</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13px', color: '#f87171', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.user_id}</p>
                          <p style={{ fontSize: '10px', color: '#7f1d1d', margin: 0 }}>by {b.banned_by} · {new Date(b.banned_at).toLocaleDateString()}</p>
                        </div>
                        <button
                          onClick={() => setPendingMemberAction({ type: 'unban', userId: b.user_id, userName: b.user_id })}
                          style={{ padding: '3px 8px', background: '#052e16', border: 'none', borderRadius: '5px', color: '#4ade80', fontSize: '11px', cursor: 'pointer' }}
                        >{t('Unban', '차단 해제')}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Confirm Action Dialog ── */}
            {pendingMemberAction && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', borderRadius: '20px' }}>
                <div style={{ margin: '0 16px', width: '100%', maxWidth: '300px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  {/* Icon + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>
                      {pendingMemberAction.type === 'ban' ? '🚫' : pendingMemberAction.type === 'unban' ? '✅' : pendingMemberAction.type === 'promote' ? '🛡️' : '⬇️'}
                    </span>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>{pendingMemberAction.userName}</p>
                  </div>
                  {/* Message */}
                  <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '16px' }}>
                    {{
                      ban:     t('Ban this member? They will be removed from the room and cannot rejoin.', '이 멤버를 차단하시겠습니까? 해당 멤버는 방에서 나가고 다시 입장할 수 없게 됩니다.'),
                      unban:   t('Remove the ban on this member? They will be able to rejoin the room.', '이 멤버의 차단을 해제하시겠습니까? 해당 멤버는 다시 방에 입장할 수 있게 됩니다.'),
                      promote: t('Promote this member to Sub-Admin?', '이 멤버를 부관리자로 승격하시겠습니까?'),
                      demote:  t('Remove Sub-Admin privileges from this member?', '이 멤버의 부관리자 권한을 해제하시겠습니까?'),
                    }[pendingMemberAction.type]}
                  </p>
                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setPendingMemberAction(null)}
                      style={{ height: '32px', padding: '0 16px', borderRadius: '8px', border: 'none', background: '#334155', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}
                    >{t('Cancel', '취소')}</button>
                    <button
                      onClick={async () => {
                        const { type, userId } = pendingMemberAction;
                        setPendingMemberAction(null);
                        if (type === 'ban')    { await unitedChat.banUser(activeRoom.id, user.user_id, userId); await loadBans(activeRoom.id); }
                        if (type === 'unban')  { await unitedChat.unbanUser(activeRoom.id, userId); await loadBans(activeRoom.id); }
                        if (type === 'promote') { await unitedChat.promoteToSubAdmin(activeRoom.id, user.user_id, userId); window.location.reload(); }
                        if (type === 'demote') { await unitedChat.demoteSubAdmin(activeRoom.id, user.user_id, userId); window.location.reload(); }
                      }}
                      style={{
                        height: '32px', padding: '0 16px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                        background: pendingMemberAction.type === 'ban' ? '#dc2626' : pendingMemberAction.type === 'unban' ? '#16a34a' : '#7c3aed',
                        color: '#fff',
                      }}
                    >{t('Confirm', '확인')}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Unblock Confirm Modal ── */}
      {unblockTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setUnblockTarget(null); }}
        >
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setUnblockTarget(null)} />
          {/* Card */}
          <div style={{ position: 'relative', width: '340px', borderRadius: '20px', background: 'var(--hb-surface, #1e293b)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Red accent bar */}
            <div style={{ height: '4px', background: 'linear-gradient(90deg, #f87171, #ef4444)' }} />
            <div style={{ padding: '24px' }}>
              {/* User avatar + title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '18px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #475569, #334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                    {(unblockTarget.user_name || unblockTarget.user_id).substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', border: '2px solid var(--hb-surface, #1e293b)' }}>
                    🚫
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--hb-text, #f1f5f9)' }}>
                    {isKo ? '차단 해제 확인' : 'Confirm Unblock'}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--hb-text, #cbd5e1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {unblockTarget.user_name || unblockTarget.user_id}
                  </p>
                </div>
              </div>

              {/* Warning box */}
              <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
                <p style={{ margin: 0, fontSize: '12px', color: '#f59e0b', lineHeight: 1.6 }}>
                  {isKo
                    ? '해당 사용자의 차단을 해제하면 모든 채팅방에서 메시지를 주고받을 수 있게 됩니다.'
                    : 'Unblocking this user will allow them to message you in all chat rooms again.'}
                </p>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setUnblockTarget(null)}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--hb-border, #334155)', background: 'transparent', color: 'var(--hb-text, #cbd5e1)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                >
                  {isKo ? '취소' : 'Cancel'}
                </button>
                <button
                  onClick={() => handleUnblockUser(unblockTarget.user_id)}
                  disabled={isBlockLoading}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: isBlockLoading ? 'not-allowed' : 'pointer', opacity: isBlockLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {isBlockLoading
                    ? <><span style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />{isKo ? '해제 중...' : 'Unblocking...'}</>
                    : (isKo ? '차단 해제하기' : 'Unblock User')
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Unblock Confirm Modal ── */}
      {unblockTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setUnblockTarget(null); }}
        >
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }} onClick={() => setUnblockTarget(null)} />
          {/* Card */}
          <div style={{ position: 'relative', width: '340px', borderRadius: '20px', background: 'var(--hb-surface, #1e293b)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            {/* Red accent bar */}
            <div style={{ height: '4px', background: 'linear-gradient(90deg, #f87171, #ef4444)' }} />
            <div style={{ padding: '24px' }}>
              {/* User avatar + title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '18px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #475569, #334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                    {(unblockTarget.user_name || unblockTarget.user_id).substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '20px', height: '20px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', border: '2px solid var(--hb-surface, #1e293b)' }}>
                    🚫
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--hb-text, #f1f5f9)' }}>
                    {isKo ? '차단 해제 확인' : 'Confirm Unblock'}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--hb-text, #cbd5e1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {unblockTarget.user_name || unblockTarget.user_id}
                  </p>
                </div>
              </div>

              {/* Warning box */}
              <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
                <p style={{ margin: 0, fontSize: '12px', color: '#f59e0b', lineHeight: 1.6 }}>
                  {isKo
                    ? '해당 사용자의 차단을 해제하면 모든 채팅방에서 메시지를 주고받을 수 있게 됩니다.'
                    : 'Unblocking this user will allow them to message you in all chat rooms again.'}
                </p>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setUnblockTarget(null)}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', border: '1px solid var(--hb-border, #334155)', background: 'transparent', color: 'var(--hb-text, #cbd5e1)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                >
                  {isKo ? '취소' : 'Cancel'}
                </button>
                <button
                  onClick={() => handleUnblockUser(unblockTarget.user_id)}
                  disabled={isBlockLoading}
                  style={{ flex: 1, padding: '11px', borderRadius: '12px', border: 'none', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: isBlockLoading ? 'not-allowed' : 'pointer', opacity: isBlockLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {isBlockLoading
                    ? <><span style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />{isKo ? '해제 중...' : 'Unblocking...'}</>
                    : (isKo ? '차단 해제하기' : 'Unblock User')
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}