import type { Command } from 'commander';
import { registerAuth } from './auth.js';
import { registerSetup } from './setup.js';
import { registerStatus } from './status.js';
import { registerTask } from './task.js';
import { registerWorkspace } from './workspace.js';

export function registerCommands(program: Command): void {
  registerSetup(program);
  registerAuth(program);
  registerWorkspace(program);
  registerStatus(program);
  registerTask(program);
}
