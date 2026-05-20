'use strict';
const { PolicyEngine, DECISIONS } = require('../src/policy/policyEngine');

describe('PolicyEngine', () => {
  test('returns ACCEPT when no findings', () => {
    const result = PolicyEngine.evaluate([]);
    expect(result.decision).toBe(DECISIONS.ACCEPT);
    expect(result.blockers).toHaveLength(0);
  });

  test('returns REGENERATE for critical findings within retry limit', () => {
    const findings = [
      { tool: 'semgrep', ruleId: 'sqli', severity: 'ERROR', message: 'SQL Injection', line: 10, cwe: 'CWE-89' },
    ];
    const result = PolicyEngine.evaluate(findings, 0);
    expect(result.decision).toBe(DECISIONS.REGENERATE);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  test('returns WARN when critical findings persist after max retries', () => {
    const findings = [
      { tool: 'semgrep', ruleId: 'sqli', severity: 'ERROR', message: 'SQL Injection', line: 10, cwe: 'CWE-89' },
    ];
    const result = PolicyEngine.evaluate(findings, 999);
    expect(result.decision).toBe(DECISIONS.WARN);
  });

  test('returns WARN for info-only findings', () => {
    const findings = [
      { tool: 'eslint-security', ruleId: 'security/detect-object-injection', severity: 'INFO', message: 'Possible injection', line: 3, cwe: null },
    ];
    const result = PolicyEngine.evaluate(findings, 0);
    expect(result.decision).toBe(DECISIONS.WARN);
    expect(result.blockers).toHaveLength(0);
  });

  test('formatReport returns readable string', () => {
    const decision = PolicyEngine.evaluate([]);
    const report = PolicyEngine.formatReport(decision);
    expect(typeof report).toBe('string');
    expect(report).toContain('ACCEPT');
  });

  test('CWE-based critical overrides INFO severity on the finding', () => {
    const findings = [
      { tool: 'semgrep', ruleId: 'detect-hardcoded', severity: 'WARNING', message: 'Hardcoded secret', line: 2, cwe: 'CWE-798' },
    ];
    const result = PolicyEngine.evaluate(findings, 0);
    expect(result.decision).toBe(DECISIONS.REGENERATE);
  });

  test('policy rules trigger REGENERATE for forbidden patterns', () => {
    const code = "const x = eval('1 + 1');";
    const result = PolicyEngine.evaluate([], 0, code);
    expect(result.decision).toBe(DECISIONS.REGENERATE);
  });

  test('hardcoded secret triggers REGENERATE', () => {
    const code = "const JWT_SECRET = 'supersecret';";
    const result = PolicyEngine.evaluate([], 0, code);
    expect(result.decision).toBe(DECISIONS.REGENERATE);
  });

  test('validation tool errors trigger WARN instead of silent acceptance', () => {
    const result = PolicyEngine.evaluate([], 0, 'const x = 1;', {
      toolErrors: [{ tool: 'semgrep', message: 'semgrep is enabled but was not found on PATH.' }],
    });
    expect(result.decision).toBe(DECISIONS.WARN);
    expect(result.toolErrors).toHaveLength(1);
  });

  test('formal policy does not include demo-only WARN rule by default', () => {
    const code = 'const token = process.env.JWT_SECRET;';
    const result = PolicyEngine.evaluate([], 0, code);
    expect(result.policyFindings.some(f => f.ruleId === 'VG-WARN-DEMO-001')).toBe(false);
  });
});
