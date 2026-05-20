'use strict';
/**
 * Response Parser
 * Normalizes LLM output into the JavaScript artifact that downstream
 * validation and integration should consume.
 */

const CODE_START_PATTERN = /^\s*(?:'use strict'|"use strict"|const\s+|let\s+|var\s+|function\s+|async\s+function\s+|class\s+|module\.exports|exports\.|import\s+|require\s*\()/;

class ResponseParser {
  /**
   * Normalize a raw model response.
   * @param {string} rawResponse
   * @returns {{ code: string, metadata: object }}
   */
  normalize(rawResponse) {
    const raw = typeof rawResponse === 'string' ? rawResponse : '';
    let code = raw.trim();
    const metadata = {
      normalized: false,
      strippedMarkdownFence: false,
      removedLeadingProse: false,
      removedTrailingProse: false,
      language: null,
      originalLength: raw.length,
      normalizedLength: code.length,
    };

    const fenced = this._extractFencedCode(code);
    if (fenced) {
      code = fenced.code.trim();
      metadata.normalized = true;
      metadata.strippedMarkdownFence = true;
      metadata.language = fenced.language;
    } else {
      const withoutLeading = this._removeLeadingProse(code);
      if (withoutLeading !== code) {
        code = withoutLeading;
        metadata.normalized = true;
        metadata.removedLeadingProse = true;
      }
    }

    const withoutTrailing = this._removeTrailingFenceOrProse(code);
    if (withoutTrailing !== code) {
      code = withoutTrailing;
      metadata.normalized = true;
      metadata.removedTrailingProse = true;
    }

    metadata.normalizedLength = code.length;
    return { code, metadata };
  }

  _extractFencedCode(text) {
    const blocks = [];
    const fencePattern = /```([a-zA-Z0-9_-]*)\s*\r?\n([\s\S]*?)```/g;
    let match;
    while ((match = fencePattern.exec(text)) !== null) {
      blocks.push({
        language: (match[1] || '').toLowerCase() || null,
        code: match[2] || '',
      });
    }

    if (blocks.length === 0) return null;
    return blocks.find(block => ['javascript', 'js', 'node', 'nodejs'].includes(block.language))
      || blocks[0];
  }

  _removeLeadingProse(text) {
    const lines = text.split(/\r?\n/);
    const startIndex = lines.findIndex(line => CODE_START_PATTERN.test(line));
    return startIndex > 0 ? lines.slice(startIndex).join('\n').trim() : text.trim();
  }

  _removeTrailingFenceOrProse(text) {
    const fenceIndex = text.indexOf('```');
    if (fenceIndex >= 0) return text.slice(0, fenceIndex).trim();

    const lines = text.split(/\r?\n/);
    const proseIndex = lines.findIndex((line, index) => (
      index > 0
      && /^\s*(explanation|note|usage|summary)\s*:/i.test(line)
    ));
    return proseIndex > 0 ? lines.slice(0, proseIndex).join('\n').trim() : text.trim();
  }
}

module.exports = new ResponseParser();
