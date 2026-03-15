import type { FastifyInstance } from 'fastify';
import type {
  CreateCommentInput,
  BatchCommentPayload,
  CommentSummary,
} from '@agent-shepherd/shared';
import { eq, inArray, type InferSelectModel } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { extractFilesFromDiff } from './diff.js';

type ReviewCycleRow = InferSelectModel<typeof schema.reviewCycles>;
type CommentRow = InferSelectModel<typeof schema.comments>;

function findCommentOrFail(database: AppDatabase, id: string) {
  return database
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, id))
    .get();
}

export function buildCommentSummary(
  allComments: CommentRow[],
  cycles: ReviewCycleRow[],
  database: AppDatabase,
): CommentSummary {
  const topLevel = allComments.filter(
    (comment: CommentRow) => !comment.parentCommentId && !comment.resolved,
  );

  const byType: Record<string, number> = {};
  const fileMap = new Map<
    string,
    { count: number; byType: Record<string, number> }
  >();
  let generalCount = 0;

  for (const comment of topLevel) {
    byType[comment.type] = (byType[comment.type] ?? 0) + 1;

    if (comment.filePath) {
      const existing = fileMap.get(comment.filePath) ?? {
        count: 0,
        byType: {},
      };
      existing.count++;
      existing.byType[comment.type] = (existing.byType[comment.type] ?? 0) + 1;
      fileMap.set(comment.filePath, existing);
    } else {
      generalCount++;
    }
  }

  const filePaths = [...fileMap.keys()];
  const diffFileOrder = getDiffFileOrder(cycles, database);
  if (diffFileOrder) {
    const orderMap = new Map(diffFileOrder.map((f, index) => [f, index]));
    filePaths.sort((a, b) => {
      const ai = orderMap.get(a) ?? Number.POSITIVE_INFINITY;
      const bi = orderMap.get(b) ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
  } else {
    filePaths.sort((a, b) => a.localeCompare(b));
  }

  const files = filePaths.map((filePath_) => {
    const entry = fileMap.get(filePath_);
    return {
      path: filePath_,
      count: entry?.count ?? 0,
      byType: entry?.byType ?? {},
    };
  });

  return { total: topLevel.length, byType, files, generalCount };
}

function getDiffFileOrder(
  cycles: ReviewCycleRow[],
  database: AppDatabase,
): string[] | undefined {
  let latestCycle = cycles[0];
  for (const cycle of cycles) {
    if (cycle.cycleNumber > latestCycle.cycleNumber) {
      latestCycle = cycle;
    }
  }
  const snapshot = database
    .select()
    .from(schema.diffSnapshots)
    .where(eq(schema.diffSnapshots.reviewCycleId, latestCycle.id))
    .get();
  if (snapshot) {
    return extractFilesFromDiff(snapshot.diffData);
  }
  return undefined;
}

function getCurrentCycleId(
  database: AppDatabase,
  prId: string,
): string | undefined {
  const cycles = database
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.prId, prId))
    .all();

  if (cycles.length === 0) return undefined;

  let latest = cycles[0];
  for (const cycle of cycles) {
    if (cycle.cycleNumber > latest.cycleNumber) {
      latest = cycle;
    }
  }

  return latest.id;
}

function getCommentSummary(
  database: AppDatabase,
  cycleIds: string[],
  cycles: ReviewCycleRow[],
): CommentSummary {
  if (cycleIds.length === 0) {
    return { total: 0, byType: {}, files: [], generalCount: 0 };
  }
  const allComments = database
    .select()
    .from(schema.comments)
    .where(inArray(schema.comments.reviewCycleId, cycleIds))
    .all();
  return buildCommentSummary(allComments, cycles, database);
}

function getFilteredComments(
  database: AppDatabase,
  cycleIds: string[],
  filePath?: string,
  type?: string,
): CommentRow[] {
  if (cycleIds.length === 0) {
    return [];
  }

  let comments = database
    .select()
    .from(schema.comments)
    .where(inArray(schema.comments.reviewCycleId, cycleIds))
    .all();

  if (filePath) {
    comments = comments.filter(
      (comment: CommentRow) => comment.filePath === filePath,
    );
  }
  if (type) {
    comments = comments.filter((comment: CommentRow) => comment.type === type);
  }

  return comments;
}

function getIgnoredTypes(
  configService: FastifyInstance['configService'],
  projectId: string,
  projectPath: string | undefined,
): string[] {
  const defaultIgnored = ['question'];
  if (!projectPath) return defaultIgnored;

  const config = configService.getMergedProjectConfig(projectId, projectPath);
  const configValue = config.insightsIgnoredTypes;
  if (configValue === undefined) return defaultIgnored;
  if (Array.isArray(configValue)) return configValue as string[];
  if (typeof configValue === 'string')
    return JSON.parse(configValue) as string[];
  return defaultIgnored;
}

