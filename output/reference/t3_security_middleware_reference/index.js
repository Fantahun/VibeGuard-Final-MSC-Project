'use strict';

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.VG_LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

function stripDangerousChars(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\u0000/g, '');
}

function sanitizeValue(value) {
  if (typeof value === 'string') {
    return stripDangerousChars(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizeValue(nested)])
    );
  }

  return value;
}

function inputSanitizer(req, res, next) {
  req.body = sanitizeValue(req.body);
  req.params = sanitizeValue(req.params);
  req.query = sanitizeValue(req.query);
  return next();
}

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
});

function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.get('Authorization') || req.headers.authorization || '';
  const [scheme, credential] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !credential) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  if (!process.env.JWT_SECRET) {
    logger.error({ event: 'jwt_config_missing' });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }

  try {
    const decoded = jwt.verify(credential, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info({
      event: 'request_complete',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  return next();
}

function errorHandler(err, req, res, next) {
  void next;
  logger.error({
    event: 'request_failed',
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: err.statusCode || 500,
    message: err.message || 'Unhandled error',
  });

  const base = { error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' };
  if (process.env.NODE_ENV !== 'production') {
    base.details = err.message || 'Unhandled error';
  }

  return res.status(err.statusCode || 500).json(base);
}

module.exports = {
  inputSanitizer,
  rateLimiter,
  jwtAuthMiddleware,
  requestLogger,
  errorHandler,
};
