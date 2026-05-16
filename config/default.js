/**
 * VibeGuard default configuration
 * All sensitive values (API keys) must be provided via .env
 */
module.exports = {
  llm: {
    provider: process.env.VG_LLM_PROVIDER || 'openai',  // 'openai' | 'anthropic'
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.VG_OPENAI_MODEL || 'gpt-4o',
      temperature: parseFloat(process.env.VG_TEMPERATURE || '0.2'),
      maxTokens: parseInt(process.env.VG_MAX_TOKENS || '4096', 10),
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.VG_ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      maxTokens: parseInt(process.env.VG_MAX_TOKENS || '4096', 10),
    },
  },
  validation: {
    semgrepEnabled: process.env.VG_SEMGREP_ENABLED !== 'false',
    eslintEnabled: process.env.VG_ESLINT_ENABLED !== 'false',
    semgrepRules: process.env.VG_SEMGREP_RULES || 'p/security-audit,p/javascript,p/owasp-top-ten',
    tempDir: process.env.VG_TEMP_DIR || '/tmp/vibeguard_scan',
  },
  policy: {
    maxRegenerations: parseInt(process.env.VG_MAX_REGEN || '3', 10),
    criticalSeverities: ['ERROR', 'WARNING'],    // findings that block acceptance
    warnSeverities: ['INFO'],                     // findings that require review
    criticalCwes: [
      'CWE-89',   // SQL Injection
      'CWE-78',   // OS Command Injection
      'CWE-22',   // Path Traversal
      'CWE-79',   // XSS
      'CWE-798',  // Hard-coded credentials
      'CWE-287',  // Improper Authentication
      'CWE-502',  // Deserialization
      'CWE-94',   // Code Injection
      'CWE-732',  // Insecure permissions
      'CWE-311',  // Cleartext sensitive data
    ],
  },
  logging: {
    dir: process.env.VG_LOG_DIR || './logs',
    level: process.env.VG_LOG_LEVEL || 'info',
    provenance: process.env.VG_PROVENANCE_FILE || './logs/provenance.jsonl',
    metrics: process.env.VG_METRICS_FILE || './logs/metrics.jsonl',
  },
};
