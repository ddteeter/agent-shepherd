import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createTestServer, jsonBody, jsonArrayBody } from './helpers.js';

async function createTestRepo(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), 'shepherd-e2e-'));

  execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', {
    cwd: repoPath,
    stdio: 'pipe',
  });
  execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'pipe' });

  await mkdir(path.join(repoPath, 'src'), { recursive: true });
  await writeFile(
    path.join(repoPath, 'src', 'index.ts'),
    'export const VERSION = "1.0.0";\n',
  );
  await writeFile(
    path.join(repoPath, 'src', 'utils.ts'),
    'export function add(a: number, b: number) {\n  return a + b;\n}\n',
  );
  execSync('git add . && git commit -m "initial commit"', {
    cwd: repoPath,
    stdio: 'pipe',
  });

  execSync('git checkout -b feat/add-multiply', {
    cwd: repoPath,
    stdio: 'pipe',
  });
  await writeFile(
    path.join(repoPath, 'src', 'utils.ts'),
    'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}\n',
  );
  await writeFile(
    path.join(repoPath, 'src', 'index.ts'),
    'export const VERSION = "1.1.0";\nexport { add, multiply } from "./utils";\n',
  );
  execSync('git add . && git commit -m "add multiply function"', {
    cwd: repoPath,
    stdio: 'pipe',
  });

  return repoPath;
}

