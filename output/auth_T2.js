```javascript
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const logger = require('./logger');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY;
const ALLOWED_URLS = process.env.ALLOWED_URLS;

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHORIZED' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    return res.json({ token });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const token = jwt.verify(refreshToken, JWT_SECRET);
    const user = await authenticateUser(token.userId, null);
    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token', code: 'UNAUTHORIZED' });
    }
    const newToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    return res.json({ token: newToken });
  } catch (error) {
    logger.error('Refresh token error:', error);
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

router.get('/protected', authenticateToken, async (req, res) => {
  try {
    return res.json({ message: 'Hello, authenticated user!' });
  } catch (error) {
    logger.error('Protected route error:', error);
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
  }
});

function authenticateToken(req, res, next) {
  const token = req.header('Authorization');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    logger.error('Token verification error:', error);
    return res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
}

function authenticateUser(username, password) {
  // TO DO: implement user authentication logic
  // For demonstration purposes, assume a user exists
  return { id: 1, username };
}

module.exports = router;
```