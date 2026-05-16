'use strict';
/**
 * Prompt Interceptor
 * Captures and normalizes developer intent before it enters the SIDF pipeline.
 */
class PromptInterceptor {
  /**
   * Capture a raw prompt and return a normalized record.
   * @param {string} rawPrompt
   * @returns {object}
   */
  capture(rawPrompt) {
    if (!rawPrompt || typeof rawPrompt !== 'string') {
      throw new Error('Prompt must be a non-empty string.');
    }

    const trimmed = rawPrompt.trim();
    if (trimmed.length === 0) {
      throw new Error('Prompt must not be empty.');
    }

    return {
      prompt: trimmed,
      length: trimmed.length,
      capturedAt: Date.now(),
    };
  }
}

module.exports = new PromptInterceptor();
