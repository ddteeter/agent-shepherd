import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';

export type ConfigRecord = Record<string, unknown>;

export class ConfigService {
  constructor(
    private database: any,
    private globalConfigPath: string,
  ) {}

  /**
   * Read the global config file (~/.agent-shepherd/config.yml).
   * Returns empty object if the file doesn't exist or can't be parsed.
   */
  readGlobalFileConfig(): ConfigRecord {
    try {
      const content = readFileSync(this.globalConfigPath, 'utf-8');
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ConfigRecord;
      }
      return {};
    } catch {
      return {};
    }
  }

  /**
   * Read the per-project config file (.agent-shepherd.yml in repo root).
   * Returns empty object if the file doesn't exist or can't be parsed.
   */
  readProjectFileConfig(projectPath: string): ConfigRecord {
    try {
      const filePath = join(projectPath, '.agent-shepherd.yml');
      const content = readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ConfigRecord;
      }
      return {};
    } catch {
      return {};
    }
  }

  /**
   * Get all global config entries from the DB as a key-value object.
   */
  getGlobalDbConfig(): ConfigRecord {
    const rows = this.db.select().from(schema.globalConfig).all();
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
    const rows = this.db
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
    this.db
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
    this.db
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
    return { ...globalFileConfig, ...projectFileConfig, ...projectDatabaseConfig };
  }
}
