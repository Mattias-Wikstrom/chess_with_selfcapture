import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useGameChat } from '../hooks/useGameChat';
import type { OnlineGame } from '../types';

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

interface GameChatProps {
  game:          OnlineGame;
  myUid:         string;
  myDisplayName: string;
  myPhotoURL:    string;
  // Populated only when the opponent is a bot
  isBot?:      boolean;
  botName?:    string;
  botPicture?: string;
  moves?:      string[];
  myColor?:    'w' | 'b';
  fen?:        string;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export default function GameChat({
  game,
  myUid,
  myDisplayName,
  myPhotoURL,
  isBot     = false,
  botName   = '',
  botPicture = '',
  moves     = [],
  myColor   = 'w',
  fen       = '',
}: GameChatProps) {
  const [open,  setOpen]  = useState(false);
  const [input, setInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const prevLenRef    = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sending, sendMessage, sendBotMessage } = useGameChat(game.id);

  // Track unread count while panel is closed
  useEffect(() => {
    if (!open && messages.length > prevLenRef.current) {
      setUnreadCount((c) => c + messages.length - prevLenRef.current);
    }
    prevLenRef.current = messages.length;
  }, [messages.length, open]);

  // Clear badge when opened
  useEffect(() => {
    if (open) setUnreadCount(0);
  }, [open]);

  // Scroll to bottom on new message (when panel is open)
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // --------------------------------------------------------------------------
  // Send
  // --------------------------------------------------------------------------

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    if (isBot && botName) {
      await sendBotMessage({
        text, uid: myUid, displayName: myDisplayName, photoURL: myPhotoURL,
        botName, botPicture, moves, playerColor: myColor, fen,
      });
    } else {
      await sendMessage(text, myUid, myDisplayName, myPhotoURL);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="game-chat">
      {/* Toggle button */}
      <button
        className="chat-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        💬 Chat
        {unreadCount > 0 && (
          <span className="chat-badge">{unreadCount}</span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel">
          {/* Header */}
          <div className="chat-header">
            <span className="chat-title">
              {isBot && botName ? botName : 'Chat'}
            </span>
            <button
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>

          {/* Message list */}
          <div className="chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">
                {isBot && botName
                  ? `Say something to ${botName}!`
                  : 'No messages yet. Say hi!'}
              </p>
            )}

            {messages.map((msg) => {
              const isMine = msg.uid === myUid;
              return (
                <div
                  key={msg.id}
                  className={`chat-message ${isMine ? 'mine' : 'theirs'}`}
                >
                  {/* Sender info (only on their side) */}
                  {!isMine && (
                    <div className="chat-sender">
                      {msg.photoURL ? (
                        <img src={msg.photoURL} alt="" className="chip-avatar" />
                      ) : (
                        <div className="chip-avatar-placeholder" />
                      )}
                      <span className="chat-name">{msg.displayName}</span>
                    </div>
                  )}
                  <div className={`chat-bubble${msg.isBot ? ' bot-bubble' : ''}`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator while waiting for bot reply */}
            {sending && (
              <div className="chat-message theirs">
                <div className="chat-bubble bot-bubble chat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="chat-input-row">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sending ? 'Waiting for reply…' : 'Type a message… (Enter to send)'}
              rows={1}
              disabled={sending}
            />
            <button
              className="chat-send"
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
