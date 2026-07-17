import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CliError } from './error.js';

export function classifyFetchError(err: unknown, timeoutSecs: number): CliError {
  const e = err as {
    name?: string;
    message?: string;
    cause?: { code?: string; message?: string; name?: string };
  };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.cause?.name === 'TimeoutError') {
    return new CliError('timeout', `Request timed out after ${timeoutSecs}s`);
  }
  const cause = e?.cause;
  if (cause?.code) {
    return new CliError(
      'network',
      `Could not reach the ClickUp API (${cause.code}): ${cause.message ?? e?.message ?? 'network error'}`
    );
  }
  if (e?.name === 'TypeError' && /fetch failed/i.test(e?.message ?? '')) {
    return new CliError('network', `Could not reach the ClickUp API: ${e.message}`);
  }
  return CliError.client(`Request failed: ${e?.message ?? String(err)}`, 0);
}

export class ClickUpClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;
  private rateLimitRemaining: number | null = null;
  private rateLimitReset: number | null = null;

  constructor(token: string, timeoutSecs: number) {
    this.baseUrl = process.env.CLICKUP_API_URL || 'https://api.clickup.com/api';
    this.token = token;
    this.timeoutMs = timeoutSecs * 1000;
  }

  withBaseUrl(url: string): ClickUpClient {
    const c = new ClickUpClient(this.token, this.timeoutMs / 1000);
    c.baseUrl = url;
    return c;
  }

  async get(path: string): Promise<any> {
    return this.request('GET', path, null);
  }

  async post(path: string, body: any): Promise<any> {
    return this.request('POST', path, body);
  }

  async put(path: string, body: any): Promise<any> {
    return this.request('PUT', path, body);
  }

  async delete(path: string): Promise<any> {
    return this.request('DELETE', path, null);
  }

  async patch(path: string, body: any): Promise<any> {
    return this.request('PATCH', path, body);
  }

  async deleteWithBody(path: string, body: any): Promise<any> {
    return this.request('DELETE', path, body);
  }

  async uploadFile(path: string, filePath: string): Promise<any> {
    const url = this.baseUrl + path;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const bytes = readFileSync(filePath);
      const fileName = basename(filePath);
      const form = new FormData();
      form.append('attachment', new Blob([bytes]), fileName);

      const options: any = {
        method: 'POST',
        headers: { Authorization: this.token },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: form,
      };

      let resp: any;
      try {
        resp = await fetch(url, options);
      } catch (err: any) {
        throw classifyFetchError(err, this.timeoutMs / 1000);
      }

      this.readRateHeaders(resp);
      const status = resp.status;

      if (status >= 200 && status < 300) {
        return await this.parseSuccess(resp);
      }

      if (status === 429 && attempt === 0) {
        const wait = this.computeRateLimitWait(resp);
        process.stderr.write(`Rate limited. Waiting ${wait} seconds...\n`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }

      if (status >= 500 && status < 600 && attempt < maxRetries) {
        const wait = 1 << attempt;
        process.stderr.write(`Server error (${status}). Retrying in ${wait}s...\n`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }

      const message = await this.parseErrorMessage(resp, status);
      throw this.mapError(status, message);
    }

    throw CliError.server('Max retries exceeded');
  }

  private async request(method: string, path: string, body: any): Promise<any> {
    const url = this.baseUrl + path;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const options: any = {
        method,
        headers: { Authorization: this.token, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (body !== null) {
        options.body = JSON.stringify(body);
      }

      let resp: any;
      try {
        resp = await fetch(url, options);
      } catch (err: any) {
        throw classifyFetchError(err, this.timeoutMs / 1000);
      }

      this.readRateHeaders(resp);
      const status = resp.status;

      if (status >= 200 && status < 300) {
        return await this.parseSuccess(resp);
      }

      if (status === 429 && attempt === 0) {
        const wait = this.computeRateLimitWait(resp);
        process.stderr.write(`Rate limited. Waiting ${wait} seconds...\n`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }

      if (status >= 500 && status < 600 && attempt < maxRetries) {
        const wait = 1 << attempt;
        process.stderr.write(`Server error (${status}). Retrying in ${wait}s...\n`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }

      const message = await this.parseErrorMessage(resp, status);
      throw this.mapError(status, message);
    }

    throw CliError.server('Max retries exceeded');
  }

  private computeRateLimitWait(resp: any): number {
    const reset = Number.parseInt(resp.headers.get('X-RateLimit-Reset') || '0');
    const now = Math.floor(Date.now() / 1000);
    return reset > now ? reset - now : 1;
  }

  private readRateHeaders(resp: any): void {
    const remaining = resp.headers.get('X-RateLimit-Remaining');
    const reset = resp.headers.get('X-RateLimit-Reset');
    if (remaining !== null) this.rateLimitRemaining = Number.parseInt(remaining);
    if (reset !== null) this.rateLimitReset = Number.parseInt(reset);
  }

  private async parseSuccess(resp: any): Promise<any> {
    if (resp.status === 204) return {};
    const text = await resp.text();
    if (text.length === 0) return {};
    return JSON.parse(text);
  }

  private async parseErrorMessage(resp: any, status: number): Promise<string> {
    let bodyText = '';
    try {
      bodyText = await resp.text();
    } catch {
      bodyText = '';
    }

    if (bodyText.length === 0) {
      return `HTTP ${status}`;
    }

    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed?.err === 'string') return parsed.err;
      if (typeof parsed?.message === 'string') return parsed.message;
    } catch {
      // not JSON
    }

    const truncated = bodyText.length > 200 ? bodyText.slice(0, 200) : bodyText;
    return `HTTP ${status}: ${truncated}`;
  }

  private mapError(status: number, message: string): CliError {
    if (status === 401) return CliError.auth(message);
    if (status === 403) return CliError.forbidden(message);
    if (status === 404) return CliError.notFound(message, '');
    if (status === 429) return CliError.rateLimited(message);
    if (status >= 500 && status < 600) return CliError.server(message);
    return CliError.client(message, status);
  }
}
