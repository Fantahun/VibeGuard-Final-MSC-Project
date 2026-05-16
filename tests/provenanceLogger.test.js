'use strict';
const path = require('path');
const fs = require('fs');

// Use a temp log dir for tests
process.env.VG_LOG_DIR = '/tmp/vg_test_logs';
process.env.VG_PROVENANCE_FILE = '/tmp/vg_test_logs/provenance.jsonl';
process.env.VG_METRICS_FILE = '/tmp/vg_test_logs/metrics.jsonl';

const logger = require('../src/logger/provenanceLogger');

beforeEach(() => {
  fs.mkdirSync('/tmp/vg_test_logs', { recursive: true });
  // Clean log files before each test
  [process.env.VG_PROVENANCE_FILE, process.env.VG_METRICS_FILE].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
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
