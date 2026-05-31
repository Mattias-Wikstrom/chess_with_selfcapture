import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as path from 'path';
import * as admin from 'firebase-admin';
import { spawn, type ChildProcess } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import { BOT_PERSONALITIES, formatMovesForPrompt, botAvatarUrl } from './botPersonalities';

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

// Initialise the Admin SDK once (safe to call multiple times in warm instances)
if (!admin.apps.length) admin.initializeApp();
const adminDb = admin.firestore();

// Bump this string on every deploy so logs make it immediately obvious which
// code version a cold-started instance is running.
const ENGINE_VERSION = '2026-05-31-v6-native';

// --------------------------------------------------------------------------
// Stockfish engine wrapper
// --------------------------------------------------------------------------

type PrintFn = (line: string) => void;

interface StockfishModule {
  cwrap: (name: string, ret: null | string, args: string[]) => (...a: unknown[]) => unknown;
  FS: { writeFile: (name: string, data: Uint8Array) => void };
}

// Singleton state — persists across warm invocations on the same instance
let mod: StockfishModule | null = null;
let sfCmd: ((cmd: string) => void) | null = null;
let printHandler: PrintFn | null = null;
let engineReady = false;

// --------------------------------------------------------------------------
// Shared WASM loader — used by both init paths
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeFs = require('fs') as typeof import('fs');

async function loadWasm(): Promise<void> {
  if (mod) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Stockfish = require('../stockfish.js') as (opts: object) => Promise<StockfishModule>;

  mod = await Stockfish({
    print:    (line: string) => { if (printHandler) printHandler(line); },
    printErr: (line: string) => { console.log('[stockfish stderr]', line); },
    locateFile: (file: string) => path.join(__dirname, '..', file),
  });
}

// NNUE filenames — must match the engine's UCI option defaults exactly
const NNUE_BIG   = 'nn-1c0000000000.nnue';
const NNUE_SMALL = 'nn-37f18f62d772.nnue';

/**
 * Returns the /tmp path for a NNUE file, downloading from Firebase Storage
 * if not already cached there.  Warm instances reuse the cached file.
 */
async function getNnuePath(filename: string): Promise<string> {
  const tmpPath = `/tmp/${filename}`;

  // Warm-instance cache: file already in /tmp from a previous cold start
  if (nodeFs.existsSync(tmpPath)) {
    console.log(`[stockfish v${ENGINE_VERSION}] NNUE cache hit: ${tmpPath}`);
    return tmpPath;
  }

  // Download from Firebase Storage (files uploaded once via scripts/upload-nnue.js)
  try {
    const start = Date.now();
    console.log(`[stockfish v${ENGINE_VERSION}] downloading ${filename} from Storage…`);
    await admin.storage().bucket('chesswithselfcapture.firebasestorage.app')
      .file(`nnue/${filename}`).download({ destination: tmpPath });
    console.log(`[stockfish v${ENGINE_VERSION}] downloaded ${filename} in ${Date.now() - start}ms`);
    return tmpPath;
  } catch (e) {
    console.error(`[stockfish v${ENGINE_VERSION}] Storage download failed for ${filename}:`, e);
    throw e;
  }
}

async function runUciHandshake(): Promise<void> {
  const sfInit = mod!.cwrap('stockfish_init', null, []) as () => void;
  sfCmd        = mod!.cwrap('stockfish_cmd',  null, ['string']) as (cmd: string) => void;
  sfInit();

  const uciLines = await waitFor('uci', line => line === 'uciok');
  const evalLines = uciLines.filter(l => l.toLowerCase().includes('evalfile'));
  if (evalLines.length) console.log('[stockfish] NNUE options:', evalLines.join(' | '));

  const readyLines = await waitFor('isready', line => line === 'readyok');
  const nnueLine   = readyLines.find(l => l.toLowerCase().includes('nnue'));
  if (nnueLine) console.log('[stockfish] NNUE loaded:', nnueLine);
  else          console.log('[stockfish] no NNUE confirmation — using classical evaluation');

  engineReady = true;
}

