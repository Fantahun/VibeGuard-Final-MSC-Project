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
const inquirer = require('inquirer');
const fs = require('fs');
const repoIntegration = require('../integration/repoIntegration');
const orchestrator = require('../orchestrator/orchestrator');
const provenanceLogger = require('../logger/provenanceLogger');
const { handleWarnReview } = require('./reviewHandler');

function parseOptionalInt(value, label) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return Math.trunc(parsed);
}

function buildTestResults(opts) {
  const passed = parseOptionalInt(opts.testPassed, 'test passed');
  const failed = parseOptionalInt(opts.testFailed, 'test failed');
  const total = parseOptionalInt(opts.testTotal, 'test total');
  const durationMs = parseOptionalInt(opts.testDurationMs, 'test duration');
  const success = typeof opts.testSuccess === 'boolean' ? opts.testSuccess : null;

  if (passed === null && failed === null && total === null && durationMs === null && success === null) {
    return null;
  }

  const derivedTotal = total !== null
    ? total
    : (passed !== null && failed !== null ? passed + failed : null);

  return {
    passed: passed ?? 0,
    failed: failed ?? 0,
    total: derivedTotal ?? 0,
    durationMs,
    success: success !== null ? success : (failed === 0),
  };
}

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
  .option('--dev-time-ms <ms>', 'Record development time in milliseconds')
  .option('--test-passed <n>', 'Record number of passed tests')
  .option('--test-failed <n>', 'Record number of failed tests')
  .option('--test-total <n>', 'Record total number of tests')
  .option('--test-duration-ms <ms>', 'Record test duration in milliseconds')
  .option('--test-success', 'Mark tests as successful')
  .option('--test-failure', 'Mark tests as failed')
  .action(async (opts) => {
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║  VibeGuard Security-Integrated CLI   ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

    const spinner = ora('Classifying prompt risk...').start();

    try {
      if (opts.testSuccess && opts.testFailure) {
        throw new Error('Use only one of --test-success or --test-failure.');
      }

      const mode = String(opts.mode || 'vibeguard').toLowerCase();
      if (!['baseline', 'vibeguard'].includes(mode)) {
        throw new Error(`Invalid mode: ${opts.mode}. Use "vibeguard" for CLI sessions or the experiment runner for baseline evaluation.`);
      }
      if (mode === 'baseline') {
        throw new Error('Baseline mode is reserved for controlled experiments. Use node src/experiment/runner.js to run baseline vs VibeGuard comparisons.');
      }

      const testSuccessFlag = opts.testSuccess ? true : opts.testFailure ? false : null;
      const developmentTimeMs = parseOptionalInt(opts.devTimeMs, 'development time');
      const passed = parseOptionalInt(opts.testPassed, 'test passed');
      const failed = parseOptionalInt(opts.testFailed, 'test failed');
      const total = parseOptionalInt(opts.testTotal, 'test total');

      if (total !== null && passed !== null && failed !== null && total < (passed + failed)) {
        throw new Error('Invalid test totals: test-total is less than test-passed + test-failed.');
      }

      const testResults = buildTestResults({
        testPassed: passed,
        testFailed: failed,
        testTotal: total,
        testDurationMs: opts.testDurationMs,
        testSuccess: testSuccessFlag,
      });

      const result = await orchestrator.run(opts.prompt, {
        taskId: opts.taskId,
        mode,
        postProcess: async () => ({
          developmentTimeMs,
          testResults,
        }),
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
      console.log(chalk.bold('\n[2.1] SYSTEM PROMPT'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(result.systemPrompt || '');
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.bold('\n[2.2] ENRICHED PROMPT'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(result.enrichedPrompt || '');
      console.log(chalk.gray('─'.repeat(60)));

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
      const decColor = result.approved ? chalk.green : result.decision.decision === 'WARN' ? chalk.yellow : chalk.red;
      console.log(`  ${decColor(result.policyReport)}`);

      // Explicit WARN review flow
      let reviewApproved = false;
      if (result.decision.decision === 'WARN') {
        const review = await handleWarnReview({
          sessionId: result.sessionId,
          inquirer,
          provenanceLogger,
          stdinIsTTY: process.stdin.isTTY,
        });
        reviewApproved = review.approved;
        if (!reviewApproved) {
          console.log(chalk.yellow('\n[6] REVIEW REQUIRED: output not approved.'));
        } else {
          console.log(chalk.green('[6] REVIEW APPROVED: output can be used with caution.'));
        }
      }

      // Code output
      if (result.approved || reviewApproved) {
        if (opts.output) {
          fs.writeFileSync(opts.output, result.code, 'utf8');
          console.log(chalk.bold(`\n[6] OUTPUT saved to: ${opts.output}`));
        } else {
          console.log(chalk.bold(`\n[${result.approved ? '6' : '7'}] GENERATED CODE:`));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(result.code);
          console.log(chalk.gray('─'.repeat(60)));
        }

        const integrationResult = repoIntegration.deliverApproved(result.code, {
          sessionId: result.sessionId,
          taskId: result.taskId,
          mode: result.mode,
          model: result.model,
          decision: result.decision.decision,
          approved: result.approved || reviewApproved,
          regenerationCount: result.regenerationCount,
        }, opts.output);

        if (integrationResult) {
          console.log(chalk.bold(`\n[7] INTEGRATION OUTPUT:`));
          console.log(`  Code: ${integrationResult.codePath}`);
          console.log(`  Metadata: ${integrationResult.metaPath}`);
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
