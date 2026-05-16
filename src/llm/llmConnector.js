'use strict';
/**
 * VibeGuard LLM Connector
 * Wraps OpenAI and Anthropic APIs behind a unified interface.
 * Records model metadata for provenance logging.
 */
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const config = require('../../config/default');

class LLMConnector {
  constructor() {
    this._openai = null;
    this._anthropic = null;
    this._ollama = null;
  }

  _getOpenAI() {
    if (!this._openai) {
      this._openai = new OpenAI({ apiKey: config.llm.openai.apiKey });
    }
    return this._openai;
  }

  _getAnthropic() {
    if (!this._anthropic) {
      this._anthropic = new Anthropic({ apiKey: config.llm.anthropic.apiKey });
    }
    return this._anthropic;
  }

  _getOllama() {
    if (!this._ollama) {
      this._ollama = axios.create({
        baseURL: config.llm.ollama.baseUrl,
        timeout: 60000,
      });
    }
    return this._ollama;
  }

  /**
   * Send an enriched prompt to the configured LLM and return the result.
   * @param {object} enrichment  - output from PromptEnricher.enrich()
   * @returns {object} { code, model, promptTokens, completionTokens, durationMs }
   */
  async generate(enrichment) {
    const provider = config.llm.provider;
    const start = Date.now();

    if (provider === 'anthropic') {
      return this._generateAnthropic(enrichment, start);
    }
    if (provider === 'ollama') {
      return this._generateOllama(enrichment, start);
    }
    return this._generateOpenAI(enrichment, start);
  }

  async _generateOpenAI(enrichment, start) {
    const cfg = config.llm.openai;
    const client = this._getOpenAI();

    const response = await client.chat.completions.create({
      model: cfg.model,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      messages: [
        { role: 'system', content: enrichment.systemPrompt },
        { role: 'user', content: enrichment.userPrompt },
      ],
    });

    const choice = response.choices[0];
    const code = choice.message.content.trim();

    return {
      code,
      model: cfg.model,
      provider: 'openai',
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      durationMs: Date.now() - start,
    };
  }

  async _generateAnthropic(enrichment, start) {
    const cfg = config.llm.anthropic;
    const client = this._getAnthropic();

    const message = await client.messages.create({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: enrichment.systemPrompt,
      messages: [
        { role: 'user', content: enrichment.userPrompt },
      ],
    });

    const code = message.content[0].text.trim();

    return {
      code,
      model: cfg.model,
      provider: 'anthropic',
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      durationMs: Date.now() - start,
    };
  }

  async _generateOllama(enrichment, start) {
    const cfg = config.llm.ollama;
    const client = this._getOllama();

    const response = await client.post('/api/chat', {
      model: cfg.model,
      stream: false,
      messages: [
        { role: 'system', content: enrichment.systemPrompt },
        { role: 'user', content: enrichment.userPrompt },
      ],
      options: {
        temperature: cfg.temperature,
        num_predict: cfg.maxTokens,
      },
    });

    const code = response.data?.message?.content?.trim() || '';

    return {
      code,
      model: cfg.model,
      provider: 'ollama',
      promptTokens: response.data?.prompt_eval_count || null,
      completionTokens: response.data?.eval_count || null,
      durationMs: Date.now() - start,
    };
  }
}

module.exports = new LLMConnector();
