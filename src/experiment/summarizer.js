'use strict';
/**
 * Experiment Summarizer
 * Converts JSONL metrics into table-ready Chapter 5 summaries.
 */

const MODE_ORDER = ['baseline', 'vibeguard'];

const TASK_MODE_COLUMNS = [
  'scope',
  'taskId',
  'mode',
  'sessions',
  'avgVulnerabilityDensity',
  'medianVulnerabilityDensity',
  'avgCriticalFindings',
  'avgWarningFindings',
  'avgTotalFindings',
  'avgDurationMs',
  'medianDurationMs',
  'avgRegenerationCount',
  'approvalRate',
  'reviewRequiredRate',
  'toolErrorSessions',
  'responseNormalizedCount',
  'avgTestPassRate',
];

const DELTA_COLUMNS = [
  'taskId',
  'baselineSessions',
  'vibeguardSessions',
  'deltaAvgVulnerabilityDensity',
  'deltaAvgCriticalFindings',
  'deltaAvgWarningFindings',
  'deltaAvgTotalFindings',
  'deltaAvgDurationMs',
  'deltaAvgRegenerationCount',
  'deltaAvgTestPassRate',
];

function mean(values) {
  const numeric = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function median(values) {
  const numeric = values
    .filter(value => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (numeric.length === 0) return null;
  const mid = Math.floor(numeric.length / 2);
  return numeric.length % 2 === 0
    ? (numeric[mid - 1] + numeric[mid]) / 2
    : numeric[mid];
}

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return parseFloat(value.toFixed(digits));
}

function sessionRows(metrics) {
  return (metrics || []).filter(row => row && row.type !== 'review' && row.mode);
}

function aggregate(rows, scope, taskId, mode) {
  const sessions = rows.length;
  if (sessions === 0) {
    return {
      scope,
      taskId,
      mode,
      sessions: 0,
      avgVulnerabilityDensity: null,
      medianVulnerabilityDensity: null,
      avgCriticalFindings: null,
      avgWarningFindings: null,
      avgTotalFindings: null,
      avgDurationMs: null,
      medianDurationMs: null,
      avgRegenerationCount: null,
      approvalRate: null,
      reviewRequiredRate: null,
      toolErrorSessions: 0,
      responseNormalizedCount: 0,
      avgTestPassRate: null,
    };
  }

  return {
    scope,
    taskId,
    mode,
    sessions,
    avgVulnerabilityDensity: round(mean(rows.map(row => row.vulnerabilityDensity)), 4),
    medianVulnerabilityDensity: round(median(rows.map(row => row.vulnerabilityDensity)), 4),
    avgCriticalFindings: round(mean(rows.map(row => row.criticalFindings))),
    avgWarningFindings: round(mean(rows.map(row => row.warningFindings))),
    avgTotalFindings: round(mean(rows.map(row => row.totalFindings))),
    avgDurationMs: round(mean(rows.map(row => row.durationMs)), 0),
    medianDurationMs: round(median(rows.map(row => row.durationMs)), 0),
    avgRegenerationCount: round(mean(rows.map(row => row.regenerationCount))),
    approvalRate: round((rows.filter(row => row.approved).length / sessions) * 100, 1),
    reviewRequiredRate: round((rows.filter(row => row.reviewRequired).length / sessions) * 100, 1),
    toolErrorSessions: rows.filter(row => row.validationToolErrors > 0).length,
    responseNormalizedCount: rows.filter(row => row.responseNormalized).length,
    avgTestPassRate: round(mean(rows.map(row => row.testPassRate))),
  };
}

function byTaskMode(rows, tasks = []) {
  const knownTaskIds = tasks.map(task => task.id);
  const observedTaskIds = [...new Set(rows.map(row => row.taskId))];
  const taskIds = [...new Set([...knownTaskIds, ...observedTaskIds])].filter(Boolean);
  const aggregates = [];

  for (const taskId of taskIds) {
    for (const mode of MODE_ORDER) {
      const modeRows = rows.filter(row => row.taskId === taskId && row.mode === mode);
      if (modeRows.length > 0) {
        aggregates.push(aggregate(modeRows, 'task', taskId, mode));
      }
    }
  }

  return aggregates;
}

function overallByMode(rows) {
  return MODE_ORDER
    .map(mode => aggregate(rows.filter(row => row.mode === mode), 'overall', 'ALL', mode))
    .filter(row => row.sessions > 0);
}

function diff(vibeguard, baseline, key) {
  if (!vibeguard || !baseline) return null;
  if (typeof vibeguard[key] !== 'number' || typeof baseline[key] !== 'number') return null;
  return round(vibeguard[key] - baseline[key], key.toLowerCase().includes('density') ? 4 : 2);
}

function deltas(taskRows) {
  const taskIds = [...new Set(taskRows.map(row => row.taskId))].filter(taskId => taskId !== 'ALL');
  return taskIds.map(taskId => {
    const baseline = taskRows.find(row => row.taskId === taskId && row.mode === 'baseline');
    const vibeguard = taskRows.find(row => row.taskId === taskId && row.mode === 'vibeguard');
    return {
      taskId,
      baselineSessions: baseline?.sessions || 0,
      vibeguardSessions: vibeguard?.sessions || 0,
      deltaAvgVulnerabilityDensity: diff(vibeguard, baseline, 'avgVulnerabilityDensity'),
      deltaAvgCriticalFindings: diff(vibeguard, baseline, 'avgCriticalFindings'),
      deltaAvgWarningFindings: diff(vibeguard, baseline, 'avgWarningFindings'),
      deltaAvgTotalFindings: diff(vibeguard, baseline, 'avgTotalFindings'),
      deltaAvgDurationMs: diff(vibeguard, baseline, 'avgDurationMs'),
      deltaAvgRegenerationCount: diff(vibeguard, baseline, 'avgRegenerationCount'),
      deltaAvgTestPassRate: diff(vibeguard, baseline, 'avgTestPassRate'),
    };
  });
}

function rowsToCsv(rows, columns) {
  const escape = value => {
    if (value === null || value === undefined) return '';
    const text = Array.isArray(value) || typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => escape(row[column])).join(',')),
  ].join('\n');
}

function generateExperimentSummary({ metrics, sessions, tasks, runContext, environment }) {
  const rows = sessionRows(metrics);
  const taskModeRows = byTaskMode(rows, tasks);
  const overallRows = overallByMode(rows);
  const deltaRows = deltas(taskModeRows);

  return {
    metadata: {
      runId: runContext?.runId || null,
      runDir: runContext?.runDir || null,
      generatedAt: new Date().toISOString(),
      sessionRecords: (sessions || []).filter(record => record && !record.type).length,
      metricRows: rows.length,
    },
    environment: environment || null,
    overallByMode: overallRows,
    byTaskMode: taskModeRows,
    deltas: deltaRows,
  };
}

function exportCsvTables(summary) {
  return {
    summaryCsv: rowsToCsv([
      ...(summary.overallByMode || []),
      ...(summary.byTaskMode || []),
    ], TASK_MODE_COLUMNS),
    deltasCsv: rowsToCsv(summary.deltas || [], DELTA_COLUMNS),
  };
}

module.exports = {
  TASK_MODE_COLUMNS,
  DELTA_COLUMNS,
  aggregate,
  exportCsvTables,
  generateExperimentSummary,
  rowsToCsv,
};
