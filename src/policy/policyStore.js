'use strict';
/**
 * Policy Store
 * Loads static policy rules used for code-level compliance checks.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config/default');

class PolicyStore {
  constructor() {
    this._rules = null;
  }

  _loadRules() {
    if (this._rules) return this._rules;
    const rulePath = path.resolve(config.policy.ruleStorePath);
    if (!fs.existsSync(rulePath)) {
      this._rules = [];
      return this._rules;
    }

    const raw = fs.readFileSync(rulePath, 'utf8');
    const parsed = JSON.parse(raw);
    this._rules = Array.isArray(parsed.rules) ? parsed.rules : [];
    return this._rules;
  }

  /**
   * Evaluate code against policy rules and return findings.
   * @param {string} code
   * @returns {object[]}
   */
  evaluate(code) {
    if (!code || typeof code !== 'string') return [];
    const rules = this._loadRules();
    const findings = [];

    for (const rule of rules) {
      if (!rule.pattern) continue;
      const regex = new RegExp(rule.pattern, rule.flags || '');
      if (regex.test(code)) {
        findings.push({
          tool: 'policy',
          ruleId: rule.id || 'VG-POL-UNKNOWN',
          severity: rule.severity || 'WARNING',
          message: rule.message || rule.description || 'Policy rule violated.',
          line: null,
          cwe: rule.cwe || null,
        });
      }
    }

    return findings;
  }
}

module.exports = new PolicyStore();
