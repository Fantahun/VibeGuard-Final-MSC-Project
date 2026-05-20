'use strict';
const fs = require('fs');
const path = require('path');

let sessionManager;

beforeEach(() => {
    jest.resetModules();
    const tempDir = path.join(
        process.cwd(),
        'tmp',
        'vg_test_logs_sm',
        `${Date.now()}_${Math.random().toString(16).slice(2)}`
    );
    process.env.VG_LOG_DIR = tempDir;
    process.env.VG_PROVENANCE_FILE = path.join(tempDir, 'provenance.jsonl');
    process.env.VG_METRICS_FILE = path.join(tempDir, 'metrics.jsonl');
    fs.mkdirSync(tempDir, { recursive: true });
    sessionManager = require('../src/orchestrator/sessionManager');
});

describe('SessionManager', () => {
    test('start returns a session object', () => {
        const session = sessionManager.start('T1', 'vibeguard');
        expect(session.sessionId).toBeTruthy();
        expect(session.taskId).toBe('T1');
        expect(session.mode).toBe('vibeguard');
    });

    test('commit persists session', () => {
        const session = sessionManager.start('T2', 'baseline');
        session.generatedCode = 'const x = 1;';
        session.validationFindings = [];
        session.policyDecision = 'NOT_APPLIED';
        sessionManager.commit(session);
        const contents = fs.readFileSync(process.env.VG_PROVENANCE_FILE, 'utf8');
        expect(contents).toContain('T2');
    });
});