/**
 * Initialise without NNUE — used by getLegalMoves (perft only, no search).
 */
async function initEngine(): Promise<void> {
  if (engineReady) return;
  await loadWasm();
  await runUciHandshake();
  console.log(`[stockfish v${ENGINE_VERSION}] *** NNUE: DISABLED (perft / legal-moves only) ***`);
}

// --------------------------------------------------------------------------
// Native engine — used by botAutoMove and getBestMove
//
// Spawns the self-capture Stockfish binary (x86-64 Linux ELF) downloaded from
// Cloud Storage. Communicates via UCI over stdin/stdout. Supports full NNUE.
// The WASM engine (above) is kept for getLegalMoves (perft only, no NNUE).
// --------------------------------------------------------------------------

let nativeProcess:  ChildProcess | null = null;
let nativeReady     = false;
let nativeHandler:  PrintFn | null      = null;
let nativeLineBuf   = '';

/** Download the native binary from Storage to /tmp and make it executable. */
async function getNativeBinaryPath(): Promise<string> {
  const tmpPath = '/tmp/stockfish-native';
  if (nodeFs.existsSync(tmpPath)) {
    console.log(`[native v${ENGINE_VERSION}] binary cache hit`);
    return tmpPath;
  }
  const start = Date.now();
  console.log(`[native v${ENGINE_VERSION}] downloading binary from Storage…`);
  await admin.storage().bucket('chesswithselfcapture.firebasestorage.app')
    .file('engine/stockfish').download({ destination: tmpPath });
  nodeFs.chmodSync(tmpPath, 0o755);
  console.log(`[native v${ENGINE_VERSION}] downloaded binary in ${Date.now() - start}ms`);
  return tmpPath;
}

/** Send a UCI command to the native process and wait for a terminal line. */
function nativeWaitFor(command: string, terminator: (line: string) => boolean): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    nativeHandler = (line: string) => {
      lines.push(line);
      if (terminator(line)) { nativeHandler = null; resolve(lines); }
    };
    nativeProcess!.stdin!.write(command + '\n');
  });
}

/**
 * Initialise the native engine with NNUE — used by botAutoMove and getBestMove.
 * Downloads the binary and NNUE files from Storage, spawns the process, and
 * confirms NNUE is active.
 */
async function initNativeEngine(): Promise<void> {
  if (nativeReady) return;

  // Download binary + NNUE files in parallel
  const [binaryPath, bigPath, smallPath] = await Promise.all([
    getNativeBinaryPath(),
    getNnuePath(NNUE_BIG),
    getNnuePath(NNUE_SMALL),
  ]);

  // Spawn the native process
  nativeProcess = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

  nativeProcess.stdout!.on('data', (data: Buffer) => {
    nativeLineBuf += data.toString();
    let nl: number;
    while ((nl = nativeLineBuf.indexOf('\n')) !== -1) {
      const line = nativeLineBuf.slice(0, nl).trim();
      nativeLineBuf = nativeLineBuf.slice(nl + 1);
      if (line && nativeHandler) nativeHandler(line);
    }
  });

  nativeProcess.stderr!.on('data', (data: Buffer) => {
    console.log('[native stderr]', data.toString().trim());
  });

  nativeProcess.on('exit', (code) => {
    console.warn(`[native v${ENGINE_VERSION}] process exited with code ${code}`);
    nativeReady = false;
    nativeProcess = null;
  });

  // UCI handshake
  const uciLines = await nativeWaitFor('uci', l => l === 'uciok');
  const evalLines = uciLines.filter(l => l.toLowerCase().includes('evalfile'));
  if (evalLines.length) console.log(`[native v${ENGINE_VERSION}] NNUE options:`, evalLines.join(' | '));

  // Point the engine at the NNUE files
  console.log(`[native v${ENGINE_VERSION}] EvalFile: ${bigPath} | ${smallPath}`);
  nativeProcess.stdin!.write(`setoption name EvalFile value ${bigPath}\n`);
  nativeProcess.stdin!.write(`setoption name EvalFileSmall value ${smallPath}\n`);

  const readyLines = await nativeWaitFor('isready', l => l === 'readyok');
  const nnueLine   = readyLines.find(l => l.toLowerCase().includes('nnue'));
  if (nnueLine) {
    console.log(`[native v${ENGINE_VERSION}] *** NNUE: ENABLED — ${nnueLine.trim()} ***`);
  } else {
    console.warn(`[native v${ENGINE_VERSION}] *** NNUE: NOT CONFIRMED (readyok lines: ${readyLines.join(' | ')}) ***`);
  }

  nativeReady = true;
  console.log(`[native v${ENGINE_VERSION}] engine ready`);
}

