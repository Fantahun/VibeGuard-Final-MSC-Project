'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');

const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const logger = winston.createLogger({
  level: process.env.VG_LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  user: process.env.DB_USER || undefined,
  host: process.env.DB_HOST || undefined,
  database: process.env.DB_NAME || undefined,
  password: process.env.DB_PASSWORD || undefined,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
});

const router = express.Router();
router.use(express.json());

function getJwtSecret() {
  const secretValue = process.env.JWT_SECRET;
  if (!secretValue || secretValue.length < 32) {
    throw new Error('JWT configuration missing');
  }
  return secretValue;
}

function hashRefreshValue(refreshValue) {
  return crypto.createHash('sha256').update(refreshValue, 'utf8').digest('hex');
}

function validationFailure(req, res) {
  const issues = validationResult(req);
  if (issues.isEmpty()) return false;
  res.status(400).json({
    error: 'Validation failed',
    code: 'VALIDATION_FAILED',
    details: issues.array().map(item => ({
      field: item.path,
      message: item.msg,
    })),
  });
  return true;
}

const registerValidators = [
  body('username').isString().trim().isLength({ min: 3, max: 64 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 }),
];

const loginValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 128 }),
];

const refreshValidators = [
  body('refreshToken').isString().isLength({ min: 20, max: 4096 }),
];

router.post('/auth/register', registerValidators, async (req, res) => {
  if (validationFailure(req, res)) return;

  const { username, email, password } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [email]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insertUser = await pool.query(
      `INSERT INTO users (username, email, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, username, email, created_at`,
      [username, email, passwordHash]
    );

    return res.status(201).json({
      user: {
        id: insertUser.rows[0].id,
        username: insertUser.rows[0].username,
        email: insertUser.rows[0].email,
        createdAt: insertUser.rows[0].created_at,
      },
    });
  } catch (err) {
    logger.error({ event: 'auth_register_failed', code: err.code || 'DB_ERROR' });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.post('/auth/login', loginValidators, async (req, res) => {
  if (validationFailure(req, res)) return;

  const { email, password } = req.body;
  try {
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const user = userResult.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const jwtKey = getJwtSecret();
    const sessionId = crypto.randomUUID();
    const accessJwt = jwt.sign(
      { sub: String(user.id), sessionId, kind: 'access' },
      jwtKey,
      { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS }
    );
    const refreshJwt = jwt.sign(
      { sub: String(user.id), sessionId, kind: 'refresh' },
      jwtKey,
      { algorithm: 'HS256', expiresIn: REFRESH_TTL_SECONDS }
    );

    const refreshHash = hashRefreshValue(refreshJwt);
    const refreshExpiry = new Date(Date.now() + (REFRESH_TTL_SECONDS * 1000));
    await pool.query(
      `INSERT INTO refresh_tokens (session_id, user_id, token_hash, expires_at, revoked_at, created_at)
       VALUES ($1, $2, $3, $4, NULL, NOW())`,
      [sessionId, user.id, refreshHash, refreshExpiry]
    );

    return res.status(200).json({
      accessToken: accessJwt,
      refreshToken: refreshJwt,
      type: 'Bearer',
      expiresIn: ACCESS_TTL_SECONDS,
    });
  } catch (err) {
    logger.error({ event: 'auth_login_failed', code: err.code || 'AUTH_ERROR' });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.post('/auth/refresh', refreshValidators, async (req, res) => {
  if (validationFailure(req, res)) return;

  const { refreshToken } = req.body;
  try {
    const jwtKey = getJwtSecret();
    const decoded = jwt.verify(refreshToken, jwtKey, { algorithms: ['HS256'] });
    if (!decoded || decoded.kind !== 'refresh') {
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const refreshHash = hashRefreshValue(refreshToken);
    const sessionRow = await pool.query(
      `SELECT session_id, user_id
       FROM refresh_tokens
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [refreshHash]
    );

    if (sessionRow.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const accessJwt = jwt.sign(
      { sub: String(sessionRow.rows[0].user_id), sessionId: sessionRow.rows[0].session_id, kind: 'access' },
      jwtKey,
      { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS }
    );

    return res.status(200).json({
      accessToken: accessJwt,
      type: 'Bearer',
      expiresIn: ACCESS_TTL_SECONDS,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }
});

router.post('/auth/logout', refreshValidators, async (req, res) => {
  if (validationFailure(req, res)) return;

  const { refreshToken } = req.body;
  try {
    const refreshHash = hashRefreshValue(refreshToken);
    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [refreshHash]
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ event: 'auth_logout_failed', code: err.code || 'DB_ERROR' });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

module.exports = router;
