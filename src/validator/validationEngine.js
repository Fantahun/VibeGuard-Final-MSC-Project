'use strict';
/**
 * VibeGuard Validation Engine
 * Runs Semgrep and ESLint-security on generated Node.js code.
 * Normalizes findings into a unified format consumed by the Policy Engine.
 * Code is written to a temp file for analysis, then cleaned up.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/default');

class ValidationEngine {
  constructor() {
    this.tempDir = path.resolve(config.validation.tempDir);
    this.projectRoot = path.resolve(__dirname, '../..');
    this.eslintConfigPath = path.join(this.projectRoot, 'eslint.validation.config.js');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Validate generated code using available tools.
   * @param {string} code - generated JavaScript/Node.js code
   * @returns {object} { findings: Finding[], toolsRun: string[], toolErrors: object[], durationMs }
   */
  async validate(code) {
    const start = Date.now();
    const tmpFile = path.join(this.tempDir, `vg_${uuidv4()}.js`);
    fs.writeFileSync(tmpFile, code, 'utf8');

    const allFindings = [];
    const toolsRun = [];
    const toolErrors = [];

    try {
      if (config.validation.semgrepEnabled) {
        const semgrepResult = this._runSemgrep(tmpFile);
        allFindings.push(...semgrepResult.findings);
        if (!semgrepResult.error) toolsRun.push('semgrep');
        if (semgrepResult.error) toolErrors.push(semgrepResult.error);
      }

      if (config.validation.eslintEnabled) {
        const eslintResult = await this._runESLint(tmpFile);
        allFindings.push(...eslintResult.findings);
        if (!eslintResult.error) toolsRun.push('eslint-security');
        if (eslintResult.error) toolErrors.push(eslintResult.error);
      }
    } finally {
      if (fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch {
          // Some scanner versions keep a short-lived file handle on Windows.
        }
      }
    }

    return {
      findings: allFindings,
      toolsRun,
      toolErrors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Run Semgrep and parse results.
   * @param {string} filePath
   * @returns {{ findings: object[], error: object|null }} normalized findings
   */
  _runSemgrep(filePath) {
    let output;
    try {
      output = execFileSync(
        'semgrep',
        ['--config', config.validation.semgrepRules, '--json', filePath],
        { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (e) {
      // Semgrep exits non-zero when findings exist; stdout still has JSON
      output = e.stdout || '';
      if (!output) {
        return {
          findings: [],
          error: this._toolError('semgrep', e),
        };
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return {
        findings: [],
        error: {
          tool: 'semgrep',
          message: 'Semgrep output could not be parsed as JSON.',
        },
      };
    }

    return {
      findings: (parsed.results || []).map(r => ({
        tool: 'semgrep',
        ruleId: r.check_id || 'unknown',
        severity: this._mapSemgrepSeverity(r.extra?.severity || 'WARNING'),
        message: r.extra?.message || r.check_id,
        line: r.start?.line,
        cwe: this._extractCWE(r.extra?.metadata),
        owasp: r.extra?.metadata?.owasp || null,
      })),
      error: null,
    };
  }

  /**
   * Run ESLint with security plugin and parse results.
   * @param {string} filePath
   * @returns {{ findings: object[], error: object|null }} normalized findings
   */
  _runESLint(filePath) {
    let output;
    const eslintCommand = this._eslintCommand();
    try {
      output = execFileSync(
        eslintCommand.command,
        [
          ...eslintCommand.argsPrefix,
          '-f',
          'json',
          '--no-config-lookup',
          '--config',
          this.eslintConfigPath,
          filePath,
        ],
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          timeout: 20000,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
    } catch (e) {
      output = e.stdout || '';
      if (!output) {
        return {
          findings: [],
          error: this._toolError('eslint-security', e),
        };
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      return {
        findings: [],
        error: {
          tool: 'eslint-security',
          message: 'ESLint output could not be parsed as JSON.',
        },
      };
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
    return { findings, error: null };
  }

  _eslintCommand() {
    const localJsBin = path.join(this.projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
    if (fs.existsSync(localJsBin)) {
      return {
        command: process.execPath,
        argsPrefix: [localJsBin],
      };
    }
    return {
      command: process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
      argsPrefix: [],
    };
  }

  _toolError(tool, err) {
    if (err.code === 'ENOENT') {
      return {
        tool,
        message: `${tool} is enabled but was not found on PATH.`,
      };
    }

    const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : '';
    return {
      tool,
      message: stderr || err.message || `${tool} failed to run.`,
    };
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