/** Apply strength settings to the native engine. */
function applyNativeEngineLevel(level: number) {
  const config = ENGINE_LEVELS[level as keyof typeof ENGINE_LEVELS] ?? ENGINE_LEVELS[5];
  nativeProcess!.stdin!.write('setoption name Threads value 1\n');
  nativeProcess!.stdin!.write('setoption name MultiPV value 1\n');
  if (config.elo === null) {
    nativeProcess!.stdin!.write('setoption name UCI_LimitStrength value false\n');
    nativeProcess!.stdin!.write('setoption name Skill Level value 20\n');
  } else {
    nativeProcess!.stdin!.write('setoption name UCI_LimitStrength value true\n');
    nativeProcess!.stdin!.write(`setoption name UCI_Elo value ${config.elo}\n`);
  }
  return config;
}

/**
 * Send a UCI command and collect all output lines until `terminator` returns true.
 * Works whether Stockfish processes the command synchronously (main thread)
 * or asynchronously (pthread search thread posting back via the event loop).
 */
function waitFor(command: string, terminator: (line: string) => boolean): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    printHandler = (line: string) => {
      lines.push(line);
      if (terminator(line)) {
        printHandler = null;
        resolve(lines);
      }
    };
    sfCmd!(command);
  });
}

// --------------------------------------------------------------------------
// getLegalMoves
//
// Given the move history, returns:
//   legalMoves  – map of from-square → list of UCI to-squares (incl. self-captures)
//   fen         – current FEN string
//   isGameOver  – true if the side to move has no legal moves
//   result      – 'white' | 'black' | 'draw' | null
// --------------------------------------------------------------------------

export const getLegalMoves = onCall(
  {
    concurrency: 1,     // one request at a time per instance (engine is a singleton)
    memory: '1GiB',
    timeoutSeconds: 30,
    cors: true,
  },
  async (request) => {
    const { moves } = request.data as { moves: string[] };

    if (!Array.isArray(moves)) {
      throw new HttpsError('invalid-argument', '"moves" must be an array of UCI strings');
    }

    await initEngine();

    const posCmd = moves.length > 0
      ? `position startpos moves ${moves.join(' ')}`
      : 'position startpos';

    // ── Perft 1 → legal move list ──────────────────────────────────────────
    sfCmd!(posCmd);
    const perftLines = await waitFor('go perft 1', l => l.startsWith('Nodes searched:'));

    const uciMoves: string[] = [];
    let nodeCount = 0;
    for (const line of perftLines) {
      if (line.startsWith('Nodes searched:')) {
        nodeCount = parseInt(line.split(':')[1].trim(), 10);
      } else {
        const m = line.match(/^([a-h][1-8][a-h][1-8][qrbnQRBN]?): \d+$/);
        if (m) uciMoves.push(m[1].toLowerCase());
      }
    }

    // ── "d" command → current FEN + check detection ───────────────────────
    sfCmd!(posCmd);
    const dLines = await waitFor('d', l => l.startsWith('Checkers:'));

    let fen = '';
    let inCheck = false;
    for (const line of dLines) {
      if (line.startsWith('Fen: '))      fen     = line.slice(5).trim();
      if (line.startsWith('Checkers: ')) inCheck = line.trim() !== 'Checkers:';
    }

    // ── Build response ─────────────────────────────────────────────────────
    const legalMoves: Record<string, string[]> = {};
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2);
      (legalMoves[from] ??= []).push(uci);
    }

    const isGameOver = nodeCount === 0;
    let result: 'white' | 'black' | 'draw' | null = null;
    if (isGameOver) {
      if (inCheck) {
        const loserSide = fen.split(' ')[1];
        result = loserSide === 'w' ? 'black' : 'white';
      } else {
        result = 'draw'; // stalemate
      }
    }

    return { legalMoves, fen, isGameOver, result };
  },
);

