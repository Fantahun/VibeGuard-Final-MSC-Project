'use strict';

const {
  exportCsvTables,
  generateExperimentSummary,
} = require('../src/experiment/summarizer');

describe('Experiment summarizer', () => {
  const metrics = [
    {
      sessionId: 'B1',
      taskId: 'T1',
      mode: 'baseline',
      durationMs: 100,
      criticalFindings: 1,
      warningFindings: 1,
      totalFindings: 2,
      vulnerabilityDensity: 20,
      regenerationCount: 0,
      approved: false,
      reviewRequired: false,
      validationToolErrors: 0,
      responseNormalized: true,
      testPassRate: 50,
    },
    {
      sessionId: 'V1',
      taskId: 'T1',
      mode: 'vibeguard',
      durationMs: 150,
      criticalFindings: 0,
      warningFindings: 1,
      totalFindings: 1,
      vulnerabilityDensity: 10,
      regenerationCount: 1,
      approved: true,
      reviewRequired: true,
      validationToolErrors: 0,
      responseNormalized: false,
      testPassRate: 100,
    },
    {
      type: 'review',
      sessionId: 'V1',
      reviewApproved: true,
    },
  ];

  test('generates task, overall, and delta summaries', () => {
    const summary = generateExperimentSummary({
      metrics,
      sessions: [],
      tasks: [{ id: 'T1' }],
      runContext: { runId: 'run-test', runDir: 'logs/runs/run-test' },
      environment: { runtime: { node: 'v-test' } },
    });

    expect(summary.metadata.metricRows).toBe(2);
    expect(summary.overallByMode).toHaveLength(2);
    expect(summary.byTaskMode).toHaveLength(2);
    expect(summary.deltas[0].deltaAvgVulnerabilityDensity).toBe(-10);
    expect(summary.deltas[0].deltaAvgTestPassRate).toBe(50);
  });

  test('exports table-ready CSV strings', () => {
    const summary = generateExperimentSummary({
      metrics,
      sessions: [],
      tasks: [{ id: 'T1' }],
      runContext: { runId: 'run-test' },
      environment: null,
    });
    const csv = exportCsvTables(summary);

    expect(csv.summaryCsv).toContain('scope,taskId,mode');
    expect(csv.summaryCsv).toContain('overall,ALL,baseline');
    expect(csv.deltasCsv).toContain('taskId,baselineSessions,vibeguardSessions');
  });
});