describe('E2E: Full PR Review Workflow', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await createTestRepo();
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it('exercises the full review lifecycle: register -> submit -> comment -> request-changes -> agent-respond -> ready -> approve', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'e2e-project', path: repoPath },
    });
    expect(projectResponse.statusCode).toBe(201);
    const project = jsonBody(projectResponse);
    expect(project.name).toBe('e2e-project');
    expect(project.path).toBe(repoPath);
    expect(project.baseBranch).toBe('main');
    const projectId = project.id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Add multiply function',
        description: 'Adds a multiply utility and re-exports from index',
        sourceBranch: 'feat/add-multiply',
      },
    });
    expect(prResponse.statusCode).toBe(201);
    const pr = jsonBody(prResponse);
    expect(pr.title).toBe('Add multiply function');
    expect(pr.status).toBe('open');
    expect(pr.sourceBranch).toBe('feat/add-multiply');
    expect(pr.baseBranch).toBe('main');
    const prId = pr.id as string;

    const prGetResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}`,
    });
    expect(prGetResponse.statusCode).toBe(200);
    expect(jsonBody(prGetResponse).status).toBe('open');

    const cyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    expect(cyclesResponse.statusCode).toBe(200);
    const cycles = jsonArrayBody(cyclesResponse);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].cycleNumber).toBe(1);
    expect(cycles[0].status).toBe('pending_review');

    const diffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff`,
    });
    expect(diffResponse.statusCode).toBe(200);
    const diff = jsonBody(diffResponse);
    expect(diff.diff).toContain('+export function multiply');
    expect(diff.diff).toContain('-export const VERSION = "1.0.0"');
    expect(diff.diff).toContain('+export const VERSION = "1.1.0"');
    expect(diff.files).toContain('src/utils.ts');
    expect(diff.files).toContain('src/index.ts');

    const comment1Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 5,
        endLine: 7,
        body: 'Please add input validation for multiply - what about NaN?',
        type: 'must-fix',
        author: 'human',
      },
    });
    expect(comment1Response.statusCode).toBe(201);
    const comment1 = jsonBody(comment1Response);
    expect(comment1.type).toBe('must-fix');
    expect(comment1.author).toBe('human');

    const comment2Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 2,
        endLine: 2,
        body: 'Consider using a barrel export pattern instead',
        type: 'suggestion',
        author: 'human',
      },
    });
    expect(comment2Response.statusCode).toBe(201);
    expect(jsonBody(comment2Response).type).toBe('suggestion');

    const comment3Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 3,
        body: 'Add JSDoc comments to the add function too while you are at it',
        type: 'request',
        author: 'human',
      },
    });
    expect(comment3Response.statusCode).toBe(201);
    expect(jsonBody(comment3Response).type).toBe('request');

    const commentsResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(commentsResponse.statusCode).toBe(200);
    const allComments = jsonArrayBody(commentsResponse);
    expect(allComments).toHaveLength(3);
    const types = allComments.map((c) => String(c.type));
    types.sort((a, b) => a.localeCompare(b));
    expect(types).toEqual(['must-fix', 'request', 'suggestion']);

    const reviewResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    expect(reviewResponse.statusCode).toBe(200);
    expect(jsonBody(reviewResponse).status).toBe('changes_requested');

    const prAfterReviewResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}`,
    });
    expect(prAfterReviewResponse.statusCode).toBe(200);
    expect(jsonBody(prAfterReviewResponse).status).toBe('open');

    const cyclesAfterReviewResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const cyclesAfterReview = jsonArrayBody(cyclesAfterReviewResponse);
    expect(cyclesAfterReview).toHaveLength(1);
    expect(cyclesAfterReview[0].status).toBe('changes_requested');
    expect(cyclesAfterReview[0].reviewedAt).toBeTruthy();

    const batchResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [
          {
            filePath: 'src/utils.ts',
            startLine: 5,
            endLine: 7,
            body: 'Added NaN guard: throws TypeError if inputs are not finite numbers',
            type: 'suggestion',
          },
        ],
        replies: [
          {
            parentCommentId: comment1.id,
            body: 'Done - added isFinite() checks before multiply. See updated code.',
          },
          {
            parentCommentId: jsonBody(comment3Response).id,
            body: 'Added JSDoc comments to both add and multiply functions.',
          },
        ],
      },
    });
    expect(batchResponse.statusCode).toBe(201);
    expect(jsonBody(batchResponse).created).toBe(3);

    const commentsAfterBatchResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(jsonArrayBody(commentsAfterBatchResponse)).toHaveLength(6);

    const agentReadyResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(agentReadyResponse.statusCode).toBe(200);
    const newCycle = jsonBody(agentReadyResponse);
    expect(newCycle.cycleNumber).toBe(2);
    expect(newCycle.status).toBe('pending_review');

    const cyclesAfterReadyResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const cyclesAfterReady = jsonArrayBody(cyclesAfterReadyResponse);
    expect(cyclesAfterReady).toHaveLength(2);

    const cycle1 = cyclesAfterReady.find((c) => c.cycleNumber === 1);
    const cycle2 = cyclesAfterReady.find((c) => c.cycleNumber === 2);
    expect(cycle1?.status).toBe('changes_requested');
    expect(cycle1?.agentCompletedAt).toBeTruthy();
    expect(cycle2?.status).toBe('pending_review');

    const snapshotDiffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(snapshotDiffResponse.statusCode).toBe(200);
    const snapshotDiff = jsonBody(snapshotDiffResponse);
    expect(snapshotDiff.isSnapshot).toBe(true);
    expect(snapshotDiff.cycleNumber).toBe(2);
    expect(snapshotDiff.diff).toContain('+export function multiply');
    expect(snapshotDiff.files).toContain('src/utils.ts');

    const cycleDetailsResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(cycleDetailsResponse.statusCode).toBe(200);
    const cycleDetails = jsonArrayBody(cycleDetailsResponse);
    expect(cycleDetails).toHaveLength(2);
    const cycle2Details = cycleDetails.find((c) => c.cycleNumber === 2);
    expect(cycle2Details?.hasDiffSnapshot).toBe(true);

    const approveResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'approve' },
    });
    expect(approveResponse.statusCode).toBe(200);
    expect(jsonBody(approveResponse).status).toBe('approved');

    const prFinalResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}`,
    });
    expect(prFinalResponse.statusCode).toBe(200);
    expect(jsonBody(prFinalResponse).status).toBe('approved');

    const finalCyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const finalCycles = jsonArrayBody(finalCyclesResponse);
    expect(finalCycles).toHaveLength(2);
    const finalCycle2 = finalCycles.find((c) => c.cycleNumber === 2);
    expect(finalCycle2?.status).toBe('approved');
    expect(finalCycle2?.reviewedAt).toBeTruthy();
  });
});

