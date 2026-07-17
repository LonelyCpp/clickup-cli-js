export interface CliOptions {
  token?: string;
  workspace?: string;
  output: string;
  fields?: string;
  noHeader: boolean;
  all: boolean;
  limit?: number;
  page?: number;
  cursor?: string;
  start?: number;
  startId?: string;
  quiet: boolean;
  timeout: number;
  maxChars: number;
  maxTokens?: number;
}

export const DEFAULT_MAX_CHARS = 60;

export function defaultOptions(): CliOptions {
  return {
    output: 'table',
    noHeader: false,
    all: false,
    quiet: false,
    timeout: 30,
    maxChars: DEFAULT_MAX_CHARS,
  };
}