// --------------------------------------------------------------------------
// Engine level config — shared by getBestMove and botAutoMove
// --------------------------------------------------------------------------

// Self-capture chess has a higher branching factor than standard chess (extra
// captures of own pieces are legal), so depth-based search can take minutes.
// Use movetime (milliseconds) instead — the engine always responds in time.
const ENGINE_LEVELS = {
  1: { elo: 1400 as number | null, movetime: 500  },
  2: { elo: 1600 as number | null, movetime: 500  },
  3: { elo: 1800 as number | null, movetime: 1000 },
  4: { elo: 2000 as number | null, movetime: 1000 },
  5: { elo: 2200 as number | null, movetime: 2000 },
  6: { elo: 2400 as number | null, movetime: 2000 },
  7: { elo: 2650 as number | null, movetime: 4000 },
  8: { elo: null,                  movetime: 8000 },
} as const;

// --------------------------------------------------------------------------
// getBestMove  (callable — for future direct use)
// --------------------------------------------------------------------------

export const getBestMove = onCall(
  {
    concurrency: 1,
    memory: '1GiB',
    timeoutSeconds: 60,
    cors: true,
  },
  async (request) => {
    const { moves, level } = request.data as { moves: string[]; level: number };

    if (!Array.isArray(moves)) {
      throw new HttpsError('invalid-argument', '"moves" must be an array');
    }

    await initNativeEngine();

    const config = applyNativeEngineLevel(level);

    const posCmd = moves.length > 0
      ? `position startpos moves ${moves.join(' ')}`
      : 'position startpos';
    nativeProcess!.stdin!.write(posCmd + '\n');

    const lines = await nativeWaitFor(
      `go movetime ${config.movetime}`,
      l => l.startsWith('bestmove'),
    );

    const bestLine = lines.find(l => l.startsWith('bestmove'));
    const bestMove = bestLine?.split(' ')[1] ?? '(none)';

    return { bestMove };
  },
);

// --------------------------------------------------------------------------
// chatWithBot
//
// Sends a player message to a named bot and returns a reply in character.
// The bot's personality and the current game state are injected into the
// Claude system prompt so replies are contextually grounded.
//
// Requires the ANTHROPIC_API_KEY Firebase secret to be set:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
// --------------------------------------------------------------------------

