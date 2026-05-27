/**
 * Subtitle generator using Remotion-wrapped FFmpeg and install-whisper-cpp.
 * ESModules.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Optional imports to avoid crash if not installed
let installWhisperModule = null;
try {
  installWhisperModule = await import('@remotion/install-whisper-cpp');
} catch (_) {
  console.warn("[Subtitles] @remotion/install-whisper-cpp not found. Subtitling will require package installation.");
}

export class SubtitleGenerator {
  constructor(whisperPath = null) {
    this.whisperPath = whisperPath || path.join(process.cwd(), '.whisper');
    this.whisperModel = 'tiny.en';
    this.whisperVersion = '1.5.4';
  }

  /**
   * Initialize whisper-cpp binaries and download model files.
   */
  async init() {
    if (!installWhisperModule) {
      throw new Error("@remotion/install-whisper-cpp package is missing.");
    }
    
    const { installWhisperCpp, downloadWhisperModel } = installWhisperModule;
    
    if (!fs.existsSync(this.whisperPath)) {
      fs.mkdirSync(this.whisperPath, { recursive: true });
    }

    console.log(`[Subtitles] Installing Whisper.cpp to ${this.whisperPath}...`);
    await installWhisperCpp({ to: this.whisperPath, version: this.whisperVersion });

    console.log(`[Subtitles] Downloading Whisper model: ${this.whisperModel}...`);
    await downloadWhisperModel({ folder: this.whisperPath, model: this.whisperModel });
  }

  /**
   * Extract 16khz mono audio wav from video.
   * @param {string} videoPath 
   * @param {string} wavOutPath 
   */
  extractAudio(videoPath, wavOutPath) {
    console.log(`[Subtitles] Extracting audio: ${videoPath} -> ${wavOutPath}`);
    execSync(
      `npx remotion ffmpeg -i "${videoPath}" -ar 16000 -ac 1 "${wavOutPath}" -y`,
      { stdio: "ignore" }
    );
  }

  /**
   * Run transcription on a 16khz WAV file.
   * @param {string} wavPath 
   * @returns {Promise<Array>} List of captions
   */
  async transcribeWav(wavPath) {
    if (!installWhisperModule) {
      throw new Error("@remotion/install-whisper-cpp is not installed.");
    }

    const { transcribe, toCaptions } = installWhisperModule;

    console.log(`[Subtitles] Transcribing audio file...`);
    const whisperCppOutput = await transcribe({
      inputPath: wavPath,
      model: this.whisperModel,
      tokenLevelTimestamps: true,
      whisperPath: this.whisperPath,
      whisperCppVersion: this.whisperVersion,
      printOutput: false,
      translateToEnglish: false,
      splitOnWord: true
    });

    const { captions } = toCaptions({ whisperCppOutput });
    return captions;
  }

  /**
   * Full pipeline: extract audio and transcribe.
   * @param {string} videoPath 
   * @param {string} jsonOutPath 
   */
  async processVideo(videoPath, jsonOutPath) {
    const tempWav = path.join(process.cwd(), `temp-${Date.now()}.wav`);
    try {
      this.extractAudio(videoPath, tempWav);
      const captions = await this.transcribeWav(tempWav);
      
      fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
      fs.writeFileSync(jsonOutPath, JSON.stringify(captions, null, 2), 'utf-8');
      console.log(`[Subtitles] Successfully saved subtitles to ${jsonOutPath}`);
      return captions;
    } finally {
      if (fs.existsSync(tempWav)) {
        fs.unlinkSync(tempWav);
      }
    }
  }
}
