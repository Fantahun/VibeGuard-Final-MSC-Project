'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { Pool } = require('pg');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.VG_LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const uploadDirEnv = process.env.UPLOAD_DIR || '';
if (!uploadDirEnv) {
  throw new Error('UPLOAD_DIR environment variable is required');
}

const baseUploadDir = path.resolve(uploadDirEnv);

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function ensurePathInsideUploadDir(absPath) {
  const relative = path.relative(baseUploadDir, absPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function requireJwtBearer(req, res, next) {
  const header = req.get('Authorization') || req.headers.authorization || '';
  const [scheme, credential] = header.split(' ');
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationPath = path.resolve(baseUploadDir);
    if (!ensurePathInsideUploadDir(destinationPath)) {
      return cb(new Error('Resolved upload path escapes UPLOAD_DIR'));
    }
    return cb(null, destinationPath);
  },
  filename: (req, file, cb) => {
    const extension = file.mimetype === 'application/pdf'
      ? 'pdf'
      : file.mimetype === 'image/png'
      ? 'png'
      : file.mimetype === 'image/jpeg'
      ? 'jpg'
      : 'docx';
    const storedName = `${crypto.randomUUID()}.${extension}`;
    const resolvedPath = path.resolve(baseUploadDir, storedName);
    if (!ensurePathInsideUploadDir(resolvedPath)) {
      return cb(new Error('Resolved filename escapes UPLOAD_DIR'));
    }
    return cb(null, storedName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
    return cb(null, true);
  },
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
router.use(helmet());
router.use(express.json());

router.post('/files/upload', requireJwtBearer, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_FAILED' });
  }

  try {
    const uploaderId = req.user.sub || req.user.userId || req.user.id || null;
    if (!uploaderId) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const query = `
      INSERT INTO file_uploads (
        original_name, stored_name, size, mime_type, uploader_id, uploaded_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    const values = [
      req.file.originalname,
      req.file.filename,
      req.file.size,
      req.file.mimetype,
      uploaderId,
    ];

    const result = await pool.query(query, values);
    const fileId = result.rows[0].id;

    return res.status(201).json({
      fileId,
      storedName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (err) {
    logger.error({ event: 'upload_metadata_insert_failed', msg: err.message });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.use((err, req, res, next) => {
  void next;
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Validation failed', code: 'FILE_TOO_LARGE' });
  }

  if (err && err.message === 'Unsupported file type') {
    return res.status(400).json({ error: 'Validation failed', code: 'UNSUPPORTED_FILE_TYPE' });
  }

  if (err && /escapes UPLOAD_DIR/.test(err.message)) {
    return res.status(400).json({ error: 'Validation failed', code: 'INVALID_UPLOAD_PATH' });
  }

  logger.error({ event: 'upload_route_failed', msg: err?.message || 'Unhandled error' });
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
});

module.exports = router;
