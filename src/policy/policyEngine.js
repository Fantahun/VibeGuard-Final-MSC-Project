'use strict';
/**
 * VibeGuard Policy and Decision Engine
 * Maps validation findings to one of three outcomes:
 *   ACCEPT    - code is compliant; pass to integration layer.
 *   REGENERATE - critical findings detected; retry with corrective prompt.
 *   WARN       - moderate issues present; escalate to developer for review.
 *
 * This is the enforcement core of the framework's security control loop.
 */
const config = require('../../config/default');
const policyStore = require('./policyStore');

const DECISIONS = Object.freeze({
  ACCEPT: 'ACCEPT',
  REGENERATE: 'REGENERATE',
  WARN: 'WARN',
});

class PolicyEngine {
  /**
   * Evaluate findings and return a structured policy decision.
   * @param {object[]} findings    - normalized findings from ValidationEngine
   * @param {number}   attempt     - current regeneration attempt count
   * @param {string}   code        - generated code for policy checks
   * @returns {object} decision record
   */
  evaluate(findings, attempt = 0, code = '') {
    const policyFindings = policyStore.evaluate(code);
    const combined = [...findings, ...policyFindings];
    const critical = combined.filter(f => config.policy.criticalSeverities.includes(f.severity));
    const warnings = combined.filter(f => config.policy.warnSeverities.includes(f.severity));

    // CWE-targeted critical findings take priority
    const cweCritical = combined.filter(
      f => f.cwe && config.policy.criticalCwes.includes(f.cwe)
    );

    const blockers = [...new Set([...critical, ...cweCritical])];

    if (blockers.length > 0 && attempt < config.policy.maxRegenerations) {
      return {
        decision: DECISIONS.REGENERATE,
        reason: `${blockers.length} critical finding(s) require remediation.`,
        blockers: blockers.map(this._summarize),
        warnings: warnings.map(this._summarize),
        policyFindings: policyFindings.map(this._summarize),
        attempt,
      };
    }

    if (blockers.length > 0 && attempt >= config.policy.maxRegenerations) {
      // Exhausted retries; escalate to developer
      return {
        decision: DECISIONS.WARN,
        reason: `Maximum regeneration attempts (${config.policy.maxRegenerations}) reached. ` +
                `${blockers.length} unresolved critical finding(s). Developer review required.`,
        blockers: blockers.map(this._summarize),
        warnings: warnings.map(this._summarize),
        policyFindings: policyFindings.map(this._summarize),
        attempt,
      };
    }

    if (warnings.length > 0) {
      return {
        decision: DECISIONS.WARN,
        reason: `${warnings.length} informational finding(s) noted.`,
        blockers: [],
        warnings: warnings.map(this._summarize),
        policyFindings: policyFindings.map(this._summarize),
        attempt,
      };
    }

    return {
      decision: DECISIONS.ACCEPT,
      reason: 'No policy violations detected. Code approved.',
      blockers: [],
      warnings: [],
      policyFindings: policyFindings.map(this._summarize),
      attempt,
    };
  }

  /**
   * Summarize a finding for readable decision output.
   * @param {object} f
   * @returns {object}
   */
  _summarize(f) {
    return {
      tool: f.tool,
      ruleId: f.ruleId,
      severity: f.severity,
      message: f.message,
      line: f.line || null,
      cwe: f.cwe || null,
    };
  }

  /**
   * Build a human-readable report of the policy decision.
   * @param {object} decision
   * @returns {string}
   */
  formatReport(decision) {
    const lines = [
      `Decision: ${decision.decision}`,
      `Reason:   ${decision.reason}`,
    ];

    if (decision.blockers.length > 0) {
      lines.push('\nCritical Findings:');
      decision.blockers.forEach(b => {
        lines.push(`  [${b.severity}] ${b.ruleId} — ${b.message} (line ${b.line || '?'})`);
        if (b.cwe) lines.push(`           CWE: ${b.cwe}`);
      });
    }

    if (decision.warnings.length > 0) {
      lines.push('\nWarnings:');
      decision.warnings.forEach(w => {
        lines.push(`  [${w.severity}] ${w.ruleId} — ${w.message} (line ${w.line || '?'})`);
      });
    }

    return lines.join('\n');
  }
}

module.exports = { PolicyEngine: new PolicyEngine(), DECISIONS };
