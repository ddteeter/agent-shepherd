import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from './helpers.js';


/**
 * Helper: create a temporary git repository with an initial commit on main
 * and a feature branch with changes for diff testing.
 */
async function createTestRepo(): Promise<string> {
  const repoPath = await mkdtemp(join(tmpdir(), 'shepherd-e2e-'));

  execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'pipe' });

  // Create initial files on main
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await writeFile(join(repoPath, 'src', 'index.ts'), 'export const VERSION = "1.0.0";\n');
  await writeFile(join(repoPath, 'src', 'utils.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
  execSync('git add . && git commit -m "initial commit"', { cwd: repoPath, stdio: 'pipe' });

  // Create a feature branch with changes
  execSync('git checkout -b feat/add-multiply', { cwd: repoPath, stdio: 'pipe' });
  await writeFile(
    join(repoPath, 'src', 'utils.ts'),
    'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}\n',
  );
  await writeFile(join(repoPath, 'src', 'index.ts'), 'export const VERSION = "1.1.0";\nexport { add, multiply } from "./utils";\n');
  execSync('git add . && git commit -m "add multiply function"', { cwd: repoPath, stdio: 'pipe' });

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
    // ---------------------------------------------------------------
    // Step 1: Register the project
    // ---------------------------------------------------------------
    const projectRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'e2e-project', path: repoPath },
    });
    expect(projectRes.statusCode).toBe(201);
    const project = projectRes.json();
    expect(project.name).toBe('e2e-project');
    expect(project.path).toBe(repoPath);
    expect(project.baseBranch).toBe('main');
    const projectId = project.id;

    // ---------------------------------------------------------------
    // Step 2: Submit a PR from the feature branch
    // ---------------------------------------------------------------
    const prRes = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Add multiply function',
        description: 'Adds a multiply utility and re-exports from index',
        sourceBranch: 'feat/add-multiply',
      },
    });
    expect(prRes.statusCode).toBe(201);
    const pr = prRes.json();
    expect(pr.title).toBe('Add multiply function');
    expect(pr.status).toBe('open');
    expect(pr.sourceBranch).toBe('feat/add-multiply');
    expect(pr.baseBranch).toBe('main');
    const prId = pr.id;

    // ---------------------------------------------------------------
    // Step 3: Verify the PR was created with status 'open' and has a
    //         first review cycle
    // ---------------------------------------------------------------
    const prGetRes = await inject({ method: 'GET', url: `/api/prs/${prId}` });
    expect(prGetRes.statusCode).toBe(200);
    expect(prGetRes.json().status).toBe('open');

    const cyclesRes = await inject({ method: 'GET', url: `/api/prs/${prId}/cycles` });
    expect(cyclesRes.statusCode).toBe(200);
    const cycles = cyclesRes.json();
    expect(cycles).toHaveLength(1);
    expect(cycles[0].cycleNumber).toBe(1);
    expect(cycles[0].status).toBe('pending_review');

    // ---------------------------------------------------------------
    // Step 4: Get the diff and verify it contains expected changes
    // ---------------------------------------------------------------
    const diffRes = await inject({ method: 'GET', url: `/api/prs/${prId}/diff` });
    expect(diffRes.statusCode).toBe(200);
    const diff = diffRes.json();
    expect(diff.diff).toContain('+export function multiply');
    expect(diff.diff).toContain('-export const VERSION = "1.0.0"');
    expect(diff.diff).toContain('+export const VERSION = "1.1.0"');
    expect(diff.files).toContain('src/utils.ts');
    expect(diff.files).toContain('src/index.ts');

    // ---------------------------------------------------------------
    // Step 5: Add inline comments (human reviewer) with different
    //         severities
    // ---------------------------------------------------------------
    const comment1Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 5,
        endLine: 7,
        body: 'Please add input validation for multiply - what about NaN?',
        severity: 'must-fix',
        author: 'human',
      },
    });
    expect(comment1Res.statusCode).toBe(201);
    const comment1 = comment1Res.json();
    expect(comment1.severity).toBe('must-fix');
    expect(comment1.author).toBe('human');

    const comment2Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 2,
        endLine: 2,
        body: 'Consider using a barrel export pattern instead',
        severity: 'suggestion',
        author: 'human',
      },
    });
    expect(comment2Res.statusCode).toBe(201);
    expect(comment2Res.json().severity).toBe('suggestion');

    const comment3Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 3,
        body: 'Add JSDoc comments to the add function too while you are at it',
        severity: 'request',
        author: 'human',
      },
    });
    expect(comment3Res.statusCode).toBe(201);
    expect(comment3Res.json().severity).toBe('request');

    // ---------------------------------------------------------------
    // Step 6: Verify comments were stored
    // ---------------------------------------------------------------
    const commentsRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(commentsRes.statusCode).toBe(200);
    const allComments = commentsRes.json();
    expect(allComments).toHaveLength(3);
    const severities = allComments.map((c: any) => c.severity).sort();
    expect(severities).toEqual(['must-fix', 'request', 'suggestion']);

    // ---------------------------------------------------------------
    // Step 7: Submit review with 'request-changes'
    // ---------------------------------------------------------------
    const reviewRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().status).toBe('changes_requested');

    // ---------------------------------------------------------------
    // Step 8: Verify PR is still 'open' and cycle status is
    //         'changes_requested'
    // ---------------------------------------------------------------
    const prAfterReviewRes = await inject({ method: 'GET', url: `/api/prs/${prId}` });
    expect(prAfterReviewRes.statusCode).toBe(200);
    // PR status remains 'open' (only 'approve' changes it to 'approved')
    expect(prAfterReviewRes.json().status).toBe('open');

    const cyclesAfterReviewRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const cyclesAfterReview = cyclesAfterReviewRes.json();
    expect(cyclesAfterReview).toHaveLength(1);
    expect(cyclesAfterReview[0].status).toBe('changes_requested');
    expect(cyclesAfterReview[0].reviewedAt).toBeTruthy();

    // ---------------------------------------------------------------
    // Step 9: Simulate agent responding: batch comments (replies +
    //         new comments as 'agent')
    // ---------------------------------------------------------------
    const batchRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [
          {
            filePath: 'src/utils.ts',
            startLine: 5,
            endLine: 7,
            body: 'Added NaN guard: throws TypeError if inputs are not finite numbers',
            severity: 'suggestion',
          },
        ],
        replies: [
          {
            parentCommentId: comment1.id,
            body: 'Done - added isFinite() checks before multiply. See updated code.',
          },
          {
            parentCommentId: comment3Res.json().id,
            body: 'Added JSDoc comments to both add and multiply functions.',
          },
        ],
      },
    });
    expect(batchRes.statusCode).toBe(201);
    // 1 new comment + 2 replies = 3 created
    expect(batchRes.json().created).toBe(3);

    // Verify total comments now (3 original + 3 batch = 6)
    const commentsAfterBatchRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(commentsAfterBatchRes.json()).toHaveLength(6);

    // ---------------------------------------------------------------
    // Step 10: Signal agent-ready
    // ---------------------------------------------------------------
    const agentReadyRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(agentReadyRes.statusCode).toBe(200);
    const newCycle = agentReadyRes.json();
    expect(newCycle.cycleNumber).toBe(2);
    expect(newCycle.status).toBe('pending_review');

    // ---------------------------------------------------------------
    // Step 11: Verify new cycle was created (cycle 2)
    // ---------------------------------------------------------------
    const cyclesAfterReadyRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const cyclesAfterReady = cyclesAfterReadyRes.json();
    expect(cyclesAfterReady).toHaveLength(2);

    const cycle1 = cyclesAfterReady.find((c: any) => c.cycleNumber === 1);
    const cycle2 = cyclesAfterReady.find((c: any) => c.cycleNumber === 2);
    expect(cycle1.status).toBe('changes_requested');
    expect(cycle1.agentCompletedAt).toBeTruthy();
    expect(cycle2.status).toBe('pending_review');

    // ---------------------------------------------------------------
    // Step 12: Verify diff snapshot was stored for cycle 2
    // ---------------------------------------------------------------
    const snapshotDiffRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(snapshotDiffRes.statusCode).toBe(200);
    const snapshotDiff = snapshotDiffRes.json();
    expect(snapshotDiff.isSnapshot).toBe(true);
    expect(snapshotDiff.cycleNumber).toBe(2);
    expect(snapshotDiff.diff).toContain('+export function multiply');
    expect(snapshotDiff.files).toContain('src/utils.ts');

    // Also verify via cycles/details endpoint
    const cycleDetailsRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(cycleDetailsRes.statusCode).toBe(200);
    const cycleDetails = cycleDetailsRes.json();
    expect(cycleDetails).toHaveLength(2);
    const cycle2Details = cycleDetails.find((c: any) => c.cycleNumber === 2);
    expect(cycle2Details.hasDiffSnapshot).toBe(true);

    // ---------------------------------------------------------------
    // Step 13: Add an approval review
    // ---------------------------------------------------------------
    const approveRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'approve' },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().status).toBe('approved');

    // ---------------------------------------------------------------
    // Step 14: Verify PR status is 'approved'
    // ---------------------------------------------------------------
    const prFinalRes = await inject({ method: 'GET', url: `/api/prs/${prId}` });
    expect(prFinalRes.statusCode).toBe(200);
    expect(prFinalRes.json().status).toBe('approved');

    // Verify the latest cycle is also approved
    const finalCyclesRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles`,
    });
    const finalCycles = finalCyclesRes.json();
    expect(finalCycles).toHaveLength(2);
    const finalCycle2 = finalCycles.find((c: any) => c.cycleNumber === 2);
    expect(finalCycle2.status).toBe('approved');
    expect(finalCycle2.reviewedAt).toBeTruthy();
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
    // Set global config values
    const set1Res = await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'reviewModel', value: 'claude-opus-4' },
    });
    expect(set1Res.statusCode).toBe(200);

    const set2Res = await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'maxRetries', value: '5' },
    });
    expect(set2Res.statusCode).toBe(200);

    // Get global config and verify both keys are present
    const getRes = await inject({ method: 'GET', url: '/api/config' });
    expect(getRes.statusCode).toBe(200);
    const config = getRes.json();
    expect(config.reviewModel).toBe('claude-opus-4');
    expect(config.maxRetries).toBe('5');
  });

  it('sets and retrieves project config values with merge precedence', async () => {
    // Register a project first
    const projRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'config-test', path: repoPath },
    });
    expect(projRes.statusCode).toBe(201);
    const projectId = projRes.json().id;

    // Set project config values via PUT /api/projects/:id/config
    const setProjRes = await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'reviewModel', value: 'project-model' },
    });
    expect(setProjRes.statusCode).toBe(200);

    await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'baseBranch', value: 'develop' },
    });

    // Get project config and verify project DB keys are present
    // Note: getMergedProjectConfig merges global file + project file + project DB.
    // Since there's no global config file or .agent-shepherd.yml in the test repo,
    // only project DB config will appear.
    const getProjRes = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    expect(getProjRes.statusCode).toBe(200);
    const projConfig = getProjRes.json();

    expect(projConfig.reviewModel).toBe('project-model');
    expect(projConfig.baseBranch).toBe('develop');

    // Verify that global DB config is separate from project config
    // Set a global config key
    await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'globalOnlyKey', value: 'global-value' },
    });

    // Global config should have it
    const globalRes = await inject({ method: 'GET', url: '/api/config' });
    expect(globalRes.json().globalOnlyKey).toBe('global-value');

    // Project config merge (global file + project file + project DB) does not
    // include global DB entries. So globalOnlyKey is NOT in project config.
    const projConfigAfter = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    expect(projConfigAfter.json().globalOnlyKey).toBeUndefined();

    // Project DB config overrides project file config. To test this,
    // create a .agent-shepherd.yml in the repo with a key that the project DB
    // will override.
    await writeFile(join(repoPath, '.agent-shepherd.yml'), 'reviewModel: file-model\nfileOnlyKey: from-file\n');

    const projConfigWithFile = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    const merged = projConfigWithFile.json();

    // Project DB overrides project file for 'reviewModel'
    expect(merged.reviewModel).toBe('project-model');
    // File-only key is included
    expect(merged.fileOnlyKey).toBe('from-file');
    // Project DB key is still present
    expect(merged.baseBranch).toBe('develop');
  });

  it('updates existing config values', async () => {
    // Set initial value
    await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'theme', value: 'light' },
    });

    // Update value
    await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'theme', value: 'dark' },
    });

    // Verify update
    const getRes = await inject({ method: 'GET', url: '/api/config' });
    expect(getRes.json().theme).toBe('dark');
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
    // Register project and create PR
    const projRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'multi-cycle', path: repoPath },
    });
    const projectId = projRes.json().id;

    const prRes = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Multi-cycle PR',
        description: 'Testing multiple review cycles',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = prRes.json().id;

    // Verify cycle 1 exists
    let cyclesRes = await inject({ method: 'GET', url: `/api/prs/${prId}/cycles` });
    expect(cyclesRes.json()).toHaveLength(1);
    expect(cyclesRes.json()[0].cycleNumber).toBe(1);
    expect(cyclesRes.json()[0].status).toBe('pending_review');

    // --- Cycle 1: request-changes ---
    const review1Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    expect(review1Res.json().status).toBe('changes_requested');

    // Agent signals ready -> creates cycle 2
    const ready1Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(ready1Res.json().cycleNumber).toBe(2);
    expect(ready1Res.json().status).toBe('pending_review');

    // Verify 2 cycles
    cyclesRes = await inject({ method: 'GET', url: `/api/prs/${prId}/cycles` });
    expect(cyclesRes.json()).toHaveLength(2);

    // --- Cycle 2: request-changes ---
    const review2Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    expect(review2Res.json().status).toBe('changes_requested');

    // Agent signals ready -> creates cycle 3
    const ready2Res = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(ready2Res.json().cycleNumber).toBe(3);
    expect(ready2Res.json().status).toBe('pending_review');

    // Verify 3 cycles
    cyclesRes = await inject({ method: 'GET', url: `/api/prs/${prId}/cycles` });
    expect(cyclesRes.json()).toHaveLength(3);

    // --- Cycle 3: approve ---
    const approveRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'approve' },
    });
    expect(approveRes.json().status).toBe('approved');

    // ---------------------------------------------------------------
    // Verify all cycles exist with correct numbers and statuses
    // ---------------------------------------------------------------
    cyclesRes = await inject({ method: 'GET', url: `/api/prs/${prId}/cycles` });
    const allCycles = cyclesRes.json();
    expect(allCycles).toHaveLength(3);

    const sorted = allCycles.sort((a: any, b: any) => a.cycleNumber - b.cycleNumber);
    expect(sorted[0].cycleNumber).toBe(1);
    expect(sorted[0].status).toBe('changes_requested');
    expect(sorted[0].agentCompletedAt).toBeTruthy();

    expect(sorted[1].cycleNumber).toBe(2);
    expect(sorted[1].status).toBe('changes_requested');
    expect(sorted[1].agentCompletedAt).toBeTruthy();

    expect(sorted[2].cycleNumber).toBe(3);
    expect(sorted[2].status).toBe('approved');
    expect(sorted[2].reviewedAt).toBeTruthy();

    // ---------------------------------------------------------------
    // Verify diff snapshots exist for cycles created via agent-ready
    // (cycles 2 and 3)
    // ---------------------------------------------------------------
    const detailsRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(detailsRes.statusCode).toBe(200);
    const details = detailsRes.json();
    expect(details).toHaveLength(3);

    const detailsSorted = details.sort((a: any, b: any) => a.cycleNumber - b.cycleNumber);
    // Cycle 1: has snapshot (created at PR submission)
    expect(detailsSorted[0].hasDiffSnapshot).toBe(true);
    // Cycle 2: has snapshot (created via agent-ready)
    expect(detailsSorted[1].hasDiffSnapshot).toBe(true);
    // Cycle 3: has snapshot (created via agent-ready)
    expect(detailsSorted[2].hasDiffSnapshot).toBe(true);

    // Verify snapshot content for cycle 2
    const snap2Res = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(snap2Res.statusCode).toBe(200);
    expect(snap2Res.json().isSnapshot).toBe(true);
    expect(snap2Res.json().diff).toContain('+export function multiply');

    // Verify snapshot content for cycle 3
    const snap3Res = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=3`,
    });
    expect(snap3Res.statusCode).toBe(200);
    expect(snap3Res.json().isSnapshot).toBe(true);
    expect(snap3Res.json().diff).toContain('+export function multiply');

    // Cycle 1 now has a snapshot (created at PR submission)
    const snap1Res = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(snap1Res.statusCode).toBe(200);
    expect(snap1Res.json().isSnapshot).toBe(true);

    // ---------------------------------------------------------------
    // Verify final PR status is approved
    // ---------------------------------------------------------------
    const finalPrRes = await inject({ method: 'GET', url: `/api/prs/${prId}` });
    expect(finalPrRes.json().status).toBe('approved');
  });

  it('adds comments in different cycles and retrieves them all', async () => {
    // Setup
    const projRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'comment-cycles', path: repoPath },
    });
    const projectId = projRes.json().id;

    const prRes = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Comment across cycles',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = prRes.json().id;

    // Cycle 1: add 2 human comments
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 1,
        body: 'Cycle 1 comment A',
        severity: 'must-fix',
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
        severity: 'request',
        author: 'human',
      },
    });

    // Request changes and advance to cycle 2
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    // Cycle 2: add 1 human comment
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'Cycle 2 comment',
        severity: 'suggestion',
        author: 'human',
      },
    });

    // GET /api/prs/:prId/comments returns all comments across all cycles
    const allCommentsRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(allCommentsRes.statusCode).toBe(200);
    const allComments = allCommentsRes.json();
    expect(allComments).toHaveLength(3);

    const bodies = allComments.map((c: any) => c.body).sort();
    expect(bodies).toEqual([
      'Cycle 1 comment A',
      'Cycle 1 comment B',
      'Cycle 2 comment',
    ]);
  });

  it('supports threaded replies within batch comments', async () => {
    // Setup
    const projRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'thread-test', path: repoPath },
    });
    const projectId = projRes.json().id;

    const prRes = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Thread test PR',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = prRes.json().id;

    // Human adds a comment
    const humanRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 5,
        endLine: 7,
        body: 'This function needs error handling',
        severity: 'must-fix',
        author: 'human',
      },
    });
    const humanCommentId = humanRes.json().id;

    // Agent responds via batch with a reply
    const batchRes = await inject({
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
    expect(batchRes.statusCode).toBe(201);
    expect(batchRes.json().created).toBe(1);

    // Fetch all comments and verify thread relationship
    const allRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const allComments = allRes.json();
    expect(allComments).toHaveLength(2);

    const reply = allComments.find((c: any) => c.parentCommentId === humanCommentId);
    expect(reply).toBeDefined();
    expect(reply.body).toBe('Added try/catch wrapper - see updated diff');
    expect(reply.author).toBe('agent');
    // Reply inherits parent's filePath/startLine/endLine
    expect(reply.filePath).toBe('src/utils.ts');
    expect(reply.startLine).toBe(5);
    expect(reply.endLine).toBe(7);
  });

  it('resolves comments during the review flow', async () => {
    // Setup
    const projRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'resolve-test', path: repoPath },
    });
    const projectId = projRes.json().id;

    const prRes = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Resolve test PR',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = prRes.json().id;

    // Add a comment
    const commentRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/utils.ts',
        startLine: 1,
        endLine: 1,
        body: 'Need to fix this',
        severity: 'must-fix',
        author: 'human',
      },
    });
    const commentId = commentRes.json().id;
    expect(commentRes.json().resolved).toBe(false);

    // Resolve the comment
    const resolveRes = await inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { resolved: true },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().resolved).toBe(true);

    // Verify it persists
    const allRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const resolved = allRes.json().find((c: any) => c.id === commentId);
    expect(resolved.resolved).toBe(true);
  });

  it('returns inter-cycle diff showing only changes between cycles', async () => {
    const projRes = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'inter-diff', path: repoPath },
    });
    const projectId = projRes.json().id;

    const prRes = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Inter-diff test',
        description: '',
        sourceBranch: 'feat/add-multiply',
      },
    });
    const prId = prRes.json().id;

    // Request changes to advance workflow
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    // Make a new commit on the feature branch before signaling ready
    execSync('git checkout feat/add-multiply', { cwd: repoPath, stdio: 'pipe' });
    await writeFile(join(repoPath, 'src', 'utils.ts'),
      'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}\n\nexport function subtract(a: number, b: number) {\n  return a - b;\n}\n'
    );
    execSync('git add . && git commit -m "add subtract function"', { cwd: repoPath, stdio: 'pipe' });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    // Now request inter-cycle diff
    const interDiffRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=2`,
    });
    expect(interDiffRes.statusCode).toBe(200);
    const interDiff = interDiffRes.json();
    expect(interDiff.diff).toContain('+export function subtract');
    expect(interDiff.isInterCycleDiff).toBe(true);
  });
});
