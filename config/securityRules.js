/**
 * Security risk classification rules.
 * Maps keyword patterns in developer prompts to risk categories.
 */
const RISK_PATTERNS = [
  {
    category: 'authentication',
    severity: 'HIGH',
    cwes: ['CWE-287', 'CWE-798', 'CWE-311'],
    keywords: [
      'login', 'auth', 'authenticate', 'sign in', 'signin', 'password',
      'jwt', 'token', 'oauth', 'session', 'credential', 'api key', 'secret',
    ],
  },
  {
    category: 'database_access',
    severity: 'HIGH',
    cwes: ['CWE-89'],
    keywords: [
      'sql', 'query', 'database', 'db', 'insert', 'select', 'update',
      'delete', 'postgres', 'mysql', 'mongodb', 'mongoose', 'sequelize',
    ],
  },
  {
    category: 'file_operations',
    severity: 'HIGH',
    cwes: ['CWE-22', 'CWE-732'],
    keywords: [
      'file', 'upload', 'download', 'path', 'directory', 'folder',
      'fs.', 'readfile', 'writefile', 'unlink', 'stream', 'multer',
    ],
  },
  {
    category: 'command_execution',
    severity: 'CRITICAL',
    cwes: ['CWE-78', 'CWE-94'],
    keywords: [
      'exec', 'spawn', 'shell', 'child_process', 'eval', 'function(',
      'execute', 'run command', 'system', 'bash', 'shell script',
    ],
  },
  {
    category: 'network_communication',
    severity: 'MEDIUM',
    cwes: ['CWE-311', 'CWE-918'],
    keywords: [
      'http', 'https', 'fetch', 'axios', 'request', 'api', 'endpoint',
      'webhook', 'external', 'third-party', 'url', 'redirect',
    ],
  },
  {
    category: 'input_handling',
    severity: 'HIGH',
    cwes: ['CWE-79', 'CWE-89', 'CWE-20'],
    keywords: [
      'input', 'user data', 'form', 'body', 'params', 'query string',
      'sanitize', 'validate', 'middleware', 'express.json', 'body-parser',
    ],
  },
  {
    category: 'cryptography',
    severity: 'MEDIUM',
    cwes: ['CWE-327', 'CWE-330'],
    keywords: [
      'encrypt', 'decrypt', 'hash', 'bcrypt', 'crypto', 'aes', 'rsa',
      'md5', 'sha', 'salt', 'nonce', 'random',
    ],
  },
];

/**
 * Security guidance templates injected per risk category.
 */
const ENRICHMENT_TEMPLATES = {
  authentication: `
SECURITY REQUIREMENTS (Authentication):
- Never store passwords in plaintext; use bcrypt (>=12 rounds) or argon2.
- Use signed JWTs with a minimum 256-bit secret; set short expiry (<=1 hour for access tokens).
- Never expose JWT secrets or API keys as hardcoded strings; read from environment variables only.
- Implement refresh-token rotation.
- Persist refresh tokens or token revocation state server-side; refresh and logout handlers must query or update this store.
- Do not treat JWT verification alone as logout; logout must revoke, delete, or invalidate the refresh token.
- On login, persist a server-side refresh token record or token hash before returning the refresh token.
- On refresh, verify the JWT signature and check server-side refresh token state before issuing a new access token.
- For authentication endpoint tasks, export an express.Router(), not an Express app instance, and explicitly wire POST /auth/register, POST /auth/login, POST /auth/refresh, and POST /auth/logout when those endpoints are requested.
- Reject unauthenticated requests at the middleware level before business logic executes.
`,
  database_access: `
SECURITY REQUIREMENTS (Database Access):
- Always use parameterized queries or ORM prepared statements. Never concatenate user input into SQL strings.
- Use a real database client such as pg Pool or accept a Pool/client dependency; never call .query() on a process.env value.
- Validate and sanitize all input before database interaction.
- Apply the principle of least privilege for database credentials.
- Handle database errors without exposing schema details in error messages.
- Wrap mutations in transactions where consistency matters.
`,
  file_operations: `
SECURITY REQUIREMENTS (File Operations):
- Validate and sanitize file paths; never use user-supplied path segments without normalization.
- Use path.resolve() and verify the resolved path remains within the intended base directory.
- Restrict allowed file extensions and MIME types for uploads.
- Never execute uploaded files.
- Limit file sizes to reasonable bounds.
- Store uploads outside the web root.
`,
  command_execution: `
SECURITY REQUIREMENTS (Command Execution):
- Do NOT use exec(), execSync(), or eval() with user-controlled data.
- Prefer structured APIs over shell commands.
- If shell execution is unavoidable, use an allowlist of permitted commands and sanitize all arguments.
- Never construct shell strings by interpolating user input.
`,
  network_communication: `
SECURITY REQUIREMENTS (Network/HTTP):
- Always use HTTPS for external requests.
- Validate and restrict outbound URLs to a known allowlist (prevent SSRF).
- Set appropriate timeouts and retry limits on outbound requests.
- Do not forward raw user input as outbound request parameters without validation.
`,
  input_handling: `
SECURITY REQUIREMENTS (Input Validation):
- Validate all incoming request bodies, query strings, and route parameters.
- Use a schema validation library (e.g., Joi, Zod, express-validator).
- Return 400 with structured error messages for invalid input; do not echo raw input back.
- Encode output before rendering to prevent XSS.
`,
  cryptography: `
SECURITY REQUIREMENTS (Cryptography):
- Use Node.js built-in crypto module or well-audited libraries only.
- Do not use MD5 or SHA-1 for security-sensitive hashing.
- Use crypto.randomBytes() for secure random values; do not use Math.random() for security purposes.
- Store only hashed passwords, never plaintext or reversible encrypted values.
`,
  general: `
GENERAL SECURITY REQUIREMENTS (Node.js Microservices):
- Use environment variables for all secrets and configuration; never hardcode.
- Add helmet.js middleware for HTTP security headers and apply it with router.use() or app.use(); do not only import it.
- Implement proper error handling that does not expose stack traces or internal details.
- Apply the principle of least privilege at every layer.
- Log security-relevant events (failed auth, rejected inputs) to a structured logger such as winston or pino; do not use console.log, console.error, console.warn, or console.info.
- Return appropriate HTTP status codes; do not return 200 for errors.
`,
};

module.exports = { RISK_PATTERNS, ENRICHMENT_TEMPLATES };
