'use strict';
/**
 * VibeGuard Provenance Logger
 * Records the full trace of each AI-assisted coding session:
 * prompt, enriched prompt, model metadata, generated output,
 * validation findings, policy decision, and timing.
 * Each session is written as a JSON line to provenance.jsonl
 * for reproducibility and empirical evaluation.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/default');

class ProvenanceLogger {
  constructor() {
    const logDir = path.resolve(config.logging.dir);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    this.provenanceFile = path.resolve(config.logging.provenance);
    this.metricsFile = path.resolve(config.logging.metrics);
  }

  /**
   * Repoint this logger to a run-specific output directory.
   * @param {object} paths - { dir, provenance, metrics }
   * @returns {object} resolved paths
   */
  configurePaths(paths = {}) {
    const logDir = path.resolve(paths.dir || config.logging.dir);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    this.provenanceFile = path.resolve(paths.provenance || path.join(logDir, 'provenance.jsonl'));
    this.metricsFile = path.resolve(paths.metrics || path.join(logDir, 'metrics.jsonl'));

    return this.getPaths();
  }

  getPaths() {
    return {
      provenanceFile: this.provenanceFile,
      metricsFile: this.metricsFile,
      logDir: path.dirname(this.provenanceFile),
    };
  }

  /**
   * Create a new session record.
   * @param {string} taskId   - experiment task identifier
   * @param {string} mode     - 'baseline' | 'vibeguard'
   * @returns {object} session context
   */
  startSession(taskId, mode = 'vibeguard') {
    return {
      sessionId: uuidv4(),
      taskId,
      mode,
      startTime: Date.now(),
      prompt: null,
      enrichedPrompt: null,
      model: null,
      generatedCode: null,
      validationFindings: [],
      policyDecision: null,
      regenerationCount: 0,
      approved: false,
      developmentTimeMs: null,
      testResults: null,
      endTime: null,
      durationMs: null,
    };
  }

  /**
   * Persist the completed session to provenance log.
   * @param {object} session
   */
  commit(session) {
    const record = {
      ...session,
      endTime: Date.now(),
      durationMs: Date.now() - session.startTime,
    };
    fs.appendFileSync(this.provenanceFile, JSON.stringify(record) + '\n');
    this._updateMetrics(record);
    return record;
  }

  /**
   * Append a human review decision for WARN outcomes.
   * @param {string} sessionId
   * @param {boolean} approved
   * @param {string} [notes]
   */
  logReview(sessionId, approved, notes = '') {
    const reviewRecord = {
      type: 'review',
      sessionId,
      approved: Boolean(approved),
      notes,
      timestamp: Date.now(),
    };
    fs.appendFileSync(this.provenanceFile, JSON.stringify(reviewRecord) + '\n');
    fs.appendFileSync(this.metricsFile, JSON.stringify({
      type: 'review',
      sessionId,
      reviewApproved: Boolean(approved),
      reviewNotesPresent: Boolean(notes),
      timestamp: reviewRecord.timestamp,
    }) + '\n');
  }

  /**
   * Append a simplified metrics record for quantitative analysis.
   * @param {object} record
   */
  _updateMetrics(record) {
    const validationFindings = record.validationFindings || [];
    const policyFindings = record.policyFindings || [];
    const findings = [...validationFindings, ...policyFindings];
    const criticalCount = findings.filter(f => f.severity === 'ERROR').length;
    const warningCount = findings.filter(f => f.severity === 'WARNING').length;
    const infoCount = findings.filter(f => f.severity === 'INFO').length;
    const policyErrorCount = policyFindings.filter(f => f.severity === 'ERROR').length;
    const policyWarningCount = policyFindings.filter(f => f.severity === 'WARNING').length;
    const validationErrorCount = validationFindings.filter(f => f.severity === 'ERROR').length;
    const validationWarningCount = validationFindings.filter(f => f.severity === 'WARNING').length;
    const validationToolErrors = record.validationToolErrors || [];
    const testResults = record.testResults || null;

    const testPassRate = testResults && typeof testResults.passed === 'number' && typeof testResults.total === 'number'
      ? (testResults.total > 0 ? (testResults.passed / testResults.total) * 100 : 0)
      : null;

    const linesOfCode = record.generatedCode
      ? record.generatedCode.split('\n').filter(l => l.trim().length > 0).length
      : 0;

    const vulnerabilityDensity = linesOfCode > 0
      ? ((criticalCount + warningCount) / linesOfCode) * 1000
      : 0;

    const metricsRow = {
      sessionId: record.sessionId,
      taskId: record.taskId,
      mode: record.mode,
      model: record.model,
      durationMs: record.durationMs,
      developmentTimeMs: record.developmentTimeMs,
      linesOfCode,
      criticalFindings: criticalCount,
      warningFindings: warningCount,
      infoFindings: infoCount,
      totalFindings: findings.length,
      validationFindings: validationFindings.length,
      validationErrorFindings: validationErrorCount,
      validationWarningFindings: validationWarningCount,
      policyFindings: policyFindings.length,
      policyErrorFindings: policyErrorCount,
      policyWarningFindings: policyWarningCount,
      vulnerabilityDensity: parseFloat(vulnerabilityDensity.toFixed(4)),
      regenerationCount: record.regenerationCount,
      approved: record.approved,
      policyDecision: record.policyDecision,
      policyReason: record.policyReason || null,
      reviewRequired: record.policyDecision === 'WARN',
      reviewApproved: typeof record.reviewApproved === 'boolean' ? record.reviewApproved : null,
      validationToolsRun: record.validationToolsRun || [],
      validationToolErrors: validationToolErrors.length,
      validationToolErrorDetails: validationToolErrors,
      responseNormalized: Boolean(record.responseNormalization?.normalized),
      responseNormalization: record.responseNormalization || null,
      testPassRate: testPassRate === null ? null : parseFloat(testPassRate.toFixed(2)),
      testDurationMs: testResults ? testResults.durationMs || null : null,
    };

    fs.appendFileSync(this.metricsFile, JSON.stringify(metricsRow) + '\n');
  }

  /**
   * Load all session records for analysis.
   * @returns {object[]} sessions
   */
  loadAllSessions() {
    if (!fs.existsSync(this.provenanceFile)) return [];
    return fs.readFileSync(this.provenanceFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  /**
   * Load metrics for reporting.
   * @returns {object[]} metrics rows
   */
  loadMetrics() {
    if (!fs.existsSync(this.metricsFile)) return [];
    return fs.readFileSync(this.metricsFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  /**
   * Generate a simple metrics summary per mode (baseline vs vibeguard).
   * @returns {object} summary
   */
  generateSummary() {
    const metrics = this.loadMetrics();
    const summary = {};

    for (const mode of ['baseline', 'vibeguard']) {
      const rows = metrics.filter(m => m.mode === mode && m.type !== 'review');
      if (rows.length === 0) continue;

      const avgVD = rows.reduce((a, r) => a + r.vulnerabilityDensity, 0) / rows.length;
      const avgDuration = rows.reduce((a, r) => a + r.durationMs, 0) / rows.length;
      const avgCritical = rows.reduce((a, r) => a + r.criticalFindings, 0) / rows.length;
      const avgWarning = rows.reduce((a, r) => a + r.warningFindings, 0) / rows.length;
      const avgTotalFindings = rows.reduce((a, r) => a + r.totalFindings, 0) / rows.length;
      const approvalRate = rows.filter(r => r.approved).length / rows.length;
      const reviewRequiredRate = rows.filter(r => r.reviewRequired).length / rows.length;
      const toolErrorSessions = rows.filter(r => r.validationToolErrors > 0).length;
      const devRows = rows.filter(r => typeof r.developmentTimeMs === 'number');
      const avgDevTime = devRows.length > 0
        ? devRows.reduce((a, r) => a + r.developmentTimeMs, 0) / devRows.length
        : null;
      const testRows = rows.filter(r => typeof r.testPassRate === 'number');
      const avgTestPassRate = testRows.length > 0
        ? testRows.reduce((a, r) => a + r.testPassRate, 0) / testRows.length
        : null;

      summary[mode] = {
        sessions: rows.length,
        avgVulnerabilityDensity: parseFloat(avgVD.toFixed(4)),
        avgDurationMs: parseFloat(avgDuration.toFixed(0)),
        avgCriticalFindings: parseFloat(avgCritical.toFixed(2)),
        avgWarningFindings: parseFloat(avgWarning.toFixed(2)),
        avgTotalFindings: parseFloat(avgTotalFindings.toFixed(2)),
        approvalRate: parseFloat((approvalRate * 100).toFixed(1)),
        reviewRequiredRate: parseFloat((reviewRequiredRate * 100).toFixed(1)),
        toolErrorSessions,
        avgDevelopmentTimeMs: avgDevTime === null ? null : parseFloat(avgDevTime.toFixed(0)),
        avgTestPassRate: avgTestPassRate === null ? null : parseFloat(avgTestPassRate.toFixed(2)),
      };
    }

    return summary;
  }
}

module.exports = new ProvenanceLogger();