describe('E2E: Config System', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await createTestRepo();
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it('sets and retrieves global config values via the API', async () => {
    const set1Response = await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'reviewModel', value: 'claude-opus-4' },
    });
    expect(set1Response.statusCode).toBe(200);

    const set2Response = await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'maxRetries', value: '5' },
    });
    expect(set2Response.statusCode).toBe(200);

    const getResponse = await inject({ method: 'GET', url: '/api/config' });
    expect(getResponse.statusCode).toBe(200);
    const config = jsonBody(getResponse);
    expect(config.reviewModel).toBe('claude-opus-4');
    expect(config.maxRetries).toBe('5');
  });

  it('sets and retrieves project config values with merge precedence', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'config-test', path: repoPath },
    });
    expect(projectResponse.statusCode).toBe(201);
    const projectId = jsonBody(projectResponse).id as string;

    const setProjectResponse = await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'reviewModel', value: 'project-model' },
    });
    expect(setProjectResponse.statusCode).toBe(200);

    await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'baseBranch', value: 'develop' },
    });

    const getProjectResponse = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    expect(getProjectResponse.statusCode).toBe(200);
    const projectConfig = jsonBody(getProjectResponse);

    expect(projectConfig.reviewModel).toBe('project-model');
    expect(projectConfig.baseBranch).toBe('develop');

    await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'globalOnlyKey', value: 'global-value' },
    });

    const globalResponse = await inject({ method: 'GET', url: '/api/config' });
    expect(jsonBody(globalResponse).globalOnlyKey).toBe('global-value');

    const projectConfigAfter = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    expect(jsonBody(projectConfigAfter).globalOnlyKey).toBeUndefined();

    await writeFile(
      path.join(repoPath, '.agent-shepherd.yml'),
      'reviewModel: file-model\nfileOnlyKey: from-file\n',
    );

    const projectConfigWithFile = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    const merged = jsonBody(projectConfigWithFile);

    expect(merged.reviewModel).toBe('project-model');
    expect(merged.fileOnlyKey).toBe('from-file');
    expect(merged.baseBranch).toBe('develop');
  });

  it('updates existing config values', async () => {
    await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'theme', value: 'light' },
    });

    await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'theme', value: 'dark' },
    });

    const getResponse = await inject({ method: 'GET', url: '/api/config' });
    expect(jsonBody(getResponse).theme).toBe('dark');
  });
});