interface AnthropicHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const chatWithBot = onCall(
  {
    concurrency: 10,
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
    secrets: [anthropicKey],
  },
  async (request) => {
    const {
      botName,
      moves,
      playerColor,
      fen,
      userMessage,
      chatHistory,
    } = request.data as {
      botName: string;
      moves: string[];
      playerColor: 'w' | 'b';
      fen: string;
      userMessage: string;
      chatHistory: AnthropicHistoryMessage[];
    };

    if (!botName || typeof userMessage !== 'string' || !userMessage.trim()) {
      throw new HttpsError('invalid-argument', 'botName and userMessage are required');
    }

    const personality = BOT_PERSONALITIES[botName];
    if (!personality) {
      throw new HttpsError('invalid-argument', `Unknown bot: ${botName}`);
    }

    const colorLabel   = playerColor === 'w' ? 'White' : 'Black';
    const moveStr      = formatMovesForPrompt(Array.isArray(moves) ? moves : []);
    const fenStr       = fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const systemPrompt = [
      `You are ${botName}, a chess bot with a specific personality: ${personality.description}`,
      '',
      `You are playing a game of **self-capture chess** — a variant where capturing your own pieces is a completely legal move. This opens unusual tactical possibilities. Your moves are calculated automatically by the Stockfish engine, but you speak as if every decision is your own. When asked why you made a move, rationalise it confidently and in character.`,
      '',
      `You are playing as **${colorLabel}**.`,
      `Current position (FEN): ${fenStr}`,
      `Move history (UCI notation): ${moveStr}`,
      '',
      `Keep all responses concise: 2–5 sentences maximum. Stay entirely in character.`,
    ].join('\n');

    // Build the messages array for Anthropic.
    // chatHistory contains the prior exchange; we append the new user message.
    const safeHistory: AnthropicHistoryMessage[] = Array.isArray(chatHistory) ? chatHistory : [];

    // Anthropic requires messages to start with 'user' and strictly alternate.
    // Drop any leading assistant messages to be safe.
    const trimmed = safeHistory.slice();
    while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed.shift();

    const messages: AnthropicHistoryMessage[] = [
      ...trimmed,
      { role: 'user', content: userMessage.trim() },
    ];

    const client = new Anthropic({ apiKey: anthropicKey.value() });

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 350,
      system:     systemPrompt,
      messages,
    });

    const reply =
      response.content[0]?.type === 'text'
        ? response.content[0].text
        : '…';

    return { reply };
  },
);

// --------------------------------------------------------------------------
// toggleBot  (admin-only)
//
// Signs a named bot in or out by writing / deleting its presence doc.
// The presence doc uses a far-future lastSeen so it always passes the
// "online within 90 s" client-side filter without needing a heartbeat.
//
// The caller must have isAdmin: true in their users/{uid} Firestore doc.
// --------------------------------------------------------------------------

// Year 2286 — comfortably beyond any real lastSeen value
const FAR_FUTURE = admin.firestore.Timestamp.fromMillis(9_999_999_999_999);

export const toggleBot = onCall(
  {
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    // Verify admin
    const callerDoc = await adminDb.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || !callerDoc.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin only');
    }

    const { botName, online } = request.data as { botName: string; online: boolean };

    const personality = BOT_PERSONALITIES[botName];
    if (!personality) {
      throw new HttpsError('invalid-argument', `Unknown bot: "${botName}"`);
    }

    const uid = `bot_${botName.replace(/\s+/g, '_')}`;

    if (online) {
      const avatarUrl = botAvatarUrl(botName);

      // Upsert the user profile so the bot appears in player chips
      await adminDb.collection('users').doc(uid).set({
        displayName: botName,
        photoURL:    avatarUrl,
        isBot:       true,
        level:       personality.level,
      }, { merge: true });

      // Write presence — far-future lastSeen means no heartbeat needed
      await adminDb.collection('presence').doc(uid).set({
        uid,
        displayName: botName,
        photoURL:    avatarUrl,
        isBot:       true,
        level:       personality.level,
        online:      true,
        lastSeen:    FAR_FUTURE,
      });
    } else {
      await adminDb.collection('presence').doc(uid).delete();
    }

    return { success: true, uid };
  },
);

// --------------------------------------------------------------------------
// botAutoMove — Firestore trigger
//
// Fires whenever a game document is written. If it is the bot's turn in an
// active game, asks the Stockfish engine for the best move and appends it.
// The human client's existing getLegalMoves + finishGame flow handles
// game-over detection — the bot just needs to keep playing.
// --------------------------------------------------------------------------

function applyEngineLevel(level: number) {
  const config = ENGINE_LEVELS[level as keyof typeof ENGINE_LEVELS] ?? ENGINE_LEVELS[5];
  sfCmd!('setoption name Threads value 1');
  sfCmd!('setoption name MultiPV value 1');
  if (config.elo === null) {
    sfCmd!('setoption name UCI_LimitStrength value false');
    sfCmd!('setoption name Skill Level value 20');
  } else {
    sfCmd!('setoption name UCI_LimitStrength value true');
    sfCmd!(`setoption name UCI_Elo value ${config.elo}`);
  }
  return config;
}

