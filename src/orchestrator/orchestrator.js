'use strict';
/**
 * VibeGuard Session Orchestrator
 * Coordinates the full SIDF pipeline:
 *   1. Create session
 *   2. Classify prompt
 *   3. Enrich prompt
 *   4. Generate code via LLM
 *   5. Validate generated code
 *   6. Apply policy decision
 *   7. Regenerate if required (up to maxRegenerations)
 *   8. Commit session to provenance log
 *   9. Return final result
 */
const riskClassifier = require('../classifier/riskClassifier');
const promptEnricher = require('../enricher/promptEnricher');
const llmConnector = require('../llm/llmConnector');
const validationEngine = require('../validator/validationEngine');
const { PolicyEngine, DECISIONS } = require('../policy/policyEngine');
const provenanceLogger = require('../logger/provenanceLogger');
const config = require('../../config/default');

class Orchestrator {
  /**
   * Run a complete VibeGuard coding session.
   * @param {string} userPrompt   - raw developer intent
   * @param {object} options      - { taskId, mode, outputFile }
   * @returns {object} session result
   */
  async run(userPrompt, options = {}) {
    const { taskId = 'TASK_UNSPECIFIED', mode = 'vibeguard' } = options;

    // Step 1 — start session
    const session = provenanceLogger.startSession(taskId, mode);
    session.prompt = userPrompt;

    // Step 2 — classify risk
    const risk = riskClassifier.classify(userPrompt);
    session.riskAssessment = risk;

    // Step 3 — enrich prompt
    let enrichment = promptEnricher.enrich(userPrompt, risk);
    session.enrichedPrompt = enrichment.userPrompt;
    session.appliedCategories = enrichment.appliedCategories;

    let lastFindings = [];
    let finalDecision = null;
    let finalCode = null;
    let generation = null;

    // Step 4–7 — generate, validate, decide, regenerate loop
    for (let attempt = 0; attempt <= config.policy.maxRegenerations; attempt++) {
      session.regenerationCount = attempt;

      if (attempt > 0) {
        // Build corrective enrichment
        enrichment = promptEnricher.enrichForRegeneration(userPrompt, risk, lastFindings);
      }

      // Step 4 — generate
      generation = await llmConnector.generate(enrichment);
      session.model = `${generation.provider}/${generation.model}`;
      finalCode = generation.code;

      // Step 5 — validate
      const validation = await validationEngine.validate(generation.code);
      lastFindings = validation.findings;
      session.validationFindings = lastFindings;

      // Step 6 — apply policy
      const policyResult = PolicyEngine.evaluate(lastFindings, attempt);
      finalDecision = policyResult;
      session.policyDecision = policyResult.decision;

      if (policyResult.decision !== DECISIONS.REGENERATE) break;
    }

    // Step 8 — accept or not
    session.approved = finalDecision.decision === DECISIONS.ACCEPT;
    session.generatedCode = finalCode;

    // Step 9 — commit provenance
    const record = provenanceLogger.commit(session);

    return {
      sessionId: record.sessionId,
      taskId,
      mode,
      riskAssessment: risk,
      enriched: enrichment.enriched,
      code: finalCode,
      model: session.model,
      decision: finalDecision,
      policyReport: PolicyEngine.formatReport(finalDecision),
      findings: lastFindings,
      regenerationCount: session.regenerationCount,
      durationMs: record.durationMs,
      approved: session.approved,
    };
  }
}

module.exports = new Orchestrator();
