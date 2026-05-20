'use strict';

const orchestrator = require('../src/orchestrator/orchestrator');

describe('Orchestrator mode handling', () => {
  test('rejects baseline mode because baseline is experiment-runner only', async () => {
    await expect(orchestrator.run('Generate a health endpoint', { mode: 'baseline' }))
      .rejects
      .toThrow(/experiment\/runner/);
  });
});
