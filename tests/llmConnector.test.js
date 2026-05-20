'use strict';

describe('LLMConnector Ollama response normalization', () => {
  let postMock;

  beforeEach(() => {
    jest.resetModules();
    process.env.VG_LLM_PROVIDER = 'ollama';
    process.env.VG_OLLAMA_MODEL = 'llama3.2:3b';
    postMock = jest.fn(async () => ({
      data: {
        message: {
          content: [
            'Here is the implementation:',
            '',
            '```javascript',
            "const express = require('express');",
            'const router = express.Router();',
            '',
            "router.post('/login', (req, res) => res.json({ ok: true }));",
            '',
            'module.exports = router;',
            '```',
            '',
            'Summary: exports an Express router.',
          ].join('\n'),
        },
        prompt_eval_count: 12,
        eval_count: 34,
      },
    }));
    jest.doMock('axios', () => ({
      create: jest.fn(() => ({ post: postMock })),
    }));
  });

  afterEach(() => {
    delete process.env.VG_LLM_PROVIDER;
    delete process.env.VG_OLLAMA_MODEL;
  });

  test('strips fenced Markdown before downstream validation', async () => {
    const llmConnector = require('../src/llm/llmConnector');

    const result = await llmConnector.generate({
      systemPrompt: 'Return only JavaScript.',
      userPrompt: 'Create an auth router.',
    });

    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('llama3.2:3b');
    expect(result.code).toContain("const express = require('express');");
    expect(result.code).toContain('module.exports = router;');
    expect(result.code).not.toContain('```');
    expect(result.code).not.toContain('Summary:');
    expect(result.rawCode).toContain('```javascript');
    expect(result.responseNormalization).toMatchObject({
      normalized: true,
      strippedMarkdownFence: true,
      language: 'javascript',
    });
  });
});