export function commentRoutes(fastify: FastifyInstance) {
  const database = fastify.db;

  fastify.get('/api/projects/:projectId/comments/history', (request) => {
    const { projectId } = request.params as { projectId: string };
    const { currentPrId } = request.query as { currentPrId?: string };

    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .get();

    const ignoredTypes = getIgnoredTypes(
      fastify.configService,
      projectId,
      project?.path,
    );

    const prs = database
      .select()
      .from(schema.pullRequests)
      .where(eq(schema.pullRequests.projectId, projectId))
      .all();
    const prIds = prs.map((pullRequest) => pullRequest.id);
    if (prIds.length === 0) return { currentPr: undefined, otherPrs: [] };

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(inArray(schema.reviewCycles.prId, prIds))
      .all();
    const cycleIds = cycles.map((cycle) => cycle.id);
    if (cycleIds.length === 0) return { currentPr: undefined, otherPrs: [] };

    const allComments = database
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();

    const cycleToPr = new Map(cycles.map((cycle) => [cycle.id, cycle.prId]));
    const prTitleMap = new Map(prs.map((pr) => [pr.id, pr.title]));

    const filteredComments = allComments.filter(
      (comment) => !ignoredTypes.includes(comment.type),
    );

    const commentsByPr = new Map<string, CommentRow[]>();
    for (const comment of filteredComments) {
      const commentPrId = cycleToPr.get(comment.reviewCycleId);
      if (!commentPrId) continue;
      const existing = commentsByPr.get(commentPrId) ?? [];
      existing.push(comment);
      commentsByPr.set(commentPrId, existing);
    }

    let currentPr:
      | {
          prId: string;
          prTitle: string;
          comments: CommentRow[];
        }
      | undefined;
    const otherPrs: {
      prId: string;
      prTitle: string;
      comments: CommentRow[];
    }[] = [];

    for (const [groupPrId, comments] of commentsByPr) {
      const entry = {
        prId: groupPrId,
        prTitle: prTitleMap.get(groupPrId) ?? '',
        comments,
      };
      if (groupPrId === currentPrId) {
        currentPr = entry;
      } else {
        otherPrs.push(entry);
      }
    }

    return { currentPr, otherPrs };
  });

  fastify.post('/api/prs/:prId/comments', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const {
      filePath,
      startLine,
      endLine,
      body,
      type,
      author,
      parentCommentId,
    } = request.body as CreateCommentInput;

    const reviewCycleId = getCurrentCycleId(database, prId);
    if (!reviewCycleId) {
      await reply
        .code(404)
        .send({ error: 'No review cycle found for this PR' });
      return;
    }

    const id = randomUUID();
    database
      .insert(schema.comments)
      .values({
        id,
        reviewCycleId,
        filePath,
        startLine,
        endLine,
        body,
        type: type ?? 'suggestion',
        author,
        parentCommentId,
      })
      .run();

    const comment = database
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();

    fastify.broadcast('comment:added', comment);

    if (parentCommentId) {
      const parent = database
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.id, parentCommentId))
        .get();
      if (parent?.resolved) {
        database
          .update(schema.comments)
          .set({ resolved: false })
          .where(eq(schema.comments.id, parentCommentId))
          .run();
        const updatedParent = database
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, parentCommentId))
          .get();
        fastify.broadcast('comment:updated', updatedParent);
      }
    }

    await reply.code(201).send(comment);
  });

  fastify.get('/api/prs/:prId/comments', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { filePath, type, summary } = request.query as {
      filePath?: string;
      type?: string;
      summary?: string;
    };

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();

    const cycleIds = cycles.map((cycle: ReviewCycleRow) => cycle.id);

    if (summary === 'true') {
      await reply.send(getCommentSummary(database, cycleIds, cycles));
      return;
    }

    await reply.send(getFilteredComments(database, cycleIds, filePath, type));
  });

  fastify.put('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      body: string;
      resolved: boolean;
    }>;

    const existing = findCommentOrFail(database, id);
    if (!existing) {
      await reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    database
      .update(schema.comments)
      .set(updates)
      .where(eq(schema.comments.id, id))
      .run();

    return database
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, id))
      .get();
  });

  fastify.delete('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = findCommentOrFail(database, id);
    if (!existing) {
      await reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    database.delete(schema.comments).where(eq(schema.comments.id, id)).run();

    await reply.code(204).send();
  });

  fastify.post('/api/prs/:prId/comments/batch', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { comments, replies } = request.body as BatchCommentPayload;

    const reviewCycleId = getCurrentCycleId(database, prId);
    if (!reviewCycleId) {
      await reply
        .code(404)
        .send({ error: 'No review cycle found for this PR' });
      return;
    }

    let created = 0;

    for (const comment of comments) {
      const id = randomUUID();
      database
        .insert(schema.comments)
        .values({
          id,
          reviewCycleId,
          filePath: comment.filePath,
          startLine: comment.startLine,
          endLine: comment.endLine,
          body: comment.body,
          type: comment.type ?? 'suggestion',
          author: 'agent',
        })
        .run();

      const inserted = database
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.id, id))
        .get();
      fastify.broadcast('comment:added', inserted);
      created++;
    }

    if (replies) {
      for (const replyItem of replies) {
        const parent = database
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, replyItem.parentCommentId))
          .get();

        if (parent) {
          const id = randomUUID();
          database
            .insert(schema.comments)
            .values({
              id,
              reviewCycleId,
              filePath: parent.filePath,
              startLine: parent.startLine,
              endLine: parent.endLine,
              body: replyItem.body,
              type: replyItem.type ?? 'suggestion',
              author: 'agent',
              parentCommentId: replyItem.parentCommentId,
            })
            .run();

          const insertedReply = database
            .select()
            .from(schema.comments)
            .where(eq(schema.comments.id, id))
            .get();
          fastify.broadcast('comment:added', insertedReply);
          created++;

          if (parent.resolved) {
            database
              .update(schema.comments)
              .set({ resolved: false })
              .where(eq(schema.comments.id, replyItem.parentCommentId))
              .run();
            fastify.broadcast('comment:updated', {
              ...parent,
              resolved: false,
            });
          }
        }
      }
    }

    await reply.code(201).send({ created });
  });
}
