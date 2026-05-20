'use strict';
const path = require('path');
const fs = require('fs');

let logger;

beforeEach(() => {
  jest.resetModules();
  const tempDir = path.join(
    process.cwd(),
    'tmp',
    'vg_test_logs',
    `${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
  process.env.VG_LOG_DIR = tempDir;
  process.env.VG_PROVENANCE_FILE = path.join(tempDir, 'provenance.jsonl');
  process.env.VG_METRICS_FILE = path.join(tempDir, 'metrics.jsonl');
  fs.mkdirSync(tempDir, { recursive: true });
  logger = require('../src/logger/provenanceLogger');
});

describe('ProvenanceLogger', () => {
  test('startSession returns a session with correct fields', () => {
    const session = logger.startSession('T1', 'vibeguard');
    expect(session.sessionId).toBeTruthy();
    expect(session.taskId).toBe('T1');
    expect(session.mode).toBe('vibeguard');
    expect(session.approved).toBe(false);
  });

  test('commit writes a record to provenance file', () => {
    const session = logger.startSession('T2', 'baseline');
    session.generatedCode = 'const x = 1;';
    session.validationFindings = [];
    session.policyDecision = 'NOT_APPLIED';
    logger.commit(session);
    const records = logger.loadAllSessions();
    expect(records.length).toBe(1);
    expect(records[0].taskId).toBe('T2');
  });

  test('metrics file is written on commit', () => {
    const session = logger.startSession('T3', 'vibeguard');
    session.generatedCode = 'const x = 1;\nconst y = 2;';
    session.validationFindings = [{ severity: 'ERROR' }, { severity: 'WARNING' }];
    session.policyDecision = 'REGENERATE';
    session.approved = false;
    session.developmentTimeMs = 2500;
    session.testResults = { passed: 8, failed: 2, total: 10, durationMs: 1200 };
    logger.commit(session);
    const metrics = logger.loadMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0].criticalFindings).toBe(1);
    expect(metrics[0].warningFindings).toBe(1);
    expect(metrics[0].developmentTimeMs).toBe(2500);
    expect(metrics[0].testPassRate).toBe(80.00);
  });

  test('metrics include policy findings separately from validation findings', () => {
    const session = logger.startSession('T4', 'vibeguard');
    session.generatedCode = 'const token = process.env.JWT_SECRET;';
    session.validationFindings = [];
    session.policyFindings = [
      { tool: 'policy', ruleId: 'VG-POL-X', severity: 'WARNING', message: 'Review token handling.' },
    ];
    session.policyDecision = 'WARN';
    session.policyReason = 'Policy warning requires review.';
    logger.commit(session);

    const metrics = logger.loadMetrics();
    expect(metrics[0].policyFindings).toBe(1);
    expect(metrics[0].warningFindings).toBe(1);
    expect(metrics[0].totalFindings).toBe(1);
    expect(metrics[0].reviewRequired).toBe(true);
  });

  test('logReview writes a review metrics event', () => {
    logger.logReview('S_REVIEW', true, 'Approved for thesis demo.');
    const metrics = logger.loadMetrics();
    expect(metrics[0].type).toBe('review');
    expect(metrics[0].reviewApproved).toBe(true);
  });

  test('generateSummary returns per-mode aggregates', () => {
    // baseline session
    const s1 = logger.startSession('T1', 'baseline');
    s1.generatedCode = 'const x=1;';
    s1.validationFindings = [{ severity: 'ERROR' }];
    s1.policyDecision = 'NOT_APPLIED';
    s1.developmentTimeMs = 1000;
    s1.testResults = { passed: 3, failed: 1, total: 4, durationMs: 200 };
    logger.commit(s1);

    // vibeguard session
    const s2 = logger.startSession('T1', 'vibeguard');
    s2.generatedCode = 'const x=1;';
    s2.validationFindings = [];
    s2.policyDecision = 'ACCEPT';
    s2.approved = true;
    s2.developmentTimeMs = 2000;
    s2.testResults = { passed: 4, failed: 0, total: 4, durationMs: 250 };
    logger.commit(s2);

    const summary = logger.generateSummary();
    expect(summary.baseline).toBeDefined();
    expect(summary.vibeguard).toBeDefined();
    expect(summary.vibeguard.approvalRate).toBe(100.0);
    expect(summary.baseline.avgTestPassRate).toBe(75.00);
    expect(summary.vibeguard.avgTestPassRate).toBe(100.00);
  });
});
