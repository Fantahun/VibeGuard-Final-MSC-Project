'use strict';
const classifier = require('../src/classifier/riskClassifier');

describe('RiskClassifier', () => {
  test('classifies SQL injection risk correctly', () => {
    const result = classifier.classify('Create an endpoint that runs a SQL query with user input');
    expect(result.isSecuritySensitive).toBe(true);
    expect(result.categories).toContain('database_access');
    expect(result.cwes).toContain('CWE-89');
  });

  test('classifies authentication risk correctly', () => {
    const result = classifier.classify('Build a login endpoint with JWT token generation');
    expect(result.isSecuritySensitive).toBe(true);
    expect(result.categories).toContain('authentication');
    expect(['HIGH', 'CRITICAL']).toContain(result.overallSeverity);
  });

  test('classifies command execution as CRITICAL', () => {
    const result = classifier.classify('Execute shell commands using child_process exec');
    expect(result.isSecuritySensitive).toBe(true);
    expect(result.overallSeverity).toBe('CRITICAL');
    expect(result.categories).toContain('command_execution');
  });

  test('classifies file upload risk correctly', () => {
    const result = classifier.classify('Build a secure file upload endpoint');
    expect(result.isSecuritySensitive).toBe(true);
    expect(result.categories).toContain('file_operations');
    expect(result.cwes).toContain('CWE-22');
  });

  test('classifies low-risk prompt as not security-sensitive', () => {
    const result = classifier.classify('Generate the fibonacci sequence up to a given number');
    expect(result.isSecuritySensitive).toBe(false);
    expect(result.overallSeverity).toBe('NONE');
  });

  test('throws on empty prompt', () => {
    expect(() => classifier.classify('')).toThrow();
  });

  test('detects multiple risk categories in one prompt', () => {
    const result = classifier.classify('Authentication endpoint that also writes SQL queries and uploads files');
    expect(result.categories.length).toBeGreaterThanOrEqual(3);
  });
});
