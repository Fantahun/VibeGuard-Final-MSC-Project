'use strict';

describe('Orchestrator regeneration feedback', () => {
  test('passes policy-derived findings into regeneration enrichment', async () => {
    jest.resetModules();

    const enrichForRegeneration = jest.fn(() => ({
      enriched: true,
      systemPrompt: 'system',
      userPrompt: 'regen prompt',
      appliedCategories: ['general'],
    }));

    jest.doMock('../src/classifier/riskClassifier', () => ({
      classify: jest.fn(() => ({
        isSecuritySensitive: true,
        categories: ['authentication'],
        cwes: ['CWE-287'],
        overallSeverity: 'HIGH',
      })),
    }));

    jest.doMock('../src/enricher/promptEnricher', () => ({
      enrich: jest.fn(() => ({
        enriched: true,
        systemPrompt: 'system',
        userPrompt: 'base prompt',
        appliedCategories: ['general'],
      })),
      enrichForRegeneration,
    }));

    jest.doMock('../src/llm/llmConnector', () => {
      const generate = jest.fn()
        .mockResolvedValueOnce({
          code: 'const app = express();',
          rawCode: 'const app = express();',
          responseNormalization: null,
          provider: 'ollama',
          model: 'llama3.2:3b',
        })
        .mockResolvedValueOnce({
          code: 'module.exports = router;',
          rawCode: 'module.exports = router;',
          responseNormalization: null,
          provider: 'ollama',
          model: 'llama3.2:3b',
        });
      return { generate };
    });

    jest.doMock('../src/validator/validationEngine', () => ({
      validate: jest.fn()
        .mockResolvedValueOnce({ findings: [], toolsRun: ['semgrep'], toolErrors: [] })
        .mockResolvedValueOnce({ findings: [], toolsRun: ['semgrep'], toolErrors: [] }),
    }));

    const DECISIONS = {
      ACCEPT: 'ACCEPT',
      REGENERATE: 'REGENERATE',
      WARN: 'WARN',
    };
    const evaluate = jest.fn()
      .mockReturnValueOnce({
        decision: DECISIONS.REGENERATE,
        reason: 'Policy violation',
        blockers: [{
          tool: 'policy',
          ruleId: 'VG-POL-011',
          severity: 'ERROR',
          message: 'Generated modules must export router/module.',
          line: null,
        }],
        warnings: [],
        policyFindings: [{
          tool: 'policy',
          ruleId: 'VG-POL-011',
          severity: 'ERROR',
          message: 'Generated modules must export router/module.',
          line: null,
        }],
        toolErrors: [],
        attempt: 0,
      })
      .mockReturnValueOnce({
        decision: DECISIONS.ACCEPT,
        reason: 'OK',
        blockers: [],
        warnings: [],
        policyFindings: [],
        toolErrors: [],
        attempt: 1,
      });

    jest.doMock('../src/policy/policyEngine', () => ({
      DECISIONS,
      PolicyEngine: {
        evaluate,
        formatReport: jest.fn((decision) => `Decision: ${decision.decision}`),
      },
    }));

    jest.doMock('../src/interceptor/promptInterceptor', () => ({
      capture: jest.fn((prompt) => ({
        prompt,
        length: prompt.length,
        capturedAt: 1,
      })),
    }));

    jest.doMock('../src/orchestrator/sessionManager', () => ({
      start: jest.fn(() => ({
        sessionId: 'session-1',
        startTime: Date.now(),
      })),
      commit: jest.fn((session) => ({
        ...session,
        sessionId: session.sessionId || 'session-1',
        durationMs: 10,
      })),
    }));

    const orchestrator = require('../src/orchestrator/orchestrator');
    const result = await orchestrator.run('Build auth router', {
      taskId: 'T1',
      mode: 'vibeguard',
    });

    expect(enrichForRegeneration).toHaveBeenCalledTimes(1);
    const findingsArg = enrichForRegeneration.mock.calls[0][2];
    expect(findingsArg).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'VG-POL-011' }),
    ]));
    expect(result.approved).toBe(true);
    expect(result.regenerationCount).toBe(1);
  });
});
