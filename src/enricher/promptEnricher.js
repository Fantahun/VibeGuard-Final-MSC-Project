'use strict';
/**
 * VibeGuard Security-Aware Prompt Enricher
 * Augments risk-classified prompts with targeted secure coding requirements
 * before submission to the LLM. This is the preventive control layer of SIDF.
 * For non-sensitive prompts the original prompt is returned unchanged.
 */
const { ENRICHMENT_TEMPLATES } = require('../../config/securityRules');

const SYSTEM_HEADER = `You are a senior Node.js security engineer.
Generate clean, production-quality JavaScript code for Node.js microservices.
Comply strictly with the SECURITY REQUIREMENTS listed below.
Return ONLY the code. Do NOT include explanations, markdown fences, or prose.`;

class PromptEnricher {
  /**
   * Enrich a prompt based on its risk classification.
   * @param {string} originalPrompt
   * @param {object} riskAssessment - output from RiskClassifier.classify()
   * @returns {object} enrichment result
   */
  enrich(originalPrompt, riskAssessment) {
    if (!riskAssessment.isSecuritySensitive) {
      return {
        enriched: false,
        systemPrompt: 'You are a senior Node.js engineer. Return only clean JavaScript code.',
        userPrompt: originalPrompt,
        appliedCategories: [],
      };
    }

    const appliedCategories = [];
    let securityBlock = '';

    // Always add general Node.js security requirements for security-sensitive tasks
    securityBlock += ENRICHMENT_TEMPLATES.general || '';
    appliedCategories.push('general');

    // Add category-specific requirements
    for (const category of riskAssessment.categories) {
      const template = ENRICHMENT_TEMPLATES[category];
      if (template && !appliedCategories.includes(category)) {
        securityBlock += template;
        appliedCategories.push(category);
      }
    }

    const userPrompt = `${securityBlock}
---
TASK:
${originalPrompt}

ADDITIONAL NODE.JS MICROSERVICE REQUIREMENTS:
- Export a proper Express Router or class module; do not start an HTTP server inline.
- Wrap async handlers in try/catch; forward errors to Express error middleware.
- Do not log passwords, tokens, or full request bodies.
- Use structured error responses: { error: string, code: string }.
`;

    return {
      enriched: true,
      systemPrompt: SYSTEM_HEADER,
      userPrompt,
      appliedCategories,
    };
  }

  /**
   * Build the regeneration prompt when the first output was rejected.
   * @param {string} originalPrompt
   * @param {object} riskAssessment
   * @param {object[]} findings - validation findings from previous attempt
   * @returns {object} revised enrichment result
   */
  enrichForRegeneration(originalPrompt, riskAssessment, findings) {
    const base = this.enrich(originalPrompt, riskAssessment);

    const findingSummary = findings
      .filter(f => ['ERROR', 'WARNING'].includes(f.severity))
      .map(f => `- [${f.severity}] ${f.ruleId}: ${f.message} (line ${f.line || '?'})`)
      .join('\n');

    base.userPrompt += `
---
PREVIOUS ATTEMPT WAS REJECTED DUE TO THE FOLLOWING SECURITY FINDINGS:
${findingSummary}

Fix ALL of the above issues in this revised attempt.
`;

    return base;
  }
}

module.exports = new PromptEnricher();
