import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase } from '../../db/index.js';
import { schema } from '../../db/index.js';
import { ConfigService } from '../config.js';

describe('ConfigService', () => {
  let temporaryDirectory: string;
  let database: ReturnType<typeof createDatabase>['db'];
  let sqlite: ReturnType<typeof createDatabase>['sqlite'];
  let configService: ConfigService;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'shepherd-config-test-'),
    );
    const result = createDatabase(':memory:');
    database = result.db;
    sqlite = result.sqlite;
  });

  afterEach(async () => {
    sqlite.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  describe('readGlobalFileConfig', () => {
    it('returns empty object when global config file does not exist', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );
      const config = configService.readGlobalFileConfig();
      expect(config).toEqual({});
    });

    it('reads and parses global YAML config file', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        'reviewModel: claude-3\nmaxRetries: 3\n',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );
      const config = configService.readGlobalFileConfig();
      expect(config).toEqual({ reviewModel: 'claude-3', maxRetries: 3 });
    });

    it('returns empty object for invalid YAML', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        ': : invalid:\nyaml\n  bad',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );
      const config = configService.readGlobalFileConfig();
      expect(config).toEqual({});
    });
  });

  describe('readProjectFileConfig', () => {
    it('returns empty object when project config file does not exist', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );
      const config = configService.readProjectFileConfig('/nonexistent/path');
      expect(config).toEqual({});
    });

    it('reads and parses project .agent-shepherd.yml file', async () => {
      const projectDirectory = path.join(temporaryDirectory, 'my-project');
      await mkdir(projectDirectory, { recursive: true });
      await writeFile(
        path.join(projectDirectory, '.agent-shepherd.yml'),
        'baseBranch: develop\nautoReview: true\n',
      );

      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );
      const config = configService.readProjectFileConfig(projectDirectory);
      expect(config).toEqual({ baseBranch: 'develop', autoReview: true });
    });
  });

  describe('getGlobalDbConfig', () => {
    it('returns empty object when no DB config entries exist', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );
      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({});
    });

    it('returns DB config entries as key-value object', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      database
        .insert(schema.globalConfig)
        .values({ key: 'reviewModel', value: 'gpt-4' })
        .run();
      database
        .insert(schema.globalConfig)
        .values({ key: 'maxRetries', value: '5' })
        .run();

      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({ reviewModel: 'gpt-4', maxRetries: '5' });
    });
  });

  describe('getProjectDbConfig', () => {
    it('returns empty object when no project DB config entries exist', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'test-project',
          path: '/tmp/test-project',
        })
        .run();

      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({});
    });

    it('returns project-specific DB config entries', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'test-project',
          path: '/tmp/test-project',
        })
        .run();

      database
        .insert(schema.projectConfig)
        .values({ projectId: 'proj-1', key: 'baseBranch', value: 'staging' })
        .run();
      database
        .insert(schema.projectConfig)
        .values({ projectId: 'proj-1', key: 'autoReview', value: 'false' })
        .run();

      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({ baseBranch: 'staging', autoReview: 'false' });
    });
  });

  describe('setGlobalDbConfig', () => {
    it('inserts a new global config key', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      configService.setGlobalDbConfig('reviewModel', 'claude-3');
      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({ reviewModel: 'claude-3' });
    });

    it('updates an existing global config key', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      configService.setGlobalDbConfig('reviewModel', 'claude-3');
      configService.setGlobalDbConfig('reviewModel', 'gpt-4');

      const config = configService.getGlobalDbConfig();
      expect(config).toEqual({ reviewModel: 'gpt-4' });
    });
  });

  describe('setProjectDbConfig', () => {
    it('inserts a new project config key', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'test-project',
          path: '/tmp/test-project',
        })
        .run();

      configService.setProjectDbConfig('proj-1', 'baseBranch', 'develop');
      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({ baseBranch: 'develop' });
    });

    it('updates an existing project config key', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'test-project',
          path: '/tmp/test-project',
        })
        .run();

      configService.setProjectDbConfig('proj-1', 'baseBranch', 'develop');
      configService.setProjectDbConfig('proj-1', 'baseBranch', 'staging');

      const config = configService.getProjectDbConfig('proj-1');
      expect(config).toEqual({ baseBranch: 'staging' });
    });
  });

  describe('getMergedGlobalConfig', () => {
    it('merges global file config with DB overrides (DB wins)', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        'reviewModel: claude-3\nmaxRetries: 3\nlogLevel: info\n',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );

      configService.setGlobalDbConfig('reviewModel', 'gpt-4');
      configService.setGlobalDbConfig('newKey', 'newValue');

      const config = configService.getMergedGlobalConfig();
      expect(config).toEqual({
        reviewModel: 'gpt-4',
        maxRetries: 3,
        logLevel: 'info',
        newKey: 'newValue',
      });
    });

    it('returns only file config when no DB entries exist', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        'reviewModel: claude-3\n',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );
      const config = configService.getMergedGlobalConfig();
      expect(config).toEqual({ reviewModel: 'claude-3' });
    });

    it('returns only DB config when no file exists', () => {
      configService = new ConfigService(
        database,
        path.join(temporaryDirectory, '.agent-shepherd', 'config.yml'),
      );
      configService.setGlobalDbConfig('reviewModel', 'gpt-4');

      const config = configService.getMergedGlobalConfig();
      expect(config).toEqual({ reviewModel: 'gpt-4' });
    });
  });

  describe('getMergedProjectConfig', () => {
    it('merges all three tiers with correct precedence (DB > project file > global file)', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        'reviewModel: claude-3\nmaxRetries: 3\nglobalOnly: fromGlobal\n',
      );

      const projectDirectory = path.join(temporaryDirectory, 'my-project');
      await mkdir(projectDirectory, { recursive: true });
      await writeFile(
        path.join(projectDirectory, '.agent-shepherd.yml'),
        'reviewModel: project-model\nbaseBranch: develop\nprojectOnly: fromProject\n',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'my-project',
          path: projectDirectory,
        })
        .run();

      configService.setProjectDbConfig('proj-1', 'reviewModel', 'db-model');
      configService.setProjectDbConfig('proj-1', 'dbOnly', 'fromDb');

      const config = configService.getMergedProjectConfig(
        'proj-1',
        projectDirectory,
      );
      expect(config).toEqual({
        reviewModel: 'db-model',
        maxRetries: 3,
        globalOnly: 'fromGlobal',
        baseBranch: 'develop',
        projectOnly: 'fromProject',
        dbOnly: 'fromDb',
      });
    });

    it('merges global + project file when no DB entries exist', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        'reviewModel: claude-3\n',
      );

      const projectDirectory = path.join(temporaryDirectory, 'my-project');
      await mkdir(projectDirectory, { recursive: true });
      await writeFile(
        path.join(projectDirectory, '.agent-shepherd.yml'),
        'baseBranch: develop\n',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'my-project',
          path: projectDirectory,
        })
        .run();

      const config = configService.getMergedProjectConfig(
        'proj-1',
        projectDirectory,
      );
      expect(config).toEqual({
        reviewModel: 'claude-3',
        baseBranch: 'develop',
      });
    });

    it('project file overrides global file', async () => {
      const configDirectory = path.join(temporaryDirectory, '.agent-shepherd');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(
        path.join(configDirectory, 'config.yml'),
        'reviewModel: global-model\n',
      );

      const projectDirectory = path.join(temporaryDirectory, 'my-project');
      await mkdir(projectDirectory, { recursive: true });
      await writeFile(
        path.join(projectDirectory, '.agent-shepherd.yml'),
        'reviewModel: project-model\n',
      );

      configService = new ConfigService(
        database,
        path.join(configDirectory, 'config.yml'),
      );

      database
        .insert(schema.projects)
        .values({
          id: 'proj-1',
          name: 'my-project',
          path: projectDirectory,
        })
        .run();

      const config = configService.getMergedProjectConfig(
        'proj-1',
        projectDirectory,
      );
      expect(config).toEqual({ reviewModel: 'project-model' });
    });
  });
});
