import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import { schema } from '../db/index.js';

export type ConfigRecord = Record<string, unknown>;

function readYamlConfig(filePath: string): ConfigRecord {
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = yaml.load(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ConfigRecord;
    }
    return {};
  } catch {
    return {};
  }
}

export class ConfigService {
  constructor(
    private database: AppDatabase,
    private globalConfigPath: string,
  ) {}

  readGlobalFileConfig(): ConfigRecord {
    return readYamlConfig(this.globalConfigPath);
  }

  readProjectFileConfig(projectPath: string): ConfigRecord {
    return readYamlConfig(path.join(projectPath, '.agent-shepherd.yml'));
  }

  /**
   * Get all global config entries from the DB as a key-value object.
   */
  getGlobalDbConfig(): ConfigRecord {
    const rows = this.database.select().from(schema.globalConfig).all();
    const result: ConfigRecord = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  /**
   * Get all project-specific config entries from the DB.
   */
  getProjectDbConfig(projectId: string): ConfigRecord {
    const rows = this.database
      .select()
      .from(schema.projectConfig)
      .where(eq(schema.projectConfig.projectId, projectId))
      .all();
    const result: ConfigRecord = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  /**
   * Set (upsert) a global config key in the DB.
   */
  setGlobalDbConfig(key: string, value: string): void {
    this.database
      .insert(schema.globalConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: schema.globalConfig.key,
        set: { value },
      })
      .run();
  }

  /**
   * Set (upsert) a project config key in the DB.
   */
  setProjectDbConfig(projectId: string, key: string, value: string): void {
    this.database
      .insert(schema.projectConfig)
      .values({ projectId, key, value })
      .onConflictDoUpdate({
        target: [schema.projectConfig.projectId, schema.projectConfig.key],
        set: { value },
      })
      .run();
  }

  /**
   * Get merged global config: global file + DB overrides.
   * DB entries take precedence over file entries.
   */
  getMergedGlobalConfig(): ConfigRecord {
    const fileConfig = this.readGlobalFileConfig();
    const databaseConfig = this.getGlobalDbConfig();
    return { ...fileConfig, ...databaseConfig };
  }

  /**
   * Get merged project config with three-tier precedence:
   * DB overrides > project file > global file
   */
  getMergedProjectConfig(projectId: string, projectPath: string): ConfigRecord {
    const globalFileConfig = this.readGlobalFileConfig();
    const projectFileConfig = this.readProjectFileConfig(projectPath);
    const projectDatabaseConfig = this.getProjectDbConfig(projectId);
    return {
      ...globalFileConfig,
      ...projectFileConfig,
      ...projectDatabaseConfig,
    };
  }
}
