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
    this._rulePathKey = null;
  }

  _loadRules() {
    const rulePathKey = config.policy.ruleStorePath;
    if (this._rules && this._rulePathKey === rulePathKey) return this._rules;

    const rulePaths = String(rulePathKey || '')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);

    if (rulePaths.length === 0) {
      this._rules = [];
      this._rulePathKey = rulePathKey;
      return this._rules;
    }

    this._rules = [];
    for (const rulePath of rulePaths) {
      const resolvedPath = path.resolve(rulePath);
      if (!fs.existsSync(resolvedPath)) continue;

      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.rules)) {
        this._rules.push(...parsed.rules);
      }
    }
    this._rulePathKey = rulePathKey;
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
