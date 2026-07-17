import { rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ClickUpClient, classifyFetchError } from '../src/client.js';
import { CliError } from '../src/error.js';

type ShimResponse = {
  status: number;
  ok: boolean;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
  json: () => Promise<any>;
};

async function nodeFetch(url: string, options: any = {}): Promise<ShimResponse> {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  const headers: Record<string, string> = { ...(options.headers || {}) };
  let bodyBuf: Buffer | null = null;

  if (options.body != null) {
    if (typeof options.body === 'string') {
      bodyBuf = Buffer.from(options.body, 'utf8');
    } else if (options.body && typeof options.body.forEach === 'function') {
      const boundary = `----nockFetchBoundary${Math.random().toString(16).slice(2)}`;
      const parts: Buffer[] = [];
      const entries: Array<[string, any]> = [];
      options.body.forEach((v: any, k: string) => entries.push([k, v]));
      for (const [k, v] of entries) {
        parts.push(Buffer.from(`--${boundary}\r\n`));
        if (v instanceof Blob) {
          const fname = (v as any).name || 'blob';
          const ct = v.type || 'application/octet-stream';
          parts.push(
            Buffer.from(
              `Content-Disposition: form-data; name="${k}"; filename="${fname}"\r\nContent-Type: ${ct}\r\n\r\n`
            )
          );
          const ab = await v.arrayBuffer();
          parts.push(Buffer.from(ab));
          parts.push(Buffer.from('\r\n'));
        } else {
          parts.push(
            Buffer.from(`Content-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`)
          );
        }
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      bodyBuf = Buffer.concat(parts);
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    }
  }

  return new Promise<ShimResponse>((resolve, reject) => {
    const reqOpts = {
      method: options.method || 'GET',
      hostname: u.hostname,
      port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
      path: u.pathname + u.search,
      headers,
    };
    const req = lib.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        const status = res.statusCode || 200;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          headers: {
            get: (name: string) => {
              const val = res.headers[name.toLowerCase()];
              if (val == null) return null;
              return Array.isArray(val) ? val.join(', ') : String(val);
            },
          },
          text: async () => text,
          json: async () => JSON.parse(text),
        });
      });
    });
    req.on('error', reject);
    if (options.signal) {
      const signal = options.signal;
      const abortError = () =>
        new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      if (signal.aborted) {
        req.destroy(abortError());
      } else {
        signal.addEventListener('abort', () => req.destroy(abortError()));
      }
    }
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

const originalFetch = globalThis.fetch;
const TMP_FILE = join(tmpdir(), 'clickup-cli-js-test-upload.txt');

beforeAll(() => {
  globalThis.fetch = nodeFetch as any;
  nock.disableNetConnect();
  writeFileSync(TMP_FILE, 'hello-bytes');
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  nock.enableNetConnect();
  rmSync(TMP_FILE, { force: true });
});

afterEach(() => nock.cleanAll());

