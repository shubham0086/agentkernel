/**
 * Voice synthesizer engine supporting ElevenLabs and Gemini TTS.
 * ESModules.
 */

import fs from 'fs';
import path from 'path';

/**
 * Encapsulate raw PCM audio buffer with standard RIFF/WAV header.
 * @param {Buffer} pcm 
 * @param {number} sr Sample Rate
 * @param {number} ch Channels
 * @param {number} bd Bit Depth
 * @returns {Buffer}
 */
export function pcmToWav(pcm, sr = 24000, ch = 1, bd = 16) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE((sr * ch * bd) / 8, 28);
  h.writeUInt16LE((ch * bd) / 8, 32);
  h.writeUInt16LE(bd, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export class VoiceGenerator {
  /**
   * @param {Object} [config] 
   * @param {string} [config.geminiApiKey]
   * @param {string} [config.elevenLabsApiKey]
   * @param {string} [config.elevenLabsVoiceId]
   */
  constructor({ geminiApiKey, elevenLabsApiKey, elevenLabsVoiceId } = {}) {
    this.geminiApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
    this.elevenLabsApiKey = elevenLabsApiKey || process.env.ELEVEN_LABS_API_KEY;
    this.elevenLabsVoiceId = elevenLabsVoiceId || process.env.ELEVEN_LABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  }

  /**
   * Synthesizes audio using ElevenLabs API.
   * @param {string} text 
   * @returns {Promise<Buffer>}
   */
  async elevenLabsTTS(text) {
    if (!this.elevenLabsApiKey) {
      throw new Error("ElevenLabs API Key not configured.");
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs returned status ${response.status}: ${await response.text()}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Synthesizes audio using Gemini multimodal TTS API.
   * @param {string} text 
   * @param {string} [voiceName] Defaults to 'Kore'
   * @returns {Promise<Buffer>}
   */
  async geminiTTS(text, voiceName = "Kore") {
    if (!this.geminiApiKey) {
      throw new Error("Gemini API Key not configured.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini TTS returned status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) {
      throw new Error("No inline audio data returned from Gemini TTS API.");
    }

    const pcmBuffer = Buffer.from(b64, 'base64');
    return pcmToWav(pcmBuffer, 24000, 1, 16);
  }

  /**
   * General voice generation with failover (ElevenLabs -> Gemini -> Error).
   * @param {string} text 
   * @param {boolean} [preferEleven] 
   * @returns {Promise<Buffer>}
   */
  async generate(text, preferEleven = false) {
    if (preferEleven && this.elevenLabsApiKey) {
      try {
        return await this.elevenLabsTTS(text);
      } catch (e) {
        console.warn(`[VoiceGenerator] ElevenLabs failed, falling back to Gemini TTS: ${e.message}`);
      }
    }

    if (this.geminiApiKey) {
      return await this.geminiTTS(text);
    }

    throw new Error("Neither ElevenLabs nor Gemini TTS API keys are configured.");
  }
}
