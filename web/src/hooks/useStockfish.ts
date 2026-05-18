import { useCallback, useEffect, useRef, useState } from 'react';

export type OutputHandler = (line: string) => void;

export interface UseStockfishResult {
  /** True once the engine has sent "uciok" and is accepting commands. */
  isReady: boolean;
  /** True while NNUE network files are being fetched (before isReady). */
  isLoadingNetworks: boolean;
  /** Send a UCI command to the engine (no-op until isReady). */
  send: (cmd: string) => void;
  /**
   * Register a callback that receives every output line from the engine.
   * Returns an unsubscribe function.
   */
  subscribe: (handler: OutputHandler) => () => void;
}

export function useStockfish(): UseStockfishResult {
  const workerRef  = useRef<Worker | null>(null);
  const handlersRef = useRef<Set<OutputHandler>>(new Set());
  const [isReady, setIsReady] = useState(false);
  const [isLoadingNetworks, setIsLoadingNetworks] = useState(false);

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/stockfish.worker.ts', import.meta.url),
      { type: 'classic' },
    );

    worker.onmessage = (e: MessageEvent<string>) => {
      const line = e.data;
      if (line === 'stockfish-loading-networks') {
        setIsLoadingNetworks(true);
        return;
      }
      if (line === 'stockfish-ready') {
        setIsLoadingNetworks(false);
        setIsReady(true);
        return;
      }
      for (const h of handlersRef.current) h(line);
    };

    worker.onerror = (e) => console.error('[stockfish worker]', e);

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback((cmd: string) => {
    workerRef.current?.postMessage(cmd);
  }, []);

  const subscribe = useCallback((handler: OutputHandler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  return { isReady, isLoadingNetworks, send, subscribe };
}