describe('ClickUpClient', () => {
  it('GET returns parsed JSON on 200', async () => {
    nock('https://api.clickup.com')
      .get('/api/v2/user')
      .reply(200, { user: { id: '1', username: 'test' } });
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.get('/v2/user');
    expect(resp.user.username).toBe('test');
  });

  it('returns {} on 204', async () => {
    nock('https://api.clickup.com').delete('/api/v2/task/abc').reply(204, '');
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.delete('/v2/task/abc');
    expect(resp).toEqual({});
  });

  it('maps 401 to auth error', async () => {
    nock('https://api.clickup.com').get('/api/v2/user').reply(401, { err: 'Unauthorized' });
    const client = new ClickUpClient('test-token', 30);
    await expect(client.get('/v2/user')).rejects.toMatchObject({ kind: 'auth' });
    try {
      nock('https://api.clickup.com').get('/api/v2/user').reply(401, { err: 'Unauthorized' });
      await client.get('/v2/user');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).kind).toBe('auth');
      expect((e as CliError).message).toBe('Unauthorized');
    }
  });

  it('maps 404 to notFound error', async () => {
    nock('https://api.clickup.com')
      .get('/api/v2/task/missing')
      .reply(404, { err: 'Task not found' });
    const client = new ClickUpClient('test-token', 30);
    await expect(client.get('/v2/task/missing')).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('retries 5xx with exponential backoff then succeeds', async () => {
    nock('https://api.clickup.com')
      .get('/api/v2/task/t1')
      .times(2)
      .reply(500, { err: 'boom' })
      .get('/api/v2/task/t1')
      .reply(200, { id: 't1', name: 'recovered' });
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.get('/v2/task/t1');
    expect(resp.id).toBe('t1');
    expect(nock.isDone()).toBe(true);
  });

  it('retries once on 429 using X-RateLimit-Reset then succeeds', async () => {
    nock('https://api.clickup.com')
      .get('/api/v2/task/rl')
      .reply(429, 'rate limited', { 'X-RateLimit-Reset': '0' })
      .get('/api/v2/task/rl')
      .reply(200, { id: 'rl', ok: true });
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.get('/v2/task/rl');
    expect(resp.ok).toBe(true);
    expect(nock.isDone()).toBe(true);
  });

  it('POST sends a JSON body', async () => {
    nock('https://api.clickup.com')
      .post('/api/v2/task', { name: 'foo' })
      .reply(200, { id: 'new-task' });
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.post('/v2/task', { name: 'foo' });
    expect(resp.id).toBe('new-task');
  });

  it('sends the Authorization header', async () => {
    nock('https://api.clickup.com')
      .get('/api/v2/user')
      .matchHeader('authorization', 'test-token')
      .reply(200, { user: { username: 'authed' } });
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.get('/v2/user');
    expect(resp.user.username).toBe('authed');
  });

  it('uses a custom base URL via withBaseUrl', async () => {
    nock('http://localhost:9999')
      .get('/api/v2/user')
      .reply(200, { user: { username: 'mock' } });
    const client = new ClickUpClient('test-token', 30).withBaseUrl('http://localhost:9999/api');
    const resp = await client.get('/v2/user');
    expect(resp.user.username).toBe('mock');
  });

  it('uploadFile sends multipart form data and returns parsed JSON', async () => {
    nock('https://api.clickup.com')
      .post('/api/v2/task/abc/attachment')
      .matchHeader('content-type', /multipart\/form-data/)
      .reply(200, { id: 'att1' });
    const client = new ClickUpClient('test-token', 30);
    const resp = await client.uploadFile('/v2/task/abc/attachment', TMP_FILE);
    expect(resp.id).toBe('att1');
    expect(nock.isDone()).toBe(true);
  });

  it('maps non-JSON error body to HTTP {status}: {body}', async () => {
    nock('https://api.clickup.com').get('/api/v2/task/x').reply(422, 'nope-bad');
    const client = new ClickUpClient('test-token', 30);
    await expect(client.get('/v2/task/x')).rejects.toMatchObject({
      kind: 'client',
      status: 422,
      message: 'HTTP 422: nope-bad',
    });
  });

  it('a real request that exceeds --timeout is classified as a timeout error', async () => {
    nock('https://api.clickup.com').get('/api/v2/task/slow').delay(300).reply(200, { ok: true });
    const client = new ClickUpClient('test-token', 0.05);
    await expect(client.get('/v2/task/slow')).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('classifyFetchError', () => {
  it('classifies a TimeoutError DOMException as timeout', () => {
    const err = new DOMException('aborted', 'TimeoutError');
    const e = classifyFetchError(err, 30);
    expect(e.kind).toBe('timeout');
    expect(e.message).toContain('30s');
  });

  it('classifies an AbortError as timeout', () => {
    const err = new DOMException('aborted', 'AbortError');
    const e = classifyFetchError(err, 5);
    expect(e.kind).toBe('timeout');
  });

  it('classifies a TypeError with a system error cause as network', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.clickup.com' },
    });
    const e = classifyFetchError(err, 30);
    expect(e.kind).toBe('network');
    expect(e.message).toContain('ENOTFOUND');
  });

  it('classifies a connection-refused cause as network', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:1' },
    });
    const e = classifyFetchError(err, 30);
    expect(e.kind).toBe('network');
    expect(e.message).toContain('ECONNREFUSED');
  });

  it('classifies a bare TypeError("fetch failed") with no cause as network', () => {
    const err = new TypeError('fetch failed');
    const e = classifyFetchError(err, 30);
    expect(e.kind).toBe('network');
  });

  it('falls back to a generic client error for anything else', () => {
    const err = new Error('something unexpected');
    const e = classifyFetchError(err, 30);
    expect(e.kind).toBe('client');
    expect(e.status).toBe(0);
    expect(e.message).toContain('something unexpected');
  });
});
