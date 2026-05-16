'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('experiment runner test artifacts', () => {
    const tempDir = path.join(os.tmpdir(), 'vg_runner_tests');
    const scriptPath = path.join(tempDir, 'emit-test-json.js');

    beforeAll(() => {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(
            scriptPath,
            "const fs = require('fs');\n" +
            "const out = process.argv[2];\n" +
            "fs.writeFileSync(out, JSON.stringify({ numPassedTests: 2, numFailedTests: 1, numTotalTests: 3, success: false, testDuration: 456 }));\n",
            'utf8'
        );
    });

    test('writes raw test output artifact to logs directory', () => {
        process.env.VG_LOG_DIR = tempDir;
        process.env.VG_RUN_TESTS = 'true';
        process.env.VG_TEST_COMMAND = `node "${scriptPath}"`;

        jest.resetModules();
        const { runTests } = require('../src/experiment/runner');

        const result = runTests({ taskId: 'T1', mode: 'baseline' });
        expect(result).toBeTruthy();
        expect(result.artifactPath).toBeTruthy();
        expect(fs.existsSync(result.artifactPath)).toBe(true);

        const raw = fs.readFileSync(result.artifactPath, 'utf8');
        const parsed = JSON.parse(raw);
        expect(parsed.numPassedTests).toBe(2);
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.total).toBe(3);
    });
});
