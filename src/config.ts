import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import paths from 'env-paths';
import { CliError } from './error.js';

export interface Config {
  auth: { token: string };
  defaults: { workspace_id?: string; output?: string };
  git: { enabled?: boolean; verbose?: boolean };
}

// biome-ignore lint/complexity/noStaticOnlyClass: API spec requires a class
export class ConfigManager {
  static configPath(): string {
    const p = paths('clickup-cli', { suffix: '' });
    return join(p.config, 'config.json');
  }

  static findProjectConfig(start: string): string | null {
    let dir = resolve(start);
    while (true) {
      const candidate = join(dir, '.clickup.json');
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // ignore stat errors, keep walking
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  static load(): Config {
    const projectPath = ConfigManager.findProjectConfig(process.cwd());
    let projectConfig: Config | null = null;
    if (projectPath) {
      projectConfig = ConfigManager.loadFrom(projectPath);
      if (projectConfig.auth?.token) {
        return projectConfig;
      }
    }
    const globalPath = ConfigManager.configPath();
    if (existsSync(globalPath)) {
      return ConfigManager.loadFrom(globalPath);
    }
    // No config file on disk. Don't fail here — fall back to a token-less
    // project config if we found one (keeps its workspace/output defaults),
    // otherwise an empty config. resolveToken()/resolveWorkspace() then pick
    // up --token / CLICKUP_TOKEN (and env workspace) and raise an accurate
    // error only if nothing is available anywhere.
    return projectConfig ?? ConfigManager.default();
  }

  static loadFrom(path: string): Config {
    let data: string;
    try {
      data = readFileSync(path, 'utf8');
    } catch (e) {
      throw new CliError('config', `failed to read config file '${path}': ${(e as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      throw new CliError(
        'config',
        `failed to parse config file '${path}': ${(e as Error).message}`
      );
    }
    return ConfigManager.normalize(parsed);
  }

  private static normalize(raw: unknown): Config {
    if (typeof raw !== 'object' || raw === null) {
      return ConfigManager.default();
    }
    const obj = raw as Record<string, unknown>;
    const auth = (obj.auth ?? {}) as Record<string, unknown>;
    const defaults = (obj.defaults ?? {}) as Record<string, unknown>;
    const git = (obj.git ?? {}) as Record<string, unknown>;
    return {
      auth: { token: typeof auth.token === 'string' ? auth.token : '' },
      defaults: {
        workspace_id: typeof defaults.workspace_id === 'string' ? defaults.workspace_id : undefined,
        output: typeof defaults.output === 'string' ? defaults.output : undefined,
      },
      git: {
        enabled: typeof git.enabled === 'boolean' ? git.enabled : undefined,
        verbose: typeof git.verbose === 'boolean' ? git.verbose : undefined,
      },
    };
  }

  static save(config: Config): void {
    ConfigManager.saveTo(config, ConfigManager.configPath());
  }

  static saveTo(config: Config, path: string): void {
    const dir = dirname(path);
    try {
      mkdirSync(dir, { recursive: true });
    } catch (e) {
      throw new CliError(
        'config',
        `failed to create config directory '${dir}': ${(e as Error).message}`
      );
    }
    try {
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    } catch (e) {
      throw new CliError(
        'config',
        `failed to write config file '${path}': ${(e as Error).message}`
      );
    }
  }

  static default(): Config {
    return {
      auth: { token: '' },
      defaults: {},
      git: {},
    };
  }
}

export function resolveToken(cliToken: string | undefined, config: Config): string {
  if (cliToken) return cliToken;
  const envToken = process.env.CLICKUP_TOKEN;
  if (envToken) return envToken;
  if (config.auth?.token) return config.auth.token;
  throw new CliError(
    'config',
    "No API token found. Pass --token, set CLICKUP_TOKEN, or run 'clickup-cli-js setup'."
  );
}

export function resolveWorkspace(cliWorkspace: string | undefined, config: Config): string {
  if (cliWorkspace) return cliWorkspace;
  const envWs = process.env.CLICKUP_WORKSPACE;
  if (envWs) return envWs;
  if (config.defaults?.workspace_id) return config.defaults.workspace_id;
  throw new CliError(
    'config',
    "No workspace ID found. Pass --workspace, set CLICKUP_WORKSPACE, or run 'clickup-cli-js setup'."
  );
}
