'use strict';

const fs = require('fs');
const path = require('path');

describe('PolicyStore profiles', () => {
  test('loads comma-separated formal and demo rule files when requested', () => {
    jest.resetModules();
    const formal = path.join(process.cwd(), 'config', 'policyRules.json');
    const demo = path.join(process.cwd(), 'config', 'policyRules.demo.json');
    process.env.VG_POLICY_RULES = `${formal},${demo}`;

    const policyStore = require('../src/policy/policyStore');
    const findings = policyStore.evaluate("const token = 'demo-token';");

    expect(fs.existsSync(demo)).toBe(true);
    expect(findings.some(f => f.ruleId === 'VG-WARN-DEMO-001')).toBe(true);

    delete process.env.VG_POLICY_RULES;
  });
});
