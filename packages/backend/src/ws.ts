import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

// WebSocket is used to push real-time events to the frontend UI, including:
// - pr:created, pr:updated — PR lifecycle changes
// - comment:created — new inline comments
// - review:submitted — human submits approve/request-changes
// - agent:working, agent:completed, agent:error, agent:cancelled — agent status
const clients = new Set<WebSocket>();

export function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === 1) {
      // OPEN
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
