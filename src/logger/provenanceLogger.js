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
   * Append a simplified metrics record for quantitative analysis.
   * @param {object} record
   */
  _updateMetrics(record) {
    const findings = record.validationFindings || [];
    const criticalCount = findings.filter(f => f.severity === 'ERROR').length;
    const warningCount = findings.filter(f => f.severity === 'WARNING').length;
    const infoCount = findings.filter(f => f.severity === 'INFO').length;

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
      linesOfCode,
      criticalFindings: criticalCount,
      warningFindings: warningCount,
      infoFindings: infoCount,
      totalFindings: findings.length,
      vulnerabilityDensity: parseFloat(vulnerabilityDensity.toFixed(4)),
      regenerationCount: record.regenerationCount,
      approved: record.approved,
      policyDecision: record.policyDecision,
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
      const rows = metrics.filter(m => m.mode === mode);
      if (rows.length === 0) continue;

      const avgVD = rows.reduce((a, r) => a + r.vulnerabilityDensity, 0) / rows.length;
      const avgDuration = rows.reduce((a, r) => a + r.durationMs, 0) / rows.length;
      const avgCritical = rows.reduce((a, r) => a + r.criticalFindings, 0) / rows.length;
      const approvalRate = rows.filter(r => r.approved).length / rows.length;

      summary[mode] = {
        sessions: rows.length,
        avgVulnerabilityDensity: parseFloat(avgVD.toFixed(4)),
        avgDurationMs: parseFloat(avgDuration.toFixed(0)),
        avgCriticalFindings: parseFloat(avgCritical.toFixed(2)),
        approvalRate: parseFloat((approvalRate * 100).toFixed(1)),
      };
    }

    return summary;
  }
}

module.exports = new ProvenanceLogger();
