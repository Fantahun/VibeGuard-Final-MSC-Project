#!/usr/bin/env node
'use strict';
/**
 * VibeGuard CLI entry point
 * Commands:
 *   vibeguard generate     - run a single secure vibe coding session
 *   vibeguard report       - print provenance metrics summary
 *   vibeguard metrics      - show raw metrics rows
 *   vibeguard compare      - show baseline vs vibeguard summary
 */
require('dotenv').config();
const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const orchestrator = require('../orchestrator/orchestrator');
const provenanceLogger = require('../logger/provenanceLogger');

const program = new Command();
program
  .name('vibeguard')
  .description('VibeGuard: Security-Integrated Vibe Coding Framework for Node.js Microservices')
  .version('1.0.0');

// ------------------------------------------------------------------
// generate command
// ------------------------------------------------------------------
program
  .command('generate')
  .description('Run a secure vibe coding session for a given task')
  .requiredOption('-p, --prompt <prompt>', 'Developer intent / task description')
  .option('-t, --task-id <id>', 'Task identifier for experiment tracking', 'TASK_UNKNOWN')
  .option('-m, --mode <mode>', 'Session mode: baseline | vibeguard', 'vibeguard')
  .option('-o, --output <file>', 'Save generated code to file')
  .action(async (opts) => {
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║  VibeGuard Security-Integrated CLI   ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

    const spinner = ora('Classifying prompt risk...').start();

    try {
      const result = await orchestrator.run(opts.prompt, {
        taskId: opts.taskId,
        mode: opts.mode,
      });

      spinner.succeed('Session completed.');

      // Risk classification
      const ra = result.riskAssessment;
      console.log(chalk.bold('\n[1] RISK CLASSIFICATION'));
      console.log(`  Security-sensitive: ${ra.isSecuritySensitive ? chalk.red('YES') : chalk.green('NO')}`);
      if (ra.isSecuritySensitive) {
        console.log(`  Severity:   ${chalk.yellow(ra.overallSeverity)}`);
        console.log(`  Categories: ${ra.categories.join(', ')}`);
        console.log(`  CWEs:       ${ra.cwes.join(', ')}`);
      }

      // Enrichment
      console.log(chalk.bold('\n[2] PROMPT ENRICHMENT'));
      console.log(`  Enriched: ${result.enriched ? chalk.yellow('YES') : chalk.gray('NO')}`);
      if (result.enriched) {
        console.log(`  Applied:  ${(result.riskAssessment.categories || []).join(', ')}`);
      }

      // Generation
      console.log(chalk.bold('\n[3] CODE GENERATION'));
      console.log(`  Model:        ${result.model}`);
      console.log(`  Duration:     ${result.durationMs}ms`);
      console.log(`  Regenerations:${result.regenerationCount}`);

      // Validation
      const findings = result.findings;
      console.log(chalk.bold('\n[4] SECURITY VALIDATION'));
      if (findings.length === 0) {
        console.log(chalk.green('  No security findings.'));
      } else {
        findings.forEach(f => {
          const color = f.severity === 'ERROR' ? chalk.red : f.severity === 'WARNING' ? chalk.yellow : chalk.gray;
          console.log(`  ${color(`[${f.severity}]`)} ${f.ruleId} — ${f.message} (line ${f.line || '?'})`);
        });
      }

      // Decision
      console.log(chalk.bold('\n[5] POLICY DECISION'));
      const decColor = result.approved ? chalk.green : chalk.red;
      console.log(`  ${decColor(result.policyReport)}`);

      // Code output
      if (result.approved || result.decision.decision === 'WARN') {
        if (opts.output) {
          fs.writeFileSync(opts.output, result.code, 'utf8');
          console.log(chalk.bold(`\n[6] OUTPUT saved to: ${opts.output}`));
        } else {
          console.log(chalk.bold('\n[6] GENERATED CODE:'));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(result.code);
          console.log(chalk.gray('─'.repeat(60)));
        }
      }

      console.log(chalk.bold(`\nSession ID: ${result.sessionId}`));
      console.log(`Provenance logged to: ./logs/provenance.jsonl\n`);

    } catch (err) {
      spinner.fail('Session failed.');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

// ------------------------------------------------------------------
// report command
// ------------------------------------------------------------------
program
  .command('report')
  .description('Show aggregated metrics summary (baseline vs vibeguard)')
  .action(() => {
    const summary = provenanceLogger.generateSummary();
    console.log(chalk.bold('\nVibeGuard Metrics Summary\n'));
    for (const [mode, data] of Object.entries(summary)) {
      console.log(chalk.cyan(`Mode: ${mode.toUpperCase()}`));
      console.log(`  Sessions:               ${data.sessions}`);
      console.log(`  Avg Vulnerability Density (per 1000 LOC): ${data.avgVulnerabilityDensity}`);
      console.log(`  Avg Critical Findings:  ${data.avgCriticalFindings}`);
      console.log(`  Avg Duration (ms):      ${data.avgDurationMs}`);
      console.log(`  Approval Rate (%):      ${data.approvalRate}\n`);
    }
  });

// ------------------------------------------------------------------
// metrics command
// ------------------------------------------------------------------
program
  .command('metrics')
  .description('Print raw metrics as JSON')
  .action(() => {
    const metrics = provenanceLogger.loadMetrics();
    console.log(JSON.stringify(metrics, null, 2));
  });

program.parse(process.argv);
