import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

const clients = new Set<WebSocket>();

export function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  }
}

export async function websocketPlugin(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.on('close', () => {
      clients.delete(socket);
    });
  });
}
