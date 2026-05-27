/**
 * Multi-provider LLM router with fallback chains, timeouts, and session circuit breakers.
 * Ported from Agentic-SDLC BaseAgent.js and ace-engine.
 * Upgraded to ESModules with guardrails, token optimizer, and cost tracking.
 */

import { Guardrails } from './guardrails.js';
import { TokenOptimizer } from './token_optimizer.js';

// Global session-level circuit breaker: providers that have failed completely
const _downProviders = new Set();

const MODEL_PRICING = {
  openai: {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
  },
  anthropic: {
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  },
  gemini: {
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-2.0-flash': { input: 0.075, output: 0.30 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  },
  ollama: {
    'qwen2.5-coder:7b': { input: 0.0, output: 0.0 },
  }
};

export class Router {
  /**
   * @param {Object} keys
   * @param {string} [keys.openai]
   * @param {string} [keys.anthropic]
   * @param {string} [keys.gemini]
   * @param {string} [ollamaUrl]
   * @param {string} [defaultProvider]
   */
  constructor({ openai, anthropic, gemini } = {}, ollamaUrl = 'http://localhost:11434', defaultProvider = 'ollama') {
    this.keys = { openai, anthropic, gemini };
    this.ollamaUrl = ollamaUrl;
    this.defaultProvider = defaultProvider;
    this.guardrails = new Guardrails();
    this.tokenOptimizer = new TokenOptimizer();

    // Configure fallback order per task class
    this.providerChains = {
      code: ['openai', 'gemini', 'anthropic', 'ollama'],
      ui: ['gemini', 'openai', 'ollama'],
      simple: ['openai', 'gemini', 'ollama'],
      content: ['gemini', 'openai', 'anthropic', 'ollama']
    };

    // Models per provider in order of choice
    this.modelChains = {
      openai: ['gpt-4o-mini', 'gpt-4o'],
      anthropic: ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
      gemini: ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
      ollama: ['qwen2.5-coder:7b']
    };

    // Per-provider request timeouts in milliseconds
    this.timeouts = {
      openai: 30000,
      anthropic: 45000,
      gemini: 30000,
      ollama: 90000,
    };
  }

  _providerAvailable(provider) {
    if (_downProviders.has(provider)) return false;
    if (provider === 'ollama') return true;
    const key = this.keys[provider];
    return !!(key && key.trim());
  }

  _wrapSystemPrompt(provider, model, systemPrompt) {
    if (!systemPrompt) return '';
    if (provider === 'gemini') {
      return `<role>\n${systemPrompt}\n</role>\n<instruction>Respond ONLY with valid JSON. No text outside the JSON block.</instruction>`;
    }
    if (model.includes('mini') || model.includes('haiku')) {
      return `${systemPrompt}\n\nCRITICAL: Output valid JSON only. Do not add markdown or explanations outside the JSON.`;
    }
    return systemPrompt;
  }

  _calculateCost(provider, model, inputTokens, outputTokens) {
    try {
      const pricing = MODEL_PRICING[provider]?.[model];
      if (!pricing) return 0.0;
      const inputCost = (inputTokens / 1000000) * pricing.input;
      const outputCost = (outputTokens / 1000000) * pricing.output;
      return inputCost + outputCost;
    } catch (_) {
      return 0.0;
    }
  }

  /**
   * Executes chat completion with fallback chains, active guardrails, and circuit breakers.
   * @param {string} prompt 
   * @param {string} [systemPrompt] 
   * @param {string} [taskClass] 
   * @param {number} [temperature] 
   * @param {number} [maxTokens] 
   * @param {number} [budget] 
   * @returns {Promise<Object>}
   */
  async chat(prompt, systemPrompt = '', taskClass = 'content', temperature = 0.3, maxTokens = 4096, budget = null) {
    // 1. Active Input Guardrail Check
    this.guardrails.validateInput(prompt);
    this.guardrails.validateInput(systemPrompt);

    // 2. Token Optimization Pruning
    const optimizedPrompt = this.tokenOptimizer.optimizePrompt(prompt);
    const optimizedSystem = this.tokenOptimizer.optimizePrompt(systemPrompt);

    // Walk active chain
    const chain = this.providerChains[taskClass] || this.providerChains.content;
    let usableProviders = chain.filter(p => this._providerAvailable(p));

    if (usableProviders.length === 0) {
      usableProviders = ['ollama'];
    }

    const failures = [];
    for (const provider of usableProviders) {
      let models = this.modelChains[provider] || [];

      // If budget constraint, filter out models exceeding cost
      if (budget !== null) {
        models = models.filter(m => {
          const estIn = this.tokenOptimizer.estimateTokens(optimizedPrompt);
          const estOut = Math.floor(maxTokens / 4);
          const estCost = this._calculateCost(provider, m, estIn, estOut);
          return estCost <= budget;
        });

        if (models.length === 0) {
          console.warn(`No models for provider ${provider} fit in budget ${budget}`);
          continue;
        }
      }

      let providerSucceeded = false;
      for (const model of models) {
        const attempts = 2;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            console.log(`Routing request -> ${provider.toUpperCase()} (${model}), attempt ${attempt + 1}`);
            const wrappedSystem = this._wrapSystemPrompt(provider, model, optimizedSystem);

            const startTime = Date.now();
            const { content, inputTokens, outputTokens } = await this._dispatchCall(
              provider, model, optimizedPrompt, wrappedSystem, temperature, maxTokens
            );
            const elapsed = (Date.now() - startTime) / 1000;

            // Apply Output Sanitization
            const sanitizedContent = this.guardrails.sanitizeOutput(content);
            const cost = this._calculateCost(provider, model, inputTokens, outputTokens);
            providerSucceeded = true;

            console.log(`✓ ${provider.toUpperCase()} (${model}) call succeeded in ${elapsed.toFixed(2)}s`);
            return {
              content: sanitizedContent,
              provider,
              model,
              cost,
              latency: elapsed
            };
          } catch (e) {
            const msg = e.message.slice(0, 150);
            failures.push(`${provider}/${model}: ${msg}`);
            console.warn(`${provider}/${model} failed on attempt ${attempt + 1}: ${msg}`);
            if (attempt + 1 < attempts) {
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
      }

      if (!providerSucceeded) {
        _downProviders.add(provider);
        console.error(`CIRCUIT OPENED: Provider ${provider} failed all models and is marked down.`);
      }
    }

    throw new Error(`All routed providers in ${taskClass} chain failed: ${failures.join('; ')}`);
  }

  async _dispatchCall(provider, model, prompt, systemPrompt, temperature, maxTokens) {
    const timeout = this.timeouts[provider] || 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      if (provider === 'openai') {
        return await this._callOpenai(controller.signal, model, prompt, systemPrompt, temperature, maxTokens);
      } else if (provider === 'anthropic') {
        return await this._callAnthropic(controller.signal, model, prompt, systemPrompt, temperature, maxTokens);
      } else if (provider === 'gemini') {
        return await this._callGemini(controller.signal, model, prompt, systemPrompt, temperature, maxTokens);
      } else if (provider === 'ollama') {
        return await this._callOllama(controller.signal, model, prompt, systemPrompt, temperature);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async _callOpenai(signal, model, prompt, systemPrompt, temp, maxTok) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.keys.openai}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, messages, temperature: temp, max_tokens: maxTok }),
      signal
    });

    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens
    };
  }

  async _callAnthropic(signal, model, prompt, systemPrompt, temp, maxTok) {
    const url = 'https://api.anthropic.com/v1/messages';
    const messages = [{ role: 'user', content: prompt }];
    const payload = { model, messages, temperature: temp, max_tokens: maxTok };
    if (systemPrompt) payload.system = systemPrompt;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.keys.anthropic,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return {
      content: data.content[0].text,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens
    };
  }

  async _callGemini(signal, model, prompt, systemPrompt, temp, maxTok) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.keys.gemini}`;
    const contents = [];
    if (systemPrompt) contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: temp, maxOutputTokens: maxTok }
      }),
      signal
    });

    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const content = data.candidates[0].content.parts[0].text;
    return {
      content,
      inputTokens: Math.floor(prompt.length / 4),
      outputTokens: Math.floor(content.length / 4)
    };
  }

  async _callOllama(signal, model, prompt, systemPrompt, temp) {
    const url = `${this.ollamaUrl}/api/chat`;
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: temp }
      }),
      signal
    });

    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json();
    const content = data.message.content;
    return {
      content,
      inputTokens: data.prompt_eval_count || Math.floor(prompt.length / 4),
      outputTokens: data.eval_count || Math.floor(content.length / 4)
    };
  }
}

export function resetCircuitBreakers() {
  _downProviders.clear();
}
