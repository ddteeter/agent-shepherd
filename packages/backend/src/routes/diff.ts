import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { GitService } from '../services/git.js';

export async function diffRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  fastify.get('/api/prs/:id/diff', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, pr.projectId)).get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const gitService = new GitService(project.path);
    const diff = await gitService.getDiff(pr.baseBranch, pr.sourceBranch);
    const files = await gitService.getChangedFiles(pr.baseBranch, pr.sourceBranch);

    return { diff, files };
  });
}
