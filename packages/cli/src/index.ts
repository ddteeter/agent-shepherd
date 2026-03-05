#!/usr/bin/env node
import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { initCommand } from './commands/init.js';
import { submitCommand } from './commands/submit.js';
import { batchCommand } from './commands/batch.js';
import { readyCommand } from './commands/ready.js';
import { statusCommand } from './commands/status.js';
import { listProjectsCommand } from './commands/list-projects.js';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';
import { reviewCommand } from './commands/review.js';

const program = new Command();
const client = new ApiClient(process.env.SHEPHERD_URL || 'http://localhost:3847');

program
  .name('agent-shepherd')
  .description('Agent Shepherd - Human-in-the-loop PR review for AI agents')
  .version('0.1.0');

initCommand(program, client);
submitCommand(program, client);
batchCommand(program, client);
readyCommand(program, client);
statusCommand(program, client);
listProjectsCommand(program, client);
setupCommand(program);
startCommand(program);
reviewCommand(program, client);

program.parse();
