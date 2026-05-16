'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use temp log dir for tests (set before module load)
const tempDir = path.join(os.tmpdir(), 'vg_test_logs_sm');
process.env.VG_LOG_DIR = tempDir;
process.env.VG_PROVENANCE_FILE = path.join(tempDir, 'provenance.jsonl');
process.env.VG_METRICS_FILE = path.join(tempDir, 'metrics.jsonl');

const sessionManager = require('../src/orchestrator/sessionManager');

beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    [process.env.VG_PROVENANCE_FILE, process.env.VG_METRICS_FILE].forEach(f => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
    });
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
