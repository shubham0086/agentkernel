/**
 * Token optimizer for prompt compression and token cost savings.
 * Ported from production AIOps utils/token_optimizer.py and upgraded to ESModules.
 */

export class TokenOptimizer {
  constructor() {
    this.optimizationRules = [
      // Remove excessive whitespace
      [/\s+/g, ' '],
      // Remove redundant words
      [/\b(very|quite|rather|somewhat|pretty)\s+/gi, ''],
      // Simplify common phrases
      [/in order to/gi, 'to'],
      [/due to the fact that/gi, 'because'],
      [/a lot of/gi, 'many'],
      [/at this point in time/gi, 'now'],
      // Remove filler words in context
      [/\b(basically|essentially|actually|literally)\s+/gi, ''],
    ];
  }

  /**
   * Optimize a prompt for token efficiency.
   * @param {string} prompt 
   * @returns {string}
   */
  optimizePrompt(prompt) {
    if (!prompt) return '';
    try {
      let optimized = prompt.trim();

      // Apply optimization rules
      for (const [pattern, replacement] of this.optimizationRules) {
        optimized = optimized.replace(pattern, replacement);
      }

      // Clean up multiple spaces
      optimized = optimized.replace(/\s+/g, ' ');

      // Remove trailing/leading whitespace
      return optimized.trim();
    } catch (e) {
      console.error(`Prompt optimization failed: ${e.message}`);
      return prompt; // Return original on error
    }
  }

  /**
   * Rough estimate of tokens (1 token ≈ 4 characters for English).
   * @param {string} text 
   * @returns {number}
   */
  estimateTokens(text) {
    return Math.floor((text || '').length / 4);
  }
}
