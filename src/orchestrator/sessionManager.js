'use strict';
/**
 * Session Manager
 * Minimal session lifecycle helper around provenance logging.
 */
const provenanceLogger = require('../logger/provenanceLogger');

class SessionManager {
  /**
   * Start a new session.
   * @param {string} taskId
   * @param {string} mode
   * @returns {object}
   */
  start(taskId, mode) {
    return provenanceLogger.startSession(taskId, mode);
  }

  /**
   * Commit a session to provenance.
   * @param {object} session
   * @returns {object}
   */
  commit(session) {
    return provenanceLogger.commit(session);
  }
}

module.exports = new SessionManager();
