'use strict';
/**
 * VibeGuard Experiment Runner
 * Executes defined experimental tasks in both conditions:
 *   - baseline: prompt sent directly to LLM with no enrichment or policy gate
 *   - vibeguard: full SIDF pipeline (enrich -> generate -> validate -> decide)
 *
 * Each invocation writes a clean run folder:
 *   logs/runs/<run-id>/
 *     provenance.jsonl
 *     metrics.jsonl
 *     environment.json
 *     summary.json
 *     summary.csv
 *     task_deltas.csv
 *     test-results/
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const config = require('../../config/default');
const packageJson = require('../../package.json');
const orchestrator = require('../orchestrator/orchestrator');
const llmConnector = require('../llm/llmConnector');
const validationEngine = require('../validator/validationEngine');
const provenanceLogger = require('../logger/provenanceLogger');
const { exportCsvTables, generateExperimentSummary } = require('./summarizer');

const TASK_DIR = path.resolve(__dirname, '../../tasks');
const TASKS = [
  { id: 'T1', file: 'T1_auth_prompt.txt', label: 'Authentication Service' },
  { id: 'T2', file: 'T2_crud_prompt.txt', label: 'CRUD Customer API' },
  { id: 'T3', file: 'T3_validation_middleware_prompt.txt', label: 'Validation Middleware' },
  { id: 'T4', file: 'T4_file_upload_prompt.txt', label: 'Secure File Upload' },
  { id: 'T5', file: 'T5_queue_prompt.txt', label: 'Message Queue Producer' },
];

function parseArgs(argv) {
  const args = {
    runTests: null,
    testCommand: null,
    repetitions: null,
    runId: null,
    outputDir: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run-tests') {
      args.runTests = true;
    } else if (arg === '--no-run-tests') {
      args.runTests = false;
    } else if (arg === '--test-command') {
      args.testCommand = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--repetitions') {
      args.repetitions = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--run-id') {
      args.runId = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--output-dir') {
      args.outputDir = argv[i + 1] || null;
      i += 1;
    }
  }

  return args;
}

function parsePositiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

const cliArgs = parseArgs(process.argv);
const RUN_TESTS = cliArgs.runTests !== null
  ? cliArgs.runTests
  : process.env.VG_RUN_TESTS === 'true';
const TEST_COMMAND = cliArgs.testCommand
  || process.env.VG_TEST_COMMAND
  || 'npm test -- --json --outputFile';
const REPETITIONS = parsePositiveInt(
  cliArgs.repetitions || process.env.VG_EXPERIMENT_REPETITIONS || '1',
  'repetitions'
);

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function createRunContext(args = cliArgs) {
  const runId = sanitizeId(args.runId || process.env.VG_EXPERIMENT_RUN_ID || `run_${safeTimestamp()}`);
  const runRoot = args.outputDir
    ? path.resolve(args.outputDir)
    : path.resolve(config.logging.dir, 'runs');
  const runDir = path.join(runRoot, runId);

  fs.mkdirSync(runDir, { recursive: true });
  config.logging.dir = runDir;
  config.logging.provenance = path.join(runDir, 'provenance.jsonl');
  config.logging.metrics = path.join(runDir, 'metrics.jsonl');
  provenanceLogger.configurePaths(config.logging);

  return {
    runId,
    runDir,
    startedAt: new Date().toISOString(),
    provenanceFile: config.logging.provenance,
    metricsFile: config.logging.metrics,
  };
}

function commandVersion(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function buildEnvironmentSnapshot(runContext) {
  const cpus = os.cpus();
  return {
    runId: runContext.runId,
    generatedAt: new Date().toISOString(),
    platform: {
      os: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpu: cpus[0]?.model || null,
      logicalCores: cpus.length,
      totalMemoryGb: parseFloat((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
    },
    runtime: {
      node: process.version,
      npm: commandVersion('npm --version'),
    },
    dependencies: {
      eslint: packageJson.dependencies?.eslint || packageJson.devDependencies?.eslint || null,
      eslintPluginSecurity: packageJson.dependencies?.['eslint-plugin-security'] || null,
      jest: packageJson.devDependencies?.jest || null,
    },
    llm: {
      provider: config.llm.provider,
      openaiModel: config.llm.openai.model,
      anthropicModel: config.llm.anthropic.model,
      ollamaModel: config.llm.ollama.model,
      temperature: config.llm.openai.temperature,
      maxTokens: config.llm.openai.maxTokens,
    },
    validation: {
      semgrepEnabled: config.validation.semgrepEnabled,
      eslintEnabled: config.validation.eslintEnabled,
      semgrepRules: config.validation.semgrepRules,
      semgrepVersion: commandVersion('semgrep --version'),
    },
    policy: {
      ruleStorePath: config.policy.ruleStorePath,
      maxRegenerations: config.policy.maxRegenerations,
    },
    experiment: {
      repetitions: REPETITIONS,
      runTests: RUN_TESTS,
      testCommand: RUN_TESTS ? TEST_COMMAND : null,
    },
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function runTests(context) {
  if (!RUN_TESTS) return null;

  const started = Date.now();
  const logDir = path.resolve(config.logging.dir, 'test-results');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const outputFile = path.join(logDir, `vg_test_${uuidv4()}.json`);
  const quotedOutput = `"${outputFile}"`;
  const command = `${TEST_COMMAND} ${quotedOutput}`;
  const stamp = safeTimestamp();
  const safeTaskId = sanitizeId(context?.taskId || 'TASK_UNKNOWN');
  const safeMode = sanitizeId(context?.mode || 'mode');
  const safeRep = sanitizeId(context?.repetition || '1');
  const artifactPath = path.join(logDir, `test_${safeMode}_${safeTaskId}_rep${safeRep}_${stamp}.json`);

  try {
    execSync(command, { stdio: 'pipe' });
  } catch (err) {
    if (!fs.existsSync(outputFile)) {
      return {
        passed: 0,
        failed: 0,
        total: 0,
        durationMs: Date.now() - started,
        command,
        artifactPath: null,
        error: 'Test command failed and no output file was produced.',
      };
    }
  }

  let parsed = null;
  let raw = null;
  try {
    raw = fs.readFileSync(outputFile, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  } finally {
    if (raw) {
      fs.writeFileSync(artifactPath, raw, 'utf8');
    }
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
  }

  if (!parsed) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      durationMs: Date.now() - started,
      command,
      artifactPath: raw ? artifactPath : null,
      error: 'Test output could not be parsed.',
    };
  }

  return {
    passed: parsed.numPassedTests || 0,
    failed: parsed.numFailedTests || 0,
    total: parsed.numTotalTests || 0,
    durationMs: parsed.testDuration || (Date.now() - started),
    success: Boolean(parsed.success),
    command,
    artifactPath: raw ? artifactPath : null,
  };
}

async function runBaseline(task, prompt, repetition, runContext) {
  console.log(`  [BASELINE] Running ${task.id}: ${task.label} (rep ${repetition})`);
  const session = provenanceLogger.startSession(task.id, 'baseline');
  session.prompt = prompt;
  session.repetition = repetition;
  session.experimentRunId = runContext.runId;
  session.experimentRunDir = runContext.runDir;

  const enrichment = {
    enriched: false,
    systemPrompt: 'You are a senior Node.js engineer. Return only clean JavaScript code.',
    userPrompt: prompt,
    appliedCategories: [],
  };

  const generation = await llmConnector.generate(enrichment);
  session.model = `${generation.provider}/${generation.model}`;
  session.generatedCode = generation.code;
  session.rawGeneratedCode = generation.rawCode || generation.code;
  session.responseNormalization = generation.responseNormalization || null;
  session.enrichedPrompt = prompt;

  const validation = await validationEngine.validate(generation.code);
  session.validationFindings = validation.findings;
  session.validationToolsRun = validation.toolsRun;
  session.validationToolErrors = validation.toolErrors || [];
  session.policyDecision = 'NOT_APPLIED';
  session.approved = false;
  session.testResults = runTests({ taskId: task.id, mode: 'baseline', repetition });

  const record = provenanceLogger.commit(session);
  console.log(`  [BASELINE] ${task.id} rep ${repetition} done. Findings: ${validation.findings.length}`);
  return record;
}

async function runVibeGuard(task, prompt, repetition, runContext) {
  console.log(`  [VIBEGUARD] Running ${task.id}: ${task.label} (rep ${repetition})`);
  const result = await orchestrator.run(prompt, {
    taskId: task.id,
    mode: 'vibeguard',
    repetition,
    experimentRunId: runContext.runId,
    experimentRunDir: runContext.runDir,
    postProcess: async () => ({
      testResults: runTests({ taskId: task.id, mode: 'vibeguard', repetition }),
    }),
  });
  console.log(
    `  [VIBEGUARD] ${task.id} rep ${repetition} done. Decision: ${result.decision.decision}. ` +
    `Findings: ${result.findings.length}. Regenerations: ${result.regenerationCount}`
  );
  return result;
}

async function main() {
  const runContext = createRunContext(cliArgs);
  const environment = buildEnvironmentSnapshot(runContext);
  writeJson(path.join(runContext.runDir, 'environment.json'), environment);

  console.log('\nVibeGuard Experiment Runner');
  console.log('============================\n');
  console.log(`Run ID: ${runContext.runId}`);
  console.log(`Run directory: ${runContext.runDir}`);
  console.log(`Repetitions: ${REPETITIONS}\n`);

  for (const task of TASKS) {
    const promptFile = path.join(TASK_DIR, task.file);
    if (!fs.existsSync(promptFile)) {
      console.warn(`  SKIP: ${task.file} not found.`);
      continue;
    }

    const prompt = fs.readFileSync(promptFile, 'utf8').trim();
    console.log(`\nTask ${task.id}: ${task.label}`);

    for (let repetition = 1; repetition <= REPETITIONS; repetition++) {
      try {
        await runBaseline(task, prompt, repetition, runContext);
        await runVibeGuard(task, prompt, repetition, runContext);
      } catch (err) {
        console.error(`  ERROR in ${task.id} repetition ${repetition}: ${err.message}`);
      }
    }
  }

  const summary = generateExperimentSummary({
    metrics: provenanceLogger.loadMetrics(),
    sessions: provenanceLogger.loadAllSessions(),
    tasks: TASKS,
    runContext: {
      ...runContext,
      completedAt: new Date().toISOString(),
    },
    environment,
  });
  const csvTables = exportCsvTables(summary);

  const summaryPath = path.join(runContext.runDir, 'summary.json');
  const summaryCsvPath = path.join(runContext.runDir, 'summary.csv');
  const deltasCsvPath = path.join(runContext.runDir, 'task_deltas.csv');
  writeJson(summaryPath, summary);
  fs.writeFileSync(summaryCsvPath, csvTables.summaryCsv, 'utf8');
  fs.writeFileSync(deltasCsvPath, csvTables.deltasCsv, 'utf8');

  console.log('\n\nExperiment Complete - Summary');
  console.log('==============================');
  for (const data of summary.overallByMode) {
    console.log(`\n${data.mode.toUpperCase()}`);
    console.log(`  Sessions:                       ${data.sessions}`);
    console.log(`  Avg Vulnerability Density/1000: ${data.avgVulnerabilityDensity}`);
    console.log(`  Avg Critical Findings:          ${data.avgCriticalFindings}`);
    console.log(`  Avg Warning Findings:           ${data.avgWarningFindings}`);
    console.log(`  Avg Total Findings:             ${data.avgTotalFindings}`);
    console.log(`  Avg Duration (ms):              ${data.avgDurationMs}`);
    console.log(`  Approval Rate (%):              ${data.approvalRate}`);
    console.log(`  Review Required Rate (%):       ${data.reviewRequiredRate}`);
    console.log(`  Tool Error Sessions:            ${data.toolErrorSessions}`);
    if (data.avgTestPassRate !== null) {
      console.log(`  Avg Test Pass Rate (%):         ${data.avgTestPassRate}`);
    }
  }

  console.log(`\nSummary JSON written to ${summaryPath}`);
  console.log(`Summary CSV written to ${summaryCsvPath}`);
  console.log(`Task delta CSV written to ${deltasCsvPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error in experiment runner:', err);
    process.exit(1);
  });
}

module.exports = {
  buildEnvironmentSnapshot,
  createRunContext,
  parseArgs,
  runTests,
};
