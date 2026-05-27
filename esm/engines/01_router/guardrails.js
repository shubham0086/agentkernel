/**
 * Active Input Guardrails and Output Sanitization.
 * Upgraded to ESModules and follows rules from repo-publishing-rules.md.
 */

export class GuardrailError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuardrailError';
  }
}

export class Guardrails {
  constructor() {
    this.injectionKeywords = [
      /ignore\s+(?:all\s+)?(?:prior|previous)\s+(?:instructions|prompts|rules)/i,
      /system\s+prompt\s+override/i,
      /bypass\s+(?:system|agent)\s+rules/i,
      /you\s+are\s+now\s+a\s+(?:different|new)\s+agent/i,
      /disregard\s+all\s+previous/i,
      /forget\s+what\s+we\s+discussed/i,
      /bypass\s+the\s+guardrails/i,
    ];

    this.secretPatterns = [
      [/sk-[a-zA-Z0-9_\-]{12,}/gi, '[REDACTED_API_KEY]'],
      [/AIzaSy[a-zA-Z0-9_\-]{33}/gi, '[REDACTED_API_KEY]'],
      [/eyJhbGciOi[a-zA-Z0-9_\-\.]+/gi, '[REDACTED_JWT_TOKEN]'],
      [/bearer\s+[a-zA-Z0-9_\-\.]{12,}/gi, 'Bearer [REDACTED_BEARER_TOKEN]'],
      [/(postgresql|mongodb|mysql|redis|sqlite):\/\/[a-zA-Z0-9_\-\.]+:[a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+:\d+\/[a-zA-Z0-9_\-]+/gi, '$1://[REDACTED_DB_CREDENTIALS]'],
    ];
  }

  /**
   * Validate input context against prompt injection keywords.
   * Throws GuardrailError on detection.
   * @param {string} text 
   */
  validateInput(text) {
    if (!text) return;
    for (const regex of this.injectionKeywords) {
      if (regex.test(text)) {
        console.error(`Guardrail trigger: prompt injection detected matching pattern: ${regex.toString()}`);
        throw new GuardrailError('Security Policy Blocked Request: Injection pattern matched.');
      }
    }
  }

  /**
   * Redact sensitive tokens and passwords from outputs.
   * @param {string} text 
   * @returns {string}
   */
  sanitizeOutput(text) {
    if (!text) return '';
    let sanitized = text;

    for (let i = 0; i < this.secretPatterns.length; i++) {
      const [regex, replacement] = this.secretPatterns[i];
      sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized;
  }
}
