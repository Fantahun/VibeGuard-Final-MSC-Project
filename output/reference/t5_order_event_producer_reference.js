'use strict';

const amqplib = require('amqplib');
const crypto = require('crypto');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.VG_LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const QUEUE_NAME = 'order_events';
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 200;

let connection = null;
let channel = null;
let shuttingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateOrderEventInput(orderId, eventType) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error('orderId must be a positive integer');
  }

  if (typeof eventType !== 'string' || eventType.trim().length === 0) {
    throw new Error('eventType must be a non-empty string');
  }
}

async function ensureConnected() {
  if (channel) return channel;
  if (shuttingDown) {
    throw new Error('Service is shutting down');
  }

  const amqpUrl = process.env.AMQP_URL;
  if (!amqpUrl) {
    throw new Error('AMQP_URL environment variable is required');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      connection = await amqplib.connect(amqpUrl);
      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });

      connection.on('error', (err) => {
        logger.error({ event: 'rabbitmq_connection_error', msg: err.message });
      });

      connection.on('close', () => {
        channel = null;
        connection = null;
        if (!shuttingDown) {
          logger.warn({ event: 'rabbitmq_connection_closed_unexpectedly' });
        }
      });

      return channel;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`RabbitMQ connection failed after ${MAX_RETRIES} attempts`);
      }

      const delayMs = BASE_BACKOFF_MS * (2 ** (attempt - 1));
      logger.warn({
        event: 'rabbitmq_connect_retry',
        attempt,
        delayMs,
        msg: err.message,
      });
      await sleep(delayMs);
    }
  }

  throw new Error('RabbitMQ connection retries exhausted');
}

async function closeConnection() {
  shuttingDown = true;

  const closeOps = [];
  if (channel) {
    closeOps.push(channel.close().catch((err) => {
      logger.warn({ event: 'rabbitmq_channel_close_failed', msg: err.message });
    }));
  }
  if (connection) {
    closeOps.push(connection.close().catch((err) => {
      logger.warn({ event: 'rabbitmq_connection_close_failed', msg: err.message });
    }));
  }

  await Promise.all(closeOps);
  channel = null;
  connection = null;
}

process.once('SIGTERM', () => {
  closeConnection().catch((err) => {
    logger.warn({ event: 'rabbitmq_shutdown_close_failed', msg: err.message });
  });
});

async function publishOrderEvent(orderId, eventType, payload) {
  validateOrderEventInput(orderId, eventType);

  const activeChannel = await ensureConnected();
  const eventMessage = {
    orderId,
    eventType: eventType.trim(),
    payload,
    correlationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const messageBuffer = Buffer.from(JSON.stringify(eventMessage), 'utf8');
  const published = activeChannel.sendToQueue(QUEUE_NAME, messageBuffer, {
    deliveryMode: 2,
    contentType: 'application/json',
    correlationId: eventMessage.correlationId,
    timestamp: Date.now(),
  });

  if (!published) {
    throw new Error('Queue publish backpressure detected');
  }

  logger.info({
    event: 'order_event_published',
    orderId: eventMessage.orderId,
    eventType: eventMessage.eventType,
  });

  return {
    correlationId: eventMessage.correlationId,
    timestamp: eventMessage.timestamp,
  };
}

module.exports = publishOrderEvent;
