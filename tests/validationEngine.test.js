'use strict';

const path = require('path');

describe('ValidationEngine', () => {
  let execFileSyncMock;

  beforeEach(() => {
    jest.resetModules();
    execFileSyncMock = jest.fn(() => JSON.stringify([
      {
        messages: [
          {
            ruleId: 'security/detect-object-injection',
            severity: 1,
            message: 'Generic Object Injection Sink',
            line: 1,
          },
        ],
      },
    ]));
    jest.doMock('child_process', () => ({ execFileSync: execFileSyncMock }));
    process.env.VG_SEMGREP_ENABLED = 'false';
    process.env.VG_ESLINT_ENABLED = 'true';
    process.env.VG_TEMP_DIR = path.join(process.cwd(), 'tmp', 'vg_validation_tests');
  });

  afterEach(() => {
    delete process.env.VG_SEMGREP_ENABLED;
    delete process.env.VG_ESLINT_ENABLED;
    delete process.env.VG_TEMP_DIR;
  });

  test('runs ESLint security using the flat config path', async () => {
    const validator = require('../src/validator/validationEngine');
    const result = await validator.validate('const data = {}; const key = req.query.key; data[key] = 1;');

    expect(result.toolsRun).toContain('eslint-security');
    expect(result.toolErrors).toHaveLength(0);
    expect(result.findings.some(f => f.ruleId === 'security/detect-object-injection')).toBe(true);
    expect(execFileSyncMock.mock.calls[0][1].some(arg => arg.endsWith('eslint.validation.config.js'))).toBe(true);
  });
});
