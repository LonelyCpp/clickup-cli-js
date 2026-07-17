import type { Command } from 'commander';
import { registerStatus } from './status.js';

export function registerCommands(program: Command): void {
  registerStatus(program);
}
