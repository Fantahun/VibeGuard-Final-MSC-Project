'use strict';

const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { Pool } = require('pg');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.VG_LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const router = express.Router();
router.use(helmet());
router.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  user: process.env.DB_USER || undefined,
  host: process.env.DB_HOST || undefined,
  database: process.env.DB_NAME || undefined,
  password: process.env.DB_PASSWORD || undefined,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().min(1).required(),
});

const createCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  email: Joi.string().email().max(254).required(),
  phone: Joi.string().trim().min(3).max(32).required(),
});

const updateCustomerSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  email: Joi.string().email().max(254),
  phone: Joi.string().trim().min(3).max(32),
}).min(1);

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT configuration missing');
  }
  return process.env.JWT_SECRET;
}

function validateIdParam(req, res, next) {
  const { error, value } = idParamSchema.validate(req.params, {
    abortEarly: false,
    convert: true,
  });
  if (error) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_FAILED' });
  }
  req.params.id = String(value.id);
  return next();
}

function requireJwtBearer(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    req.auth = { userId: decoded.sub || decoded.userId || null };
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

router.get('/customers', async (req, res) => {
  const { error, value } = paginationSchema.validate(req.query, { convert: true });
  if (error) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_FAILED' });
  }

  const { page, limit } = value;
  const offset = (page - 1) * limit;

  try {
    const query = `
      SELECT id, name, email, phone, created_at, updated_at
      FROM customers
      WHERE deleted_at IS NULL
      ORDER BY id
      LIMIT $1 OFFSET $2
    `;
    const result = await pool.query(query, [limit, offset]);
    return res.status(200).json({ page, limit, data: result.rows });
  } catch (err) {
    logger.error({ route: 'list_customers', op: 'db', msg: err.message });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.get('/customers/:id', validateIdParam, async (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  try {
    const query = `
      SELECT id, name, email, phone, created_at, updated_at
      FROM customers
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
    `;
    const result = await pool.query(query, [customerId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    logger.error({ route: 'get_customer', op: 'db', msg: err.message });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.post('/customers', requireJwtBearer, async (req, res) => {
  const { error, value } = createCustomerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_FAILED' });
  }

  try {
    const query = `
      INSERT INTO customers (name, email, phone, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, name, email, phone, created_at, updated_at
    `;
    const result = await pool.query(query, [value.name, value.email, value.phone]);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ route: 'create_customer', op: 'db', msg: err.message });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.put('/customers/:id', requireJwtBearer, validateIdParam, async (req, res) => {
  const { error, value } = updateCustomerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_FAILED' });
  }

  const customerId = parseInt(req.params.id, 10);
  const setClauses = [];
  const params = [];
  let index = 1;

  if (value.name !== undefined) {
    setClauses.push(`name = $${index++}`);
    params.push(value.name);
  }
  if (value.email !== undefined) {
    setClauses.push(`email = $${index++}`);
    params.push(value.email);
  }
  if (value.phone !== undefined) {
    setClauses.push(`phone = $${index++}`);
    params.push(value.phone);
  }
  setClauses.push('updated_at = NOW()');
  params.push(customerId);

  try {
    const query = `
      UPDATE customers
      SET ${setClauses.join(', ')}
      WHERE id = $${index} AND deleted_at IS NULL
      RETURNING id, name, email, phone, created_at, updated_at
    `;
    const result = await pool.query(query, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    logger.error({ route: 'update_customer', op: 'db', msg: err.message });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.delete('/customers/:id', requireJwtBearer, validateIdParam, async (req, res) => {
  const customerId = parseInt(req.params.id, 10);
  try {
    const query = `
      UPDATE customers
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, deleted_at
    `;
    const result = await pool.query(query, [customerId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Customer not found', code: 'NOT_FOUND' });
    }
    return res.status(200).json({
      id: result.rows[0].id,
      deletedAt: result.rows[0].deleted_at,
    });
  } catch (err) {
    logger.error({ route: 'delete_customer', op: 'db', msg: err.message });
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

module.exports = router;