describe('E2E: Multiple Review Cycles', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await createTestRepo();
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it('goes through 3 review cycles and verifies cycle history and diff snapshots', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'multi-cycle', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Multi-cycle PR',
        description: 'Testing multiple review cycles',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = jsonBody(prResponse).id as string;

    let cyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const cyclesData = jsonArrayBody(cyclesResponse);
    expect(cyclesData).toHaveLength(1);
    expect(cyclesData[0].cycleNumber).toBe(1);
    expect(cyclesData[0].status).toBe('pending_review');

    const review1Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    expect(jsonBody(review1Response).status).toBe('changes_requested');

    const ready1Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(jsonBody(ready1Response).cycleNumber).toBe(2);
    expect(jsonBody(ready1Response).status).toBe('pending_review');

    cyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    expect(jsonArrayBody(cyclesResponse)).toHaveLength(2);

    const review2Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    expect(jsonBody(review2Response).status).toBe('changes_requested');

    const ready2Response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(jsonBody(ready2Response).cycleNumber).toBe(3);
    expect(jsonBody(ready2Response).status).toBe('pending_review');

    cyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    expect(jsonArrayBody(cyclesResponse)).toHaveLength(3);

    const approveResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'approve' },
    });
    expect(jsonBody(approveResponse).status).toBe('approved');

    cyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const allCycles = jsonArrayBody(cyclesResponse);
    expect(allCycles).toHaveLength(3);

    allCycles.sort(
      (a, b) => (a.cycleNumber as number) - (b.cycleNumber as number),
    );
    expect(allCycles[0].cycleNumber).toBe(1);
    expect(allCycles[0].status).toBe('changes_requested');
    expect(allCycles[0].agentCompletedAt).toBeTruthy();

    expect(allCycles[1].cycleNumber).toBe(2);
    expect(allCycles[1].status).toBe('changes_requested');
    expect(allCycles[1].agentCompletedAt).toBeTruthy();

    expect(allCycles[2].cycleNumber).toBe(3);
    expect(allCycles[2].status).toBe('approved');
    expect(allCycles[2].reviewedAt).toBeTruthy();

    const detailsResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(detailsResponse.statusCode).toBe(200);
    const details = jsonArrayBody(detailsResponse);
    expect(details).toHaveLength(3);

    details.sort(
      (a, b) => (a.cycleNumber as number) - (b.cycleNumber as number),
    );
    expect(details[0].hasDiffSnapshot).toBe(true);
    expect(details[1].hasDiffSnapshot).toBe(true);
    expect(details[2].hasDiffSnapshot).toBe(true);

    const snapshot2Response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(snapshot2Response.statusCode).toBe(200);
    expect(jsonBody(snapshot2Response).isSnapshot).toBe(true);
    expect(jsonBody(snapshot2Response).diff).toContain(
      '+export function multiply',
    );

    const snapshot3Response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=3`,
    });
    expect(snapshot3Response.statusCode).toBe(200);
    expect(jsonBody(snapshot3Response).isSnapshot).toBe(true);
    expect(jsonBody(snapshot3Response).diff).toContain(
      '+export function multiply',
    );

    const snapshot1Response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(snapshot1Response.statusCode).toBe(200);
    expect(jsonBody(snapshot1Response).isSnapshot).toBe(true);

    const finalPrResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}`,
    });
    expect(jsonBody(finalPrResponse).status).toBe('approved');
  });

  it('adds comments in different cycles and retrieves them all', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'comment-cycles', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Comment across cycles',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = jsonBody(prResponse).id as string;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 1,
        body: 'Cycle 1 comment A',
        type: 'must-fix',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 5,
        endLine: 7,
        body: 'Cycle 1 comment B',
        type: 'request',
        author: 'human',
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'Cycle 2 comment',
        type: 'suggestion',
        author: 'human',
      },
    });

    const allCommentsResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(allCommentsResponse.statusCode).toBe(200);
    const allComments = jsonArrayBody(allCommentsResponse);
    expect(allComments).toHaveLength(3);

    const bodies = allComments.map((c) => String(c.body));
    bodies.sort((a, b) => a.localeCompare(b));
    expect(bodies).toEqual([
      'Cycle 1 comment A',
      'Cycle 1 comment B',
      'Cycle 2 comment',
    ]);
  });

  it('supports threaded replies within batch comments', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'thread-test', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Thread test PR',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = jsonBody(prResponse).id as string;

    const humanResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 5,
        endLine: 7,
        body: 'This function needs error handling',
        type: 'must-fix',
        author: 'human',
      },
    });
    const humanCommentId = jsonBody(humanResponse).id as string;

    const batchResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [],
        replies: [
          {
            parentCommentId: humanCommentId,
            body: 'Added try/catch wrapper - see updated diff',
          },
        ],
      },
    });
    expect(batchResponse.statusCode).toBe(201);
    expect(jsonBody(batchResponse).created).toBe(1);

    const allResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const allComments = jsonArrayBody(allResponse);
    expect(allComments).toHaveLength(2);

    const reply = allComments.find((c) => c.parentCommentId === humanCommentId);
    expect(reply).toBeDefined();
    expect(reply?.body).toBe('Added try/catch wrapper - see updated diff');
    expect(reply?.author).toBe('agent');
    expect(reply?.filePath).toBe('src/utils.ts');
    expect(reply?.startLine).toBe(5);
    expect(reply?.endLine).toBe(7);
  });

  it('resolves comments during the review flow', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'resolve-test', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Resolve test PR',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = jsonBody(prResponse).id as string;

    const commentResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 1,
        body: 'Need to fix this',
        type: 'must-fix',
        author: 'human',
      },
    });
    const commentId = jsonBody(commentResponse).id as string;
    expect(jsonBody(commentResponse).resolved).toBe(false);

    const resolveResponse = await inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { resolved: true },
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(jsonBody(resolveResponse).resolved).toBe(true);

    const allResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const resolved = jsonArrayBody(allResponse).find((c) => c.id === commentId);
    expect(resolved?.resolved).toBe(true);
  });

  it('stores file groups on initial PR submission and returns them in diff response', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'fg-project', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const fileGroups = [
      {
        name: 'Core Changes',
        description: 'Main utility updates',
        files: ['src/utils.ts'],
      },
      {
        name: 'Exports',
        description: 'Re-export updates',
        files: ['src/index.ts'],
      },
    ];

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'PR with file groups',
        sourceBranch: 'feat/add-multiply',
        fileGroups,
      },
    });
    expect(prResponse.statusCode).toBe(201);
    const prId = jsonBody(prResponse).id as string;

    const diffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(diffResponse.statusCode).toBe(200);
    expect(jsonBody(diffResponse).fileGroups).toEqual(fileGroups);
  });

  it('requires file groups on agent-ready if previous cycle had them', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'fg-ready-project', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const fileGroups = [
      { name: 'Utils', files: ['src/utils.ts'] },
      { name: 'Index', files: ['src/index.ts'] },
    ];

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'PR needing groups on ready',
        sourceBranch: 'feat/add-multiply',
        fileGroups,
      },
    });
    const prId = jsonBody(prResponse).id as string;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    const readyResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
      payload: {},
    });
    expect(readyResponse.statusCode).toBe(400);
    expect(jsonBody(readyResponse).error).toContain('file groups');

    const readyResponse2 = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
      payload: {
        fileGroups: [
          { name: 'Utils', files: ['src/utils.ts'] },
          { name: 'Index', files: ['src/index.ts'] },
        ],
      },
    });
    expect(readyResponse2.statusCode).toBe(200);

    const diffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(diffResponse.statusCode).toBe(200);
    expect(jsonBody(diffResponse).fileGroups).toEqual([
      { name: 'Utils', files: ['src/utils.ts'] },
      { name: 'Index', files: ['src/index.ts'] },
    ]);
  });

  it('allows agent-ready without file groups when previous cycle had none', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'fg-no-groups-project', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'PR without groups',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = jsonBody(prResponse).id as string;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    const readyResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
      payload: {},
    });
    expect(readyResponse.statusCode).toBe(200);
  });

  it('returns file groups via dedicated endpoint', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'fg-endpoint-project', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const fileGroups = [
      {
        name: 'Utils',
        description: 'Utility functions',
        files: ['src/utils.ts'],
      },
      { name: 'Index', files: ['src/index.ts'] },
    ];

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'PR for file-groups endpoint',
        sourceBranch: 'feat/add-multiply',
        fileGroups,
      },
    });
    const prId = jsonBody(prResponse).id as string;

    const fileGroupsResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups`,
    });
    expect(fileGroupsResponse.statusCode).toBe(200);
    expect(jsonBody(fileGroupsResponse).fileGroups).toEqual(fileGroups);
    expect(jsonBody(fileGroupsResponse).cycleNumber).toBe(1);

    const fileGroupsResponse2 = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups?cycle=1`,
    });
    expect(fileGroupsResponse2.statusCode).toBe(200);
    expect(jsonBody(fileGroupsResponse2).fileGroups).toEqual(fileGroups);

    const prResponse2 = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'PR without groups',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId2 = jsonBody(prResponse2).id as string;
    const fileGroupsResponse3 = await inject({
      method: 'GET',
      url: `/api/prs/${prId2}/file-groups`,
    });
    expect(fileGroupsResponse3.statusCode).toBe(200);
    expect(jsonBody(fileGroupsResponse3).fileGroups).toBeUndefined();
  });

  it('returns inter-cycle diff showing only changes between cycles', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'inter-diff', path: repoPath },
    });
    const projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Inter-diff test',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = jsonBody(prResponse).id as string;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    execSync('git checkout feat/add-multiply', {
      cwd: repoPath,
      stdio: 'pipe',
    });
    await writeFile(
      path.join(repoPath, 'src', 'utils.ts'),
      'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}\n\nexport function subtract(a: number, b: number) {\n  return a - b;\n}\n',
    );
    execSync('git add . && git commit -m "add subtract function"', {
      cwd: repoPath,
      stdio: 'pipe',
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    const interDiffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=2`,
    });
    expect(interDiffResponse.statusCode).toBe(200);
    const interDiff = jsonBody(interDiffResponse);
    expect(interDiff.diff).toContain('+export function subtract');
    expect(interDiff.isInterCycleDiff).toBe(true);
  });
});
