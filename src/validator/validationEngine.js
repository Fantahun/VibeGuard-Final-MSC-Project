'use strict';
/**
 * VibeGuard Validation Engine
 * Runs Semgrep and ESLint-security on generated Node.js code.
 * Normalizes findings into a unified format consumed by the Policy Engine.
 * Code is written to a temp file for analysis, then cleaned up.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/default');

class ValidationEngine {
  constructor() {
    this.tempDir = path.resolve(config.validation.tempDir);
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Validate generated code using available tools.
   * @param {string} code - generated JavaScript/Node.js code
   * @returns {object} { findings: Finding[], toolsRun: string[], durationMs }
   */
  async validate(code) {
    const start = Date.now();
    const tmpFile = path.join(this.tempDir, `vg_${uuidv4()}.js`);
    fs.writeFileSync(tmpFile, code, 'utf8');

    const allFindings = [];
    const toolsRun = [];

    try {
      if (config.validation.semgrepEnabled) {
        const semgrepFindings = this._runSemgrep(tmpFile);
        allFindings.push(...semgrepFindings);
        toolsRun.push('semgrep');
      }

      if (config.validation.eslintEnabled) {
        const eslintFindings = this._runESLint(tmpFile);
        allFindings.push(...eslintFindings);
        toolsRun.push('eslint-security');
      }
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }

    return {
      findings: allFindings,
      toolsRun,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Run Semgrep and parse results.
   * @param {string} filePath
   * @returns {object[]} normalized findings
   */
  _runSemgrep(filePath) {
    let output;
    try {
      output = execSync(
        `semgrep --config ${config.validation.semgrepRules} --json ${filePath} 2>/dev/null`,
        { encoding: 'utf8', timeout: 30000 }
      );
    } catch (e) {
      // Semgrep exits non-zero when findings exist; stdout still has JSON
      output = e.stdout || '';
      if (!output) return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return [];
    }

    return (parsed.results || []).map(r => ({
      tool: 'semgrep',
      ruleId: r.check_id || 'unknown',
      severity: this._mapSemgrepSeverity(r.extra?.severity || 'WARNING'),
      message: r.extra?.message || r.check_id,
      line: r.start?.line,
      cwe: this._extractCWE(r.extra?.metadata),
      owasp: r.extra?.metadata?.owasp || null,
    }));
  }

  /**
   * Run ESLint with security plugin and parse results.
   * @param {string} filePath
   * @returns {object[]} normalized findings
   */
  _runESLint(filePath) {
    // Write temporary eslint config
    const eslintConfig = {
      env: { node: true, es2021: true },
      plugins: ['security'],
      extends: ['plugin:security/recommended'],
      rules: {},
      parserOptions: { ecmaVersion: 2021 },
    };

    const configPath = path.join(this.tempDir, `.eslintrc_${uuidv4()}.json`);
    fs.writeFileSync(configPath, JSON.stringify(eslintConfig), 'utf8');

    let output;
    try {
      output = execSync(
        `npx eslint --rulesdir /dev/null -f json --no-eslintrc -c ${configPath} ${filePath} 2>/dev/null`,
        { encoding: 'utf8', timeout: 20000 }
      );
    } catch (e) {
      output = e.stdout || '';
    } finally {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return [];
    }

    const findings = [];
    for (const fileResult of parsed) {
      for (const msg of fileResult.messages || []) {
        findings.push({
          tool: 'eslint-security',
          ruleId: msg.ruleId || 'unknown',
          severity: msg.severity === 2 ? 'ERROR' : 'WARNING',
          message: msg.message,
          line: msg.line,
          cwe: null,
          owasp: null,
        });
      }
    }
    return findings;
  }

  _mapSemgrepSeverity(s) {
    const map = { ERROR: 'ERROR', WARNING: 'WARNING', INFO: 'INFO' };
    return map[s.toUpperCase()] || 'INFO';
  }

  _extractCWE(metadata) {
    if (!metadata) return null;
    const cweField = metadata.cwe || metadata['cwe-id'];
    if (!cweField) return null;
    if (Array.isArray(cweField)) return cweField[0];
    return cweField;
  }
}

module.exports = new ValidationEngine();
