#!/usr/bin/env node
import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { initCommand } from './commands/init.js';
import { submitCommand } from './commands/submit.js';

const program = new Command();
const client = new ApiClient(process.env.SHEPHERD_URL || 'http://localhost:3847');

program
  .name('shepherd')
  .description('Agent Shepherd - Human-in-the-loop PR review for AI agents')
  .version('0.1.0');

initCommand(program, client);
submitCommand(program, client);

program.parse();
