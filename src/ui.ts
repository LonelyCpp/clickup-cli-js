import boxen from 'boxen';
import chalk from 'chalk';
import figures from 'figures';
import ora from 'ora';

const NON_DECORATED_MODES = ['json', 'json-compact', 'csv', 'compact'];

export class UI {
  private enabled: boolean;
  private spinner: ReturnType<typeof ora> | null;

  constructor(opts?: { outputMode?: string; quiet?: boolean }) {
    this.enabled = UI.decorationsEnabled(opts?.outputMode, opts?.quiet);
    this.spinner = this.enabled ? ora({ text: '', stream: process.stderr }) : null;
  }

  static decorationsEnabled(outputMode?: string, quiet?: boolean): boolean {
    if (!process.stdout.isTTY) return false;
    if (process.env.CI) return false;
    if (process.env.NO_COLOR) return false;
    if (outputMode && NON_DECORATED_MODES.includes(outputMode)) return false;
    if (quiet) return false;
    return true;
  }

  startSpinner(text: string): void {
    this.spinner?.start(text);
  }

  setSpinnerText(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  stopSpinner(_success = true): void {
    if (this.spinner?.isSpinning) {
      this.spinner.stop();
    }
  }

  success(message: string): void {
    this.stopSpinner();
    if (this.enabled) {
      console.log(chalk.green(`${figures.tick} ${message}`));
    } else {
      console.log(message);
    }
  }

  error(message: string): void {
    this.stopSpinner();
    if (this.enabled) {
      console.error(chalk.red(`${figures.cross} ${message}`));
    } else {
      console.error(message);
    }
  }

  hint(message: string): void {
    const line = `  Hint: ${message}`;
    console.error(this.enabled ? chalk.dim.cyan(line) : line);
  }

  breadcrumb(message: string): void {
    console.error(this.enabled ? chalk.dim(message) : message);
  }

  box(content: string, opts?: { title?: string; padding?: number }): string {
    if (this.enabled) {
      const rendered = boxen(content, {
        title: opts?.title,
        padding: opts?.padding ?? 1,
        borderStyle: 'round',
      });
      console.log(rendered);
      return rendered;
    }
    console.log(content);
    return content;
  }

  get symbol(): { tick: string; cross: string; warning: string; arrowRight: string } {
    return {
      tick: figures.tick,
      cross: figures.cross,
      warning: figures.warning,
      arrowRight: figures.arrowRight,
    };
  }
}

export function createUI(opts?: { outputMode?: string; quiet?: boolean }): UI {
  return new UI(opts);
}
