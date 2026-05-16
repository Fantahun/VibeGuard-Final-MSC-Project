'use strict';
const enricher = require('../src/enricher/promptEnricher');
const classifier = require('../src/classifier/riskClassifier');

describe('PromptEnricher', () => {
  test('does not enrich non-sensitive prompt', () => {
    const risk = classifier.classify('Generate fibonacci sequence numbers');
    const result = enricher.enrich('Generate fibonacci sequence numbers', risk);
    expect(result.enriched).toBe(false);
    expect(result.appliedCategories).toHaveLength(0);
  });

  test('enriches authentication prompt with auth and general templates', () => {
    const prompt = 'Build a login endpoint with JWT token';
    const risk = classifier.classify(prompt);
    const result = enricher.enrich(prompt, risk);
    expect(result.enriched).toBe(true);
    expect(result.userPrompt).toContain('SECURITY REQUIREMENTS');
    expect(result.userPrompt).toContain('bcrypt');
    expect(result.userPrompt).toContain('JWT');
  });

  test('enriches database prompt with SQL injection guidance', () => {
    const prompt = 'Create a query function that fetches users by email from PostgreSQL';
    const risk = classifier.classify(prompt);
    const result = enricher.enrich(prompt, risk);
    expect(result.enriched).toBe(true);
    expect(result.userPrompt).toContain('parameterized');
  });

  test('builds corrective prompt for regeneration with finding context', () => {
    const prompt = 'Build a login endpoint with JWT token';
    const risk = classifier.classify(prompt);
    const findings = [
      { severity: 'ERROR', ruleId: 'bandit.hardcoded-password', message: 'Hardcoded secret found', line: 5 },
    ];
    const result = enricher.enrichForRegeneration(prompt, risk, findings);
    expect(result.userPrompt).toContain('PREVIOUS ATTEMPT WAS REJECTED');
    expect(result.userPrompt).toContain('Hardcoded secret found');
  });

  test('enriched prompt contains system header', () => {
    const prompt = 'Build a login endpoint with JWT token';
    const risk = classifier.classify(prompt);
    const result = enricher.enrich(prompt, risk);
    expect(result.systemPrompt).toContain('security engineer');
  });
});
