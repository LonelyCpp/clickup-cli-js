import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Config, ConfigManager, resolveToken, resolveWorkspace } from '../src/config.js';
import { CliError } from '../src/error.js';

describe('ConfigManager.configPath', () => {
  it('returns a path ending with config.json', () => {
    const p = ConfigManager.configPath();
    expect(p.endsWith('config.json')).toBe(true);
    expect(p).toContain('clickup-cli');
  });
});

describe('ConfigManager.default', () => {
  it('returns empty config', () => {
    expect(ConfigManager.default()).toEqual({
      auth: { token: '' },
      defaults: {},
      git: {},
    });
  });
});

describe('ConfigManager.findProjectConfig', () => {
  it('walks up and finds .clickup.json', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const sub = join(tmp, 'a', 'b', 'c');
    mkdirSync(sub, { recursive: true });
    const cfgPath = join(tmp, '.clickup.json');
    writeFileSync(cfgPath, JSON.stringify({ auth: { token: 'x' } }));
    expect(ConfigManager.findProjectConfig(sub)).toBe(cfgPath);
    rmSync(tmp, { recursive: true });
  });

  it('returns null when not found', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    expect(ConfigManager.findProjectConfig(tmp)).toBeNull();
    rmSync(tmp, { recursive: true });
  });

  it('finds config at the start dir itself', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const cfgPath = join(tmp, '.clickup.json');
    writeFileSync(cfgPath, JSON.stringify({ auth: { token: 'x' } }));
    expect(ConfigManager.findProjectConfig(tmp)).toBe(cfgPath);
    rmSync(tmp, { recursive: true });
  });
});

describe('ConfigManager.loadFrom', () => {
  it('throws CliError(config) on non-existent path', () => {
    expect(() => ConfigManager.loadFrom('/nonexistent/cu-test-path.json')).toThrow(CliError);
    try {
      ConfigManager.loadFrom('/nonexistent/cu-test-path.json');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).kind).toBe('config');
    }
  });

  it('throws CliError(config) on invalid JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const cfgPath = join(tmp, 'bad.json');
    writeFileSync(cfgPath, '{not valid json');
    expect(() => ConfigManager.loadFrom(cfgPath)).toThrow(CliError);
    rmSync(tmp, { recursive: true });
  });

  it('normalizes missing fields to defaults', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const cfgPath = join(tmp, 'partial.json');
    writeFileSync(cfgPath, JSON.stringify({ auth: { token: 'tok' } }));
    const loaded = ConfigManager.loadFrom(cfgPath);
    expect(loaded.auth.token).toBe('tok');
    expect(loaded.defaults).toEqual({});
    expect(loaded.git).toEqual({});
    rmSync(tmp, { recursive: true });
  });
});

describe('ConfigManager saveTo + loadFrom roundtrip', () => {
  it('preserves full config data', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const cfgPath = join(tmp, 'config.json');
    const cfg: Config = {
      auth: { token: 'tok123' },
      defaults: { workspace_id: 'ws1', output: 'json' },
      git: { enabled: true, verbose: false },
    };
    ConfigManager.saveTo(cfg, cfgPath);
    const loaded = ConfigManager.loadFrom(cfgPath);
    expect(loaded).toEqual(cfg);
    rmSync(tmp, { recursive: true });
  });

  it('creates parent directories', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const cfgPath = join(tmp, 'nested', 'dir', 'config.json');
    ConfigManager.saveTo(ConfigManager.default(), cfgPath);
    const loaded = ConfigManager.loadFrom(cfgPath);
    expect(loaded).toEqual(ConfigManager.default());
    rmSync(tmp, { recursive: true });
  });
});

