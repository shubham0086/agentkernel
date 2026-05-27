/**
 * AI-powered content analyzer using custom LLM router.
 * Modern ESModules.
 */

import { Router } from '../01_router/router.js';

export class ContentAnalyzer {
  /**
   * @param {Router} [router]
   */
  constructor(router = null) {
    if (!router) {
      this.router = new Router({
        openai: process.env.OPENAI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY,
        gemini: process.env.GEMINI_API_KEY
      }, process.env.OLLAMA_BASE_URL || 'http://localhost:11434', 'ollama');
    } else {
      this.router = router;
    }
  }

  /**
   * Analyze content from a URL.
   * @param {string} url 
   * @returns {Promise<Object>}
   */
  async analyzeUrl(url) {
    try {
      const content = await this._extractContent(url);
      if (!content) {
        return this._defaultAnalysis(url);
      }
      return await this._aiAnalyzeContent(content, url);
    } catch (e) {
      console.error(`[ContentAnalyzer] URL analysis failed for ${url}: ${e.message}`);
      return this._defaultAnalysis(url);
    }
  }

  /**
   * Analyze raw text content.
   * @param {string} text 
   * @returns {Promise<Object>}
   */
  async analyzeText(text) {
    try {
      if (!text || text.trim().length < 30) {
        return this._defaultAnalysis();
      }
      return await this._aiAnalyzeContent(text);
    } catch (e) {
      console.error(`[ContentAnalyzer] Text analysis failed: ${e.message}`);
      return this._defaultAnalysis();
    }
  }

  /**
   * Fetch URL and clean content.
   * @param {string} url 
   * @returns {Promise<string|null>}
   */
  async _extractContent(url) {
    try {
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const response = await fetch(formattedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const rawHtml = await response.text();

      // Clean HTML using standard regex
      let cleaned = rawHtml
        .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
        .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '')
        .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, '')
        .replace(/<!--([\s\S]*?)-->/g, '')
        .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, '')
        .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, '')
        .replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, '');

      // Attempt to target article/main bodies if present
      const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/gi.exec(cleaned);
      let bodyText = bodyMatch ? bodyMatch[1] : cleaned;

      // Extract text content from tags
      bodyText = bodyText
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return bodyText.slice(0, 6000); // Limit to 6000 chars
    } catch (e) {
      console.error(`[ContentAnalyzer] Extraction failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Run AI analysis over text content.
   * @param {string} content 
   * @param {string} [url] 
   * @returns {Promise<Object>}
   */
  async _aiAnalyzeContent(content, url = null) {
    const systemPrompt = "You are a professional content analysis bot. You extract metadata and insights in clean JSON format.";
    const prompt = `
Analyze this text content for key insights, relevance, and sentiment.

Text Content (first 4000 characters):
${content.slice(0, 4000)}

Respond ONLY with a valid, parsable JSON block matching this exact structure:
{
    "key_insights": ["insight 1", "insight 2", "insight 3"],
    "sentiment": "positive",
    "relevance_score": 8.5,
    "content_type": "report",
    "main_topics": ["topic 1", "topic 2"],
    "quality_score": 7.5,
    "summary": "Brief one sentence summary of the article."
}
`;

    try {
      const result = await this.router.chat(prompt, systemPrompt, 'content', 0.2, 1000);
      let rawContent = result.content.trim();

      // Clean possible Markdown wrapping
      if (rawContent.startsWith("```json")) {
        rawContent = rawContent.slice(7);
      }
      if (rawContent.endsWith("```")) {
        rawContent = rawContent.slice(0, -3);
      }
      rawContent = rawContent.trim();

      const analysis = JSON.parse(rawContent);

      analysis.analyzed_at = new Date().toISOString();
      analysis.content_length = content.length;
      analysis.url = url;
      analysis.domain = url ? new URL(url).hostname : null;
      analysis.provider_used = result.provider;
      analysis.model_used = result.model;

      return analysis;
    } catch (e) {
      console.error(`[ContentAnalyzer] AI model analysis or parsing failed: ${e.message}`);
      return this._defaultAnalysis(url);
    }
  }

  _defaultAnalysis(url = null) {
    return {
      key_insights: [
        "Requires manual verification.",
        "Content analysis system fallback activated."
      ],
      sentiment: "neutral",
      relevance_score: 5.0,
      content_type: "webpage",
      main_topics: ["general"],
      quality_score: 5.0,
      summary: "Content analysis fallback due to system failure or short input.",
      analyzed_at: new Date().toISOString(),
      content_length: 0,
      url,
      domain: url ? new URL(url).hostname : null,
      fallback: true
    };
  }
}
