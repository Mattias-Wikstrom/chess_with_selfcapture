export type OnlineGameStatus = 'waiting' | 'active' | 'finished';
export type GameResult = 'white' | 'black' | 'draw' | null;

export interface OnlineUser {
  uid: string;
  displayName: string;
  photoURL: string;
  lastSeen: number;
  isBot: boolean;
  level: number;     // 1–8; 0 for human players
}

export interface Invitation {
  id: string;
  fromUid: string;
  fromDisplayName: string;
  fromPicture: string;
  toUid: string;
  gameId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface OnlineGame {
  id: string;
  whiteUid: string;
  blackUid: string | null;
  whiteDisplayName: string;
  blackDisplayName: string | null;
  whitePicture: string;
  blackPicture: string | null;
  /** [whiteUid] when waiting, [whiteUid, blackUid] when active/finished */
  players: string[];
  status: OnlineGameStatus;
  /** Ordered list of UCI moves, e.g. ["e2e4", "e7e5", ...] */
  moves: string[];
  result: GameResult;
  createdAt: number;
  updatedAt: number;
}