describe('ConfigManager.load', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws CliError(config) when no config exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    vi.spyOn(ConfigManager, 'configPath').mockReturnValue(join(tmp, 'nonexistent.json'));
    expect(() => ConfigManager.load()).toThrow(CliError);
    try {
      ConfigManager.load();
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as CliError).kind).toBe('config');
    }
    rmSync(tmp, { recursive: true });
  });

  it('loads project config when it has a token', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const sub = join(tmp, 'sub');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(tmp, '.clickup.json'), JSON.stringify({ auth: { token: 'proj' } }));
    vi.spyOn(process, 'cwd').mockReturnValue(sub);
    const loaded = ConfigManager.load();
    expect(loaded.auth.token).toBe('proj');
    rmSync(tmp, { recursive: true });
  });

  it('falls through to global when project config has empty token', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const sub = join(tmp, 'sub');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(tmp, '.clickup.json'), JSON.stringify({ auth: { token: '' } }));
    const globalPath = join(tmp, 'global.json');
    ConfigManager.saveTo({ auth: { token: 'global' }, defaults: {}, git: {} }, globalPath);
    vi.spyOn(process, 'cwd').mockReturnValue(sub);
    vi.spyOn(ConfigManager, 'configPath').mockReturnValue(globalPath);
    const loaded = ConfigManager.load();
    expect(loaded.auth.token).toBe('global');
    rmSync(tmp, { recursive: true });
  });

  it('throws when project config has empty token and no global config', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'cu-cfg-'));
    const sub = join(tmp, 'sub');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(tmp, '.clickup.json'), JSON.stringify({ auth: { token: '' } }));
    vi.spyOn(process, 'cwd').mockReturnValue(sub);
    vi.spyOn(ConfigManager, 'configPath').mockReturnValue(join(tmp, 'nope.json'));
    expect(() => ConfigManager.load()).toThrow(CliError);
    rmSync(tmp, { recursive: true });
  });
});

describe('resolveToken', () => {
  const origToken = process.env.CLICKUP_TOKEN;

  afterEach(() => {
    if (origToken === undefined) Reflect.deleteProperty(process.env, 'CLICKUP_TOKEN');
    else process.env.CLICKUP_TOKEN = origToken;
    vi.restoreAllMocks();
  });

  it('returns --token when provided', () => {
    process.env.CLICKUP_TOKEN = 'env';
    expect(resolveToken('cli-token', ConfigManager.default())).toBe('cli-token');
  });

  it('returns env token when no --token', () => {
    process.env.CLICKUP_TOKEN = 'env-token';
    expect(resolveToken(undefined, ConfigManager.default())).toBe('env-token');
  });

  it('returns config token when no --token and no env', () => {
    Reflect.deleteProperty(process.env, 'CLICKUP_TOKEN');
    const cfg: Config = { auth: { token: 'cfg-token' }, defaults: {}, git: {} };
    expect(resolveToken(undefined, cfg)).toBe('cfg-token');
  });

  it('throws CliError when no token found anywhere', () => {
    Reflect.deleteProperty(process.env, 'CLICKUP_TOKEN');
    expect(() => resolveToken(undefined, ConfigManager.default())).toThrow(CliError);
    try {
      resolveToken(undefined, ConfigManager.default());
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as CliError).kind).toBe('config');
    }
  });

  it('empty string --token falls through to env', () => {
    process.env.CLICKUP_TOKEN = 'env-token';
    expect(resolveToken('', ConfigManager.default())).toBe('env-token');
  });
});

describe('resolveWorkspace', () => {
  const origWs = process.env.CLICKUP_WORKSPACE;

  afterEach(() => {
    if (origWs === undefined) Reflect.deleteProperty(process.env, 'CLICKUP_WORKSPACE');
    else process.env.CLICKUP_WORKSPACE = origWs;
    vi.restoreAllMocks();
  });

  it('returns --workspace when provided', () => {
    process.env.CLICKUP_WORKSPACE = 'env-ws';
    expect(resolveWorkspace('cli-ws', ConfigManager.default())).toBe('cli-ws');
  });

  it('returns env workspace when no --workspace', () => {
    process.env.CLICKUP_WORKSPACE = 'env-ws';
    expect(resolveWorkspace(undefined, ConfigManager.default())).toBe('env-ws');
  });

  it('returns config workspace when no --workspace and no env', () => {
    Reflect.deleteProperty(process.env, 'CLICKUP_WORKSPACE');
    const cfg: Config = {
      auth: { token: '' },
      defaults: { workspace_id: 'cfg-ws' },
      git: {},
    };
    expect(resolveWorkspace(undefined, cfg)).toBe('cfg-ws');
  });

  it('throws CliError when no workspace found anywhere', () => {
    Reflect.deleteProperty(process.env, 'CLICKUP_WORKSPACE');
    expect(() => resolveWorkspace(undefined, ConfigManager.default())).toThrow(CliError);
    try {
      resolveWorkspace(undefined, ConfigManager.default());
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as CliError).kind).toBe('config');
    }
  });

  it('empty string --workspace falls through to env', () => {
    process.env.CLICKUP_WORKSPACE = 'env-ws';
    expect(resolveWorkspace('', ConfigManager.default())).toBe('env-ws');
  });
});
