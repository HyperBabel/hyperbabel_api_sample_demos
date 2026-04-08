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

import { useState, useRef } from 'react';

/**
 * @param {object} props
 * @param {function} props.onSendMessage   — Called with message text
 * @param {function} [props.onFileUpload]  — Called with File object
 * @param {function} [props.onTyping]      — Called with boolean (typing state)
 * @param {string}   [props.typingText]    — Text showing who is typing
 * @param {string}   [props.placeholder]   — Input placeholder text
 */
export default function ChatInput({
  onSendMessage,
  onFileUpload,
  onTyping,
  typingText = '',
  placeholder = 'Type a message...',
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  /**
   * Handle text input changes and broadcast typing indicators.
   * A 2-second debounce is used: typing=true on keystroke,
   * typing=false after 2 seconds of inactivity.
   */
  const handleChange = (e) => {
    setText(e.target.value);

    // Notify typing start
    if (onTyping) {
      onTyping(true);

      // Clear previous timeout and set a new one
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
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

    // Stop typing indicator immediately after sending
    if (onTyping) {
      clearTimeout(typingTimeoutRef.current);
      onTyping(false);
    }

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
