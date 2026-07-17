import type { Command } from 'commander';
import { registerAuth } from './auth.js';
import { registerComment } from './comment.js';
import { registerField } from './field.js';
import { registerMcp } from './mcp_cmd.js';
import { registerMember } from './member.js';
import { registerSetup } from './setup.js';
import { registerStatus } from './status.js';
import { registerTag } from './tag.js';
import { registerTask } from './task.js';
import { registerTime } from './time.js';
import { registerUser } from './user.js';
import { registerView } from './view.js';
import { registerWorkspace } from './workspace.js';

export function registerCommands(program: Command): void {
  registerSetup(program);
  registerAuth(program);
  registerWorkspace(program);
  registerStatus(program);
  registerTask(program);
  registerComment(program);
  registerTag(program);
  registerField(program);
  registerTime(program);
  registerView(program);
  registerMember(program);
  registerUser(program);
  registerMcp(program);
}
