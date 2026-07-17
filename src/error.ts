export type CliErrorKind =
  | 'client'
  | 'auth'
  | 'forbidden'
  | 'notFound'
  | 'rateLimited'
  | 'server'
  | 'config'
  | 'branchDetect'
  | 'io'
  | 'network'
  | 'timeout';

export interface CliErrorOpts {
  status?: number;
  resourceId?: string;
  retryAfter?: number;
  hint?: string;
}

export interface CliErrorObjectOpts extends CliErrorOpts {
  kind: CliErrorKind;
  message: string;
}

export class CliError extends Error {
  kind: CliErrorKind;
  status?: number;
  resourceId?: string;
  retryAfter?: number;
  hint?: string;

  constructor(opts: CliErrorObjectOpts);
  constructor(kind: CliErrorKind, message: string, opts?: CliErrorOpts);
  constructor(
    kindOrOpts: CliErrorKind | CliErrorObjectOpts,
    message?: string,
    opts?: CliErrorOpts
  ) {
    let kind: CliErrorKind;
    let msg: string;
    let o: CliErrorOpts | undefined;
    if (typeof kindOrOpts === 'object' && kindOrOpts !== null) {
      kind = kindOrOpts.kind;
      msg = kindOrOpts.message;
      o = {
        status: kindOrOpts.status,
        resourceId: kindOrOpts.resourceId,
        retryAfter: kindOrOpts.retryAfter,
        hint: kindOrOpts.hint,
      };
    } else {
      kind = kindOrOpts;
      msg = message as string;
      o = opts;
    }
    super(msg);
    this.name = 'CliError';
    this.kind = kind;
    this.status = o?.status;
    this.resourceId = o?.resourceId;
    this.retryAfter = o?.retryAfter;
    this.hint = o?.hint !== undefined ? o.hint : this.computeDefaultHint();
  }

  private computeDefaultHint(): string | undefined {
    switch (this.kind) {
      case 'auth':
        return "Check your API token, or run 'clickup-cli-js setup' to reconfigure";
      case 'forbidden':
        return 'This feature may require a higher ClickUp plan (Business+, Enterprise)';
      case 'notFound':
        return this.resourceId
          ? `Check the ID '${this.resourceId}', or use --custom-task-id if using a custom task ID`
          : 'Check the ID, or use --custom-task-id if using a custom task ID';
      case 'rateLimited':
        return this.retryAfter != null
          ? `Rate limited. Retry after ${this.retryAfter} seconds`
          : undefined;
      case 'server':
        return 'ClickUp server error. Try again in a few seconds.';
      case 'config':
        return "Run 'clickup-cli-js setup' to configure your API token";
      case 'network':
        return 'Check your internet connection, VPN/proxy settings, or firewall rules — the ClickUp API could not be reached';
      case 'timeout':
        return 'The request exceeded the configured --timeout. Try increasing --timeout or check your network connection';
      default:
        return undefined;
    }
  }

  exitCode(): number {
    switch (this.kind) {
      case 'client':
      case 'config':
      case 'branchDetect':
      case 'io':
        return 1;
      case 'auth':
      case 'forbidden':
        return 2;
      case 'notFound':
        return 3;
      case 'rateLimited':
        return 4;
      case 'server':
        return 5;
      case 'network':
        return 6;
      case 'timeout':
        return 7;
    }
  }

  print(outputMode: string): void {
    if (outputMode === 'json') {
      const payload: {
        error: boolean;
        message: string;
        exit_code: number;
        hint?: string;
      } = {
        error: true,
        message: this.message,
        exit_code: this.exitCode(),
      };
      if (this.hint) {
        payload.hint = this.hint;
      }
      process.stderr.write(`${JSON.stringify(payload)}\n`);
    } else {
      process.stderr.write(`Error: ${this.message}\n`);
      if (this.status != null) {
        process.stderr.write(`  Status: ${this.status}\n`);
      }
      if (this.hint) {
        process.stderr.write(`  Hint: ${this.hint}\n`);
      }
    }
  }

  static client(message: string, status?: number): CliError {
    return new CliError('client', message, { status });
  }

  static auth(message: string): CliError {
    return new CliError('auth', message, { status: 401 });
  }

  static forbidden(message: string): CliError {
    return new CliError('forbidden', message, { status: 403 });
  }

  static notFound(message: string, resourceId?: string): CliError {
    return new CliError('notFound', message, { status: 404, resourceId });
  }

  static rateLimited(message: string, retryAfter?: number): CliError {
    return new CliError('rateLimited', message, { status: 429, retryAfter });
  }

  static server(message: string): CliError {
    return new CliError('server', message, { status: 500 });
  }

  static config(message: string): CliError {
    return new CliError('config', message);
  }

  static branchDetect(message: string, hint: string): CliError {
    return new CliError('branchDetect', message, { hint });
  }

  static io(message: string): CliError {
    return new CliError('io', message);
  }
}
