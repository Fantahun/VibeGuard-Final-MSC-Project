'use strict';

const responseParser = require('../src/llm/responseParser');

describe('ResponseParser', () => {
  test('strips JavaScript markdown fences', () => {
    const result = responseParser.normalize("```javascript\nconst x = 1;\nmodule.exports = x;\n```");
    expect(result.code).toBe('const x = 1;\nmodule.exports = x;');
    expect(result.metadata.strippedMarkdownFence).toBe(true);
    expect(result.metadata.normalized).toBe(true);
  });

  test('removes leading prose before code', () => {
    const result = responseParser.normalize('Here is the code:\n\nconst router = require("express").Router();');
    expect(result.code).toBe('const router = require("express").Router();');
    expect(result.metadata.removedLeadingProse).toBe(true);
  });

  test('leaves clean code unchanged', () => {
    const result = responseParser.normalize('module.exports = function health() { return true; };');
    expect(result.code).toBe('module.exports = function health() { return true; };');
    expect(result.metadata.normalized).toBe(false);
  });
});
