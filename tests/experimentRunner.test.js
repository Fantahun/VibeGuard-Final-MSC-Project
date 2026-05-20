'use strict';
const fs = require('fs');
const path = require('path');

describe('experiment runner test artifacts', () => {
    const tempDir = path.join(process.cwd(), 'tmp', 'vg_runner_tests');
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
        jest.resetModules();
        jest.doMock('child_process', () => ({
            execSync: jest.fn((command) => {
                const outputMatch = command.match(/"([^"]+)"\s*$/);
                const out = outputMatch ? outputMatch[1] : null;
                if (out) {
                    fs.writeFileSync(out, JSON.stringify({
                        numPassedTests: 2,
                        numFailedTests: 1,
                        numTotalTests: 3,
                        success: false,
                        testDuration: 456,
                    }));
                }
            }),
        }));
        process.env.VG_LOG_DIR = tempDir;
        process.env.VG_RUN_TESTS = 'true';
        process.env.VG_TEST_COMMAND = `node "${scriptPath}"`;

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

    test('parses run metadata arguments', () => {
        jest.resetModules();
        const { parseArgs } = require('../src/experiment/runner');
        const result = parseArgs([
            'node',
            'runner.js',
            '--repetitions',
            '3',
            '--run-id',
            'formal-batch',
            '--output-dir',
            './logs/runs',
        ]);

        expect(result.repetitions).toBe('3');
        expect(result.runId).toBe('formal-batch');
        expect(result.outputDir).toBe('./logs/runs');
    });
});
