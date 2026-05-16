'use strict';
/**
 * VibeGuard Experiment Runner
 * Executes all defined experimental tasks in both conditions:
 *   - baseline:  prompt sent directly to LLM with no enrichment, no validation
 *   - vibeguard: full SIDF pipeline (enrich → generate → validate → decide)
 *
 * Results are written to the provenance log and metrics file automatically.
 * This runner is used to generate the quantitative data for Chapter 5.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const orchestrator = require('../orchestrator/orchestrator');
const llmConnector = require('../llm/llmConnector');
const validationEngine = require('../validator/validationEngine');
const provenanceLogger = require('../logger/provenanceLogger');
const { v4: uuidv4 } = require('uuid');

const TASK_DIR = path.resolve(__dirname, '../../tasks');
const TASKS = [
  { id: 'T1', file: 'T1_auth_prompt.txt', label: 'Authentication Service' },
  { id: 'T2', file: 'T2_crud_prompt.txt', label: 'CRUD Customer API' },
  { id: 'T3', file: 'T3_validation_middleware_prompt.txt', label: 'Validation Middleware' },
  { id: 'T4', file: 'T4_file_upload_prompt.txt', label: 'Secure File Upload' },
  { id: 'T5', file: 'T5_queue_prompt.txt', label: 'Message Queue Producer' },
];

/**
 * Run one task in baseline mode:
 * No enrichment, no validation, no policy decision.
 * Measures raw LLM output security using post-hoc analysis only.
 */
async function runBaseline(task, prompt) {
  console.log(`  [BASELINE] Running ${task.id}: ${task.label}`);
  const session = provenanceLogger.startSession(task.id, 'baseline');
  session.prompt = prompt;

  const enrichment = {
    enriched: false,
    systemPrompt: 'You are a senior Node.js engineer. Return only clean JavaScript code.',
    userPrompt: prompt,
    appliedCategories: [],
  };

  const start = Date.now();
  const generation = await llmConnector.generate(enrichment);
  session.model = `${generation.provider}/${generation.model}`;
  session.generatedCode = generation.code;
  session.enrichedPrompt = prompt;

  // Post-hoc validation (not shown to developer in baseline)
  const validation = await validationEngine.validate(generation.code);
  session.validationFindings = validation.findings;
  session.policyDecision = 'NOT_APPLIED';
  session.approved = false;  // baseline does not have gating

  const record = provenanceLogger.commit(session);
  console.log(`  [BASELINE] ${task.id} done. Findings: ${validation.findings.length}`);
  return record;
}

/**
 * Run one task through the full VibeGuard pipeline.
 */
async function runVibeGuard(task, prompt) {
  console.log(`  [VIBEGUARD] Running ${task.id}: ${task.label}`);
  const result = await orchestrator.run(prompt, { taskId: task.id, mode: 'vibeguard' });
  console.log(
    `  [VIBEGUARD] ${task.id} done. Decision: ${result.decision.decision}. ` +
    `Findings: ${result.findings.length}. Regenerations: ${result.regenerationCount}`
  );
  return result;
}

/**
 * Main experiment loop.
 */
async function main() {
  console.log('\nVibeGuard Experiment Runner');
  console.log('============================\n');

  for (const task of TASKS) {
    const promptFile = path.join(TASK_DIR, task.file);
    if (!fs.existsSync(promptFile)) {
      console.warn(`  SKIP: ${task.file} not found.`);
      continue;
    }

    const prompt = fs.readFileSync(promptFile, 'utf8').trim();
    console.log(`\nTask ${task.id}: ${task.label}`);

    try {
      await runBaseline(task, prompt);
      await runVibeGuard(task, prompt);
    } catch (err) {
      console.error(`  ERROR in ${task.id}: ${err.message}`);
    }
  }

  // Summary
  const summary = provenanceLogger.generateSummary();
  console.log('\n\nExperiment Complete — Summary');
  console.log('================================');
  for (const [mode, data] of Object.entries(summary)) {
    console.log(`\n${mode.toUpperCase()}`);
    console.log(`  Sessions:                       ${data.sessions}`);
    console.log(`  Avg Vulnerability Density/1000: ${data.avgVulnerabilityDensity}`);
    console.log(`  Avg Critical Findings:          ${data.avgCriticalFindings}`);
    console.log(`  Avg Duration (ms):              ${data.avgDurationMs}`);
    console.log(`  Approval Rate (%):              ${data.approvalRate}`);
  }

  const summaryPath = path.resolve('./logs/experiment_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nFull summary written to ${summaryPath}`);
}

main().catch(err => {
  console.error('Fatal error in experiment runner:', err);
  process.exit(1);
});
