import { readFileSync } from 'node:fs';
import { CliError } from './error.js';

export function resolveValueArg(value: string): string {
  if (!value.startsWith('@')) {
    return value;
  }
  if (value.startsWith('@@')) {
    return value.slice(1);
  }
  if (value === '@-') {
    const content = readFileSync(0, 'utf8');
    return stripTrailingNewline(content);
  }
  const path = value.slice(1);
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (e) {
    throw new CliError(
      'config',
      `failed to read value from file '${path}': ${(e as Error).message}. If you meant the literal text '@${path}', escape the leading '@' as '@@${path}'.`
    );
  }
  return stripTrailingNewline(content);
}

function stripTrailingNewline(s: string): string {
  if (s.endsWith('\r\n')) return s.slice(0, -2);
  if (s.endsWith('\n')) return s.slice(0, -1);
  return s;
}
