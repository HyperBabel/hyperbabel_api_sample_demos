/**
 * HyperBabel React Demo — Reusable Chat Input Component
 *
 * Message input area with:
 * - Text input with auto-resize
 * - File attachment button (uses HyperBabel Storage API)
 * - Send button
 * - Typing indicator display
 *
 * Reused across chat rooms, video call chat, and live stream chat.
 */

import { useState, useRef, useEffect } from 'react';

/**
 * At most one "typing" notification per this many ms while the user keeps
 * typing. Each one is an API call (POST …/typing) that counts against the
 * per-user, per-minute rate limit — firing per keystroke exhausts it within
 * seconds and the user's next message send is then rejected with 429.
 */
const TYPING_THROTTLE_MS = 3000;

/**
 * @param {object} props
 * @param {function} props.onSendMessage   — Called with message text
 * @param {function} [props.onFileUpload]  — Called with File object
 * @param {function} [props.onTyping]      — Called with `true` at most once
 *   every 3 s while the user types (send the typing event then), and with
 *   `false` when typing stops (on send, or after 3 s of no input). `false`
 *   is a local signal only — there is no "stopped typing" API call.
 * @param {string}   [props.typingText]    — Text showing who is typing
 * @param {string}   [props.placeholder]   — Input placeholder text
 * @param {string}   [props.fileInputId]   — id for the hidden file input, so
 *   another control (e.g. a "+" menu) can open the file picker
 */
export default function ChatInput({
  onSendMessage,
  onFileUpload,
  onTyping,
  typingText = '',
  placeholder = 'Type a message...',
  fileInputId,
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const idleTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0); // time of the last onTyping(true)

  // Clear the idle timer on unmount (e.g. switching rooms remounts this).
  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  /** Typing stopped — reset the throttle so the next keystroke notifies at once. */
  const stopTyping = () => {
    clearTimeout(idleTimerRef.current);
    if (lastTypingSentRef.current !== 0) {
      lastTypingSentRef.current = 0;
      onTyping?.(false);
    }
  };

  /**
   * Handle text input changes and broadcast typing indicators, throttled:
   * typing=true at most once per TYPING_THROTTLE_MS, typing=false after
   * TYPING_THROTTLE_MS of inactivity.
   */
  const handleChange = (e) => {
    setText(e.target.value);
    if (!onTyping) return;

    const now = Date.now();
    if (e.target.value && now - lastTypingSentRef.current >= TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      onTyping(true);
    }
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, TYPING_THROTTLE_MS);
  };

  /**
   * Send the message on Enter (without Shift).
   * Shift+Enter inserts a new line.
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Send the current message and clear the input.
   */
  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onSendMessage(trimmed);
    setText('');

    // Sending ends this typing burst (receivers clear the indicator when the
    // message arrives); the next keystroke starts a new one immediately.
    stopTyping();

    // Re-focus the input after sending
    inputRef.current?.focus();
  };

  /**
   * Handle file selection via the hidden file input.
   */
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="chat-input-container">
      {/* Typing indicator display */}
      <div className="typing-indicator">
        {typingText && (
          <span className="animate-pulse">{typingText}</span>
        )}
      </div>

      <div className="chat-input-wrapper">
        {/* File attachment button */}
        {onFileUpload && (
          <label style={{ cursor: 'pointer', flexShrink: 0 }}>
            <input
              id={fileInputId}
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <span className="btn btn-icon btn-ghost" title="Attach file">
              📎
            </span>
          </label>
        )}

        {/* Text input */}
        <textarea
          ref={inputRef}
          className="chat-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
        />

        {/* Send button */}
        <button
          className="btn btn-icon btn-primary"
          onClick={handleSend}
          disabled={!text.trim()}
          title="Send message"
          style={{ opacity: text.trim() ? 1 : 0.5 }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
