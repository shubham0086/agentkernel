/**
 * ChaiPitch Hinglish (Hindi + English) WhatsApp AI Outreach generator.
 * Uses the custom LLM Router in ESModules format.
 */

import { Router } from '../01_router/router.js';

export class ChaiPitchEngine {
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
   * Generates a personalized WhatsApp outreach message in HINGLISH.
   * Uses fallback chains (Gemini -> OpenAI -> Anthropic -> Ollama).
   * 
   * @param {Object} leadData 
   * @param {string} leadData.company_name 
   * @param {string} leadData.contact_person 
   * @param {string} leadData.category 
   * @param {string} [leadData.additional_context]
   * @returns {Promise<string>}
   */
  async generatePitch(leadData) {
    const company = leadData.company_name || 'your brand';
    const person = leadData.contact_person || 'there';
    const category = leadData.category || 'D2C';
    const additionalContext = leadData.additional_context || '';

    const prompt = `
You are a professional growth consultant for Indian D2C brands. 
Write a warm, high-converting WhatsApp outreach message in HINGLISH (Hindi + English) for the following lead:

Lead Name: ${person}
Company: ${company}
Category: ${category}
Additional Context: ${additionalContext}

Guidelines:
- Start with a warm 'Namaste' or 'Hey'.
- Use 'Ji' for respect when referencing names (e.g., Rahul ji).
- Compliment their brand (e.g., "Aapka ${company} ka kaam kaafi badhiya lag raha hai").
- Keep it short, conversational, and direct.
- End with a simple question to prompt response.
- Do not use corporate jargon; write like a friend.

Example format:
"Hey Rahul ji, Namaste! Ayurveda Essentials ka content kaafi solid lag raha hai. I love how you guys are handling Organic Wellness. Humne aapke brand ke liye ek special marketing plan banaya hai. Small chat ke liye free hain aap? 💬"
`;

    const systemPrompt = "You are a growth consultant writing natural, engaging Hinglish copy. Do not include quotes or surrounding markdown tags.";

    try {
      const response = await this.router.chat(prompt, systemPrompt, 'content', 0.7, 300);
      let pitch = response.content.trim();

      // Clean wrapping quotes if present
      if (pitch.startsWith('"') && pitch.endsWith('"')) {
        pitch = pitch.slice(1, -1);
      }
      return pitch.trim();
    } catch (e) {
      console.error(`[ChaiPitchEngine] Outreach generation failed: ${e.message}`);
      const greeting = person !== 'there' ? `Hey ${person} ji` : 'Hey there';
      return `${greeting}! I came across ${company} and really loved your work in ${category}. We compiled a custom audit showing how to scale your outreach. Let me know if we can chat for 5 mins? ☕`;
    }
  }
}
