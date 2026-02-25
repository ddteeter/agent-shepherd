import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { createDb } from '../../db/index.js';
import { schema } from '../../db/index.js';
import { ConfigService } from '../config.js';

describe('ConfigService', () => {
  let tmpDir: string;
  let db: ReturnType<typeof createDb>['db'];
  let sqlite: ReturnType<typeof createDb>['sqlite'];
  let configService: ConfigService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'shepherd-config-test-'));
    const result = createDb(':memory:');
    db = result.db;
    sqlite = result.sqlite;
  });

  afterEach(async () => {
    sqlite.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('readGlobalFileConfig', () => {
    it('returns empty object when global config file does not exist', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));
      const config = configService.readGlobalFileConfig();
      expect(config).toEqual({});
    });

    it('reads and parses global YAML config file', async () => {
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.yml'), 'reviewModel: claude-3\nmaxRetries: 3\n');

      configService = new ConfigService(db, join(configDir, 'config.yml'));
      const config = configService.readGlobalFileConfig();
      expect(config).toEqual({ reviewModel: 'claude-3', maxRetries: 3 });
    });

    it('returns empty object for invalid YAML', async () => {
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.yml'), ': : invalid:\nyaml\n  bad');

      configService = new ConfigService(db, join(configDir, 'config.yml'));
      const config = configService.readGlobalFileConfig();
      expect(config).toEqual({});
    });
  });

  describe('readProjectFileConfig', () => {
    it('returns empty object when project config file does not exist', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));
      const config = configService.readProjectFileConfig('/nonexistent/path');
      expect(config).toEqual({});
    });

    it('reads and parses project .shepherd.yml file', async () => {
      const projectDir = join(tmpDir, 'my-project');
      await mkdir(projectDir, { recursive: true });
      await writeFile(join(projectDir, '.shepherd.yml'), 'baseBranch: develop\nautoReview: true\n');

      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));
      const config = configService.readProjectFileConfig(projectDir);
      expect(config).toEqual({ baseBranch: 'develop', autoReview: true });
    });
  });

  describe('getGlobalDbConfig', () => {
    it('returns empty object when no DB config entries exist', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));
      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({});
    });

    it('returns DB config entries as key-value object', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      db.insert(schema.globalConfig).values({ key: 'reviewModel', value: 'gpt-4' }).run();
      db.insert(schema.globalConfig).values({ key: 'maxRetries', value: '5' }).run();

      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({ reviewModel: 'gpt-4', maxRetries: '5' });
    });
  });

  describe('getProjectDbConfig', () => {
    it('returns empty object when no project DB config entries exist', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      // Create a project first
      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'test-project',
        path: '/tmp/test-project',
      }).run();

      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({});
    });

    it('returns project-specific DB config entries', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'test-project',
        path: '/tmp/test-project',
      }).run();

      db.insert(schema.projectConfig).values({ projectId: 'proj-1', key: 'baseBranch', value: 'staging' }).run();
      db.insert(schema.projectConfig).values({ projectId: 'proj-1', key: 'autoReview', value: 'false' }).run();

      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({ baseBranch: 'staging', autoReview: 'false' });
    });
  });

  describe('setGlobalDbConfig', () => {
    it('inserts a new global config key', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      configService.setGlobalDbConfig('reviewModel', 'claude-3');
      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({ reviewModel: 'claude-3' });
    });

    it('updates an existing global config key', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      configService.setGlobalDbConfig('reviewModel', 'claude-3');
      configService.setGlobalDbConfig('reviewModel', 'gpt-4');

      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({ reviewModel: 'gpt-4' });
    });
  });

  describe('setProjectDbConfig', () => {
    it('inserts a new project config key', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'test-project',
        path: '/tmp/test-project',
      }).run();

      configService.setProjectDbConfig('proj-1', 'baseBranch', 'develop');
      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({ baseBranch: 'develop' });
    });

    it('updates an existing project config key', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));

      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'test-project',
        path: '/tmp/test-project',
      }).run();

      configService.setProjectDbConfig('proj-1', 'baseBranch', 'develop');
      configService.setProjectDbConfig('proj-1', 'baseBranch', 'staging');

      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({ baseBranch: 'staging' });
    });
  });

  describe('getMergedGlobalConfig', () => {
    it('merges global file config with DB overrides (DB wins)', async () => {
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.yml'),
        'reviewModel: claude-3\nmaxRetries: 3\nlogLevel: info\n'
      );

      configService = new ConfigService(db, join(configDir, 'config.yml'));

      // DB override for reviewModel
      configService.setGlobalDbConfig('reviewModel', 'gpt-4');
      configService.setGlobalDbConfig('newKey', 'newValue');

      const config = configService.getMergedGlobalConfig();
      expect(config).toEqual({
        reviewModel: 'gpt-4',   // DB wins over file
        maxRetries: 3,           // file value preserved
        logLevel: 'info',        // file value preserved
        newKey: 'newValue',      // DB-only value included
      });
    });

    it('returns only file config when no DB entries exist', async () => {
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.yml'), 'reviewModel: claude-3\n');

      configService = new ConfigService(db, join(configDir, 'config.yml'));
      const config = configService.getMergedGlobalConfig();
      expect(config).toEqual({ reviewModel: 'claude-3' });
    });

    it('returns only DB config when no file exists', () => {
      configService = new ConfigService(db, join(tmpDir, '.shepherd', 'config.yml'));
      configService.setGlobalDbConfig('reviewModel', 'gpt-4');

      const config = configService.getMergedGlobalConfig();
      expect(config).toEqual({ reviewModel: 'gpt-4' });
    });
  });

  describe('getMergedProjectConfig', () => {
    it('merges all three tiers with correct precedence (DB > project file > global file)', async () => {
      // Set up global file
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.yml'),
        'reviewModel: claude-3\nmaxRetries: 3\nglobalOnly: fromGlobal\n'
      );

      // Set up project file
      const projectDir = join(tmpDir, 'my-project');
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        join(projectDir, '.shepherd.yml'),
        'reviewModel: project-model\nbaseBranch: develop\nprojectOnly: fromProject\n'
      );

      configService = new ConfigService(db, join(configDir, 'config.yml'));

      // Create project in DB
      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'my-project',
        path: projectDir,
      }).run();

      // DB overrides
      configService.setProjectDbConfig('proj-1', 'reviewModel', 'db-model');
      configService.setProjectDbConfig('proj-1', 'dbOnly', 'fromDb');

      const config = configService.getMergedProjectConfig('proj-1', projectDir);
      expect(config).toEqual({
        reviewModel: 'db-model',       // DB wins over both
        maxRetries: 3,                  // global file value
        globalOnly: 'fromGlobal',       // global file only
        baseBranch: 'develop',          // project file value
        projectOnly: 'fromProject',     // project file only
        dbOnly: 'fromDb',              // DB only
      });
    });

    it('merges global + project file when no DB entries exist', async () => {
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.yml'), 'reviewModel: claude-3\n');

      const projectDir = join(tmpDir, 'my-project');
      await mkdir(projectDir, { recursive: true });
      await writeFile(join(projectDir, '.shepherd.yml'), 'baseBranch: develop\n');

      configService = new ConfigService(db, join(configDir, 'config.yml'));

      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'my-project',
        path: projectDir,
      }).run();

      const config = configService.getMergedProjectConfig('proj-1', projectDir);
      expect(config).toEqual({
        reviewModel: 'claude-3',
        baseBranch: 'develop',
      });
    });

    it('project file overrides global file', async () => {
      const configDir = join(tmpDir, '.shepherd');
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.yml'), 'reviewModel: global-model\n');

      const projectDir = join(tmpDir, 'my-project');
      await mkdir(projectDir, { recursive: true });
      await writeFile(join(projectDir, '.shepherd.yml'), 'reviewModel: project-model\n');

      configService = new ConfigService(db, join(configDir, 'config.yml'));

      db.insert(schema.projects).values({
        id: 'proj-1',
        name: 'my-project',
        path: projectDir,
      }).run();

      const config = configService.getMergedProjectConfig('proj-1', projectDir);
      expect(config).toEqual({ reviewModel: 'project-model' });
    });
  });
});
