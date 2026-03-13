import type { FastifyInstance } from 'fastify';

interface SocketLike {
  readyState: number;
  send: (message: string) => void;
  on: (event: string, callback: () => void) => void;
}

const clients = new Set<SocketLike>();

export function broadcast(event: string, data: unknown) {
  const message = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

export function websocketPlugin(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket: SocketLike) => {
    clients.add(socket);
    socket.on('close', () => {
      clients.delete(socket);
    });
  });
}