export const botAutoMove = onDocumentWritten(
  {
    document:       'games/{gameId}',
    memory:         '1GiB',
    timeoutSeconds: 60,
    concurrency:    1,   // engine is a singleton — process one game at a time
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;   // document deleted — nothing to do

    const data    = after.data()!;
    const gameId  = event.params.gameId;
    const moves   = (data.moves   as string[]) ?? [];
    const status  = data.status   as string;
    const whiteUid = data.whiteUid as string;
    const blackUid = (data.blackUid ?? '') as string;

    if (status !== 'active') return;

    const botIsWhite = whiteUid.startsWith('bot_');
    const botIsBlack = blackUid.startsWith('bot_');
    if (!botIsWhite && !botIsBlack) return;   // no bot in this game

    const isWhiteTurn = moves.length % 2 === 0;
    const isBotTurn   = (isWhiteTurn && botIsWhite) || (!isWhiteTurn && botIsBlack);
    if (!isBotTurn) return;

    // Resolve bot identity
    const botDisplayName = (isWhiteTurn ? data.whiteDisplayName : data.blackDisplayName) as string;
    const personality    = BOT_PERSONALITIES[botDisplayName];
    if (!personality) {
      console.warn(`[botAutoMove] No personality for "${botDisplayName}" — skipping`);
      return;
    }

    // Initialise native engine with NNUE (no-op on warm instances)
    await initNativeEngine();
    const config = applyNativeEngineLevel(personality.level);

    const posCmd = moves.length > 0
      ? `position startpos moves ${moves.join(' ')}`
      : 'position startpos';
    nativeProcess!.stdin!.write(posCmd + '\n');

    const lines = await nativeWaitFor(
      `go movetime ${config.movetime}`,
      l => l.startsWith('bestmove'),
    );

    // Log any NNUE-related lines and the final evaluation to diagnose eval quality
    const nnueLines  = lines.filter(l => l.toLowerCase().includes('nnue'));
    const lastInfo   = lines.filter(l => l.startsWith('info depth')).at(-1) ?? '';
    if (nnueLines.length) console.log(`[botAutoMove] NNUE search output: ${nnueLines.join(' | ')}`);
    console.log(`[botAutoMove] final eval: ${lastInfo}`);

    const bestLine = lines.find(l => l.startsWith('bestmove'));
    const bestMove = bestLine?.split(' ')[1];

    if (!bestMove || bestMove === '(none)') {
      console.log(`[botAutoMove] ${botDisplayName} has no legal moves in ${gameId} — game over`);
      return;
    }

    // Use a transaction to append the move.
    //
    // IMPORTANT: do NOT use arrayUnion here. arrayUnion deduplicates by value
    // across the entire array, so if the same UCI string (e.g. "d7d6") appears
    // earlier in the game it will NOT be appended again — causing an infinite
    // trigger loop. A transaction with a plain array spread is the correct fix.
    //
    // The transaction also guards against concurrent invocations (at-least-once
    // delivery): if another instance already appended a move, moves.length will
    // differ and the transaction aborts cleanly.
    const gameRef = adminDb.collection('games').doc(gameId);
    try {
      await adminDb.runTransaction(async (txn) => {
        const snap = await txn.get(gameRef);
        const current = snap.data();
        if (!current || current.status !== 'active') throw new Error('skip');
        if ((current.moves as string[]).length !== moves.length) throw new Error('stale');

        txn.update(gameRef, {
          moves:     [...(current.moves as string[]), bestMove],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      console.log(`[botAutoMove] ${botDisplayName} played ${bestMove} in game ${gameId}`);
    } catch (err) {
      console.log(`[botAutoMove] skipped (${(err as Error).message})`);
    }
  },
);
