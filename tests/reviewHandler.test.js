'use strict';
const { handleWarnReview } = require('../src/cli/reviewHandler');

describe('handleWarnReview', () => {
    test('non-interactive session logs reject', async () => {
        const logs = [];
        const provenanceLogger = {
            logReview: (sessionId, approved, notes) => logs.push({ sessionId, approved, notes }),
        };

        const result = await handleWarnReview({
            sessionId: 'S1',
            inquirer: { prompt: async () => ({ approve: true }) },
            provenanceLogger,
            stdinIsTTY: false,
        });

        expect(result.approved).toBe(false);
        expect(logs[0].approved).toBe(false);
    });

    test('interactive approval logs approve', async () => {
        const logs = [];
        const provenanceLogger = {
            logReview: (sessionId, approved, notes) => logs.push({ sessionId, approved, notes }),
        };

        const result = await handleWarnReview({
            sessionId: 'S2',
            inquirer: { prompt: async () => ({ approve: true }) },
            provenanceLogger,
            stdinIsTTY: true,
        });

        expect(result.approved).toBe(true);
        expect(logs[0].approved).toBe(true);
    });
});
