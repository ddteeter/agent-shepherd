import { useEffect, useRef, useCallback, useState } from 'react';
import { getSessionToken } from '../session-token.js';

interface WSMessage {
  event: string;
  data: any;
}

export function useWebSocket(onMessage?: (message: WSMessage) => void) {
  const wsReference = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageReference = useRef(onMessage);
  onMessageReference.current = onMessage;

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = encodeURIComponent(getSessionToken());
    const ws = new WebSocket(
      `${protocol}//${globalThis.location.host}/ws?token=${token}`,
    );

    ws.addEventListener('open', () => { setConnected(true); });
    ws.addEventListener('close', () => {
      setConnected(false);
      // Only reconnect if this WebSocket is still the active one
      if (wsReference.current === ws) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    });
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        onMessageReference.current?.(message);
      } catch {
        // ignore malformed messages
      }
    };

    wsReference.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsReference.current?.close();
    };
  }, [connect]);

  return { connected };
}
