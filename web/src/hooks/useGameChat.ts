import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ChatMessage {
  id:          string;
  uid:         string;
  displayName: string;
  photoURL:    string;
  text:        string;
  isBot:       boolean;
  createdAt:   number;
}

interface AnthropicMessage {
  role:    'user' | 'assistant';
  content: string;
}

interface ChatWithBotRequest {
  botName:      string;
  moves:        string[];
  playerColor:  'w' | 'b';
  fen:          string;
  userMessage:  string;
  chatHistory:  AnthropicMessage[];
}

interface ChatWithBotResult {
  reply: string;
}

// --------------------------------------------------------------------------
// Singleton Functions instance
// --------------------------------------------------------------------------

let fnInstance: ReturnType<typeof getFunctions> | null = null;
function getFnInstance() {
  if (!fnInstance) fnInstance = getFunctions(app);
  return fnInstance;
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------

/**
 * Manages the live chat for a game.
 *
 * For human-vs-human games, call `sendMessage` — it writes directly to Firestore.
 * For bot games, call `sendBotMessage` — it calls the `chatWithBot` Cloud Function
 * and stores both the player's message and the bot reply in Firestore.
 */
export function useGameChat(gameId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending,  setSending]  = useState(false);

  // Live listener on the messages subcollection
  useEffect(() => {
    const q = query(
      collection(db, 'games', gameId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200),
    );

    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id:          d.id,
            uid:         data.uid         as string,
            displayName: data.displayName as string,
            photoURL:    data.photoURL    as string,
            text:        data.text        as string,
            isBot:       data.isBot       as boolean,
            createdAt:   data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : 0,
          };
        }),
      );
    });
  }, [gameId]);

  // ── Human message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (
    text:        string,
    uid:         string,
    displayName: string,
    photoURL:    string,
  ) => {
    if (!text.trim()) return;
    await addDoc(collection(db, 'games', gameId, 'messages'), {
      uid,
      displayName,
      photoURL,
      text:      text.trim(),
      isBot:     false,
      createdAt: serverTimestamp(),
    });
  }, [gameId]);

  // ── Bot message (calls Cloud Function, stores both sides) ──────────────────

  const sendBotMessage = useCallback(async (opts: {
    text:        string;
    uid:         string;
    displayName: string;
    photoURL:    string;
    botName:     string;
    botPicture:  string;
    moves:       string[];
    playerColor: 'w' | 'b';
    fen:         string;
  }) => {
    const { text, uid, displayName, photoURL,
            botName, botPicture, moves, playerColor, fen } = opts;

    if (!text.trim() || sending) return;
    setSending(true);

    try {
      // Persist the player's message immediately
      await addDoc(collection(db, 'games', gameId, 'messages'), {
        uid,
        displayName,
        photoURL,
        text:      text.trim(),
        isBot:     false,
        createdAt: serverTimestamp(),
      });

      // Build the prior exchange as Anthropic-format history
      const chatHistory: AnthropicMessage[] = messages
        .filter((m) => m.createdAt > 0)
        .map((m) => ({
          role:    m.isBot ? 'assistant' as const : 'user' as const,
          content: m.text,
        }));

      // Ask the bot
      const fn = httpsCallable<ChatWithBotRequest, ChatWithBotResult>(
        getFnInstance(),
        'chatWithBot',
      );
      const { data } = await fn({
        botName,
        moves,
        playerColor,
        fen,
        userMessage: text.trim(),
        chatHistory,
      });

      // Persist the bot reply
      await addDoc(collection(db, 'games', gameId, 'messages'), {
        uid:         `bot_${botName.replace(/\s+/g, '_')}`,
        displayName: botName,
        photoURL:    botPicture,
        text:        data.reply,
        isBot:       true,
        createdAt:   serverTimestamp(),
      });
    } finally {
      setSending(false);
    }
  }, [gameId, messages, sending]);

  return { messages, sending, sendMessage, sendBotMessage };
}
