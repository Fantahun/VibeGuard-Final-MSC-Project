'use strict';
/**
 * VibeGuard Prompt Risk Classifier
 * Analyzes the developer's raw prompt to determine whether it
 * contains security-sensitive intent. Returns a risk assessment
 * including matched categories, severity, and relevant CWEs.
 */
const { RISK_PATTERNS } = require('../../config/securityRules');

class RiskClassifier {
  /**
   * Classify a prompt and return a risk assessment.
   * @param {string} prompt - raw developer intent
   * @returns {object} risk assessment
   */
  classify(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string.');
    }

    const normalized = prompt.toLowerCase();
    const matched = [];

    for (const rule of RISK_PATTERNS) {
      const hits = rule.keywords.filter(kw => normalized.includes(kw));
      if (hits.length > 0) {
        matched.push({
          category: rule.category,
          severity: rule.severity,
          cwes: rule.cwes,
          matchedKeywords: hits,
          hitCount: hits.length,
        });
      }
    }

    const overallSeverity = this._computeOverallSeverity(matched);
    const isSecuritySensitive = matched.length > 0;
    const categories = [...new Set(matched.map(m => m.category))];
    const cwes = [...new Set(matched.flatMap(m => m.cwes))];

    return {
      isSecuritySensitive,
      overallSeverity,
      categories,
      cwes,
      matched,
      summary: isSecuritySensitive
        ? `Security-sensitive prompt detected. Categories: ${categories.join(', ')}. ` +
          `Relevant CWEs: ${cwes.join(', ')}.`
        : 'No security-sensitive patterns detected. Standard generation will be used.',
    };
  }

  /**
   * Compute overall severity from all matched rules.
   * @param {object[]} matches
   * @returns {string} severity level
   */
  _computeOverallSeverity(matches) {
    if (matches.some(m => m.severity === 'CRITICAL')) return 'CRITICAL';
    if (matches.some(m => m.severity === 'HIGH')) return 'HIGH';
    if (matches.some(m => m.severity === 'MEDIUM')) return 'MEDIUM';
    if (matches.some(m => m.severity === 'LOW')) return 'LOW';
    return 'NONE';
  }
}

module.exports = new RiskClassifier();
