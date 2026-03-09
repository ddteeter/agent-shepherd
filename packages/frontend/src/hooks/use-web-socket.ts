import { useEffect, useRef, useState } from 'react';
import { getSessionToken } from '../session-token.js';

interface WSMessage {
  event: string;
  data: unknown;
}

export function useWebSocket(onMessage?: (message: WSMessage) => void) {
  const wsReference = useRef<WebSocket | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const onMessageReference = useRef(onMessage);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    onMessageReference.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    function connect() {
      const protocol =
        globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = encodeURIComponent(getSessionToken());
      const ws = new WebSocket(
        `${protocol}//${globalThis.location.host}/ws?token=${token}`,
      );

      ws.addEventListener('open', () => {
        setConnected(true);
      });
      ws.addEventListener('close', () => {
        setConnected(false);
        if (wsReference.current === ws) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      });
      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data)) as WSMessage;
          onMessageReference.current?.(message);
        } catch {
          // ignore malformed messages
        }
      });

      wsReference.current = ws;
    }

    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsReference.current?.close();
    };
  }, []);

  return { connected };
}
