/**
 * Research Video Assistant pipeline demonstration.
 * Integrates Lead Scraping, Hinglish Pitch Copywriting, and Remotion Video rendering.
 * ESModules.
 */

import fs from 'fs';
import path from 'path';
import { Router } from '../../esm/engines/01_router/router.js';
import { SearchProviderManager, ContentAnalyzer, FirecrawlScraper } from '../../esm/engines/03_retriever/index.js';
import { ChaiPitchEngine } from '../../esm/engines/05_media/chaipitch.js';
import { createLead, createOutreachMessage } from '../../esm/engines/06_auth/crud.js';

async function runPipeline(keyword, city) {
  console.log(`🚀 Starting ESM Research Video Assistant for keyword: '${keyword}' in ${city}...`);

  // Initialize shared Router
  const router = new Router({
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    gemini: process.env.GEMINI_API_KEY
  }, process.env.OLLAMA_BASE_URL || 'http://localhost:11434', 'ollama');

  const scraper = new FirecrawlScraper();
  let leads = [];

  // 1. Lead Scraping Phase
  if (scraper.isConfigured()) {
    console.log("Firecrawl API configured. Hunting leads on IndiaMART...");
    leads = await scraper.scrapeIndiamart(keyword, city);
  } else {
    console.warn("FIRECRAWL_API_KEY is not configured. Falling back to Keyless DuckDuckGo search crawler...");
    const searchManager = new SearchProviderManager();
    const searchResults = await searchManager.search(`${keyword} suppliers in ${city}`, 3);

    leads = searchResults.map((result, idx) => ({
      name: `Supplier Contact ${idx + 1}`,
      company_name: result.title.split('-')[0].trim(),
      contact_person: `Representative ${idx + 1}`,
      phone: '+91 99999 88888',
      category: keyword,
      source: 'DuckDuckGo Search Crawler'
    }));
  }

  if (leads.length === 0) {
    console.log("No leads discovered. Injecting demonstration lead...");
    leads.push({
      name: 'Rajesh ji',
      company_name: 'Vedic Organics',
      contact_person: 'Rajesh Sharma',
      phone: '+91 98765 43210',
      category: 'Ayurvedic Cosmetics',
      source: 'Mock Fallback'
    });
  }

  console.log(`🔍 Discovered ${leads.length} leads. Generating outreach pitches...`);

  // 2. Hinglish Copywriting Phase
  const pitchEngine = new ChaiPitchEngine(router);
  const analyzer = new ContentAnalyzer(router);

  const folderName = `${keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${city.toLowerCase()}-leads`;
  const manifestDir = path.resolve(process.cwd(), 'public', folderName);
  fs.mkdirSync(manifestDir, { recursive: true });

  const manifest = {
    title: `${keyword} Leads in ${city}`,
    subtitle: `AI-Compiled Supplier Intelligence Report`,
    bgMusic: null,
    scenes: []
  };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const company = lead.company_name;
    const contact = lead.contact_person;
    const category = lead.category;

    console.log(`Analyzing brand sector: '${company}'...`);
    const analysis = await analyzer.analyzeText(`${company} is an Indian manufacturer of ${category} organic products located in ${city}.`);

    console.log(`Drafting Hinglish WhatsApp pitch for ${company}...`);
    const pitch = await pitchEngine.generatePitch({
      company_name: company,
      contact_person: contact,
      category,
      additional_context: `Quality rating: ${analysis.quality_score}/10. Summary: ${analysis.summary}`
    });

    console.log(`✨ Generated Pitch:\n"${pitch}"\n`);

    // Insert database records
    const dbLead = createLead({
      name: lead.name,
      companyName: company,
      contactPerson: contact,
      phone: lead.phone || '',
      category,
      source: lead.source
    });

    createOutreachMessage(dbLead.id, pitch, 'whatsapp');

    // Create scene structures for Video-as-Code compilation
    manifest.scenes.push({
      id: `scene-${i + 1}`,
      label: company.toUpperCase(),
      image: `${folderName}/scene-${i + 1}.jpg`,
      audio: `${folderName}/scene-${i + 1}.mp3`,
      narration: `Aapka ${company} ka kaam kaafi badhiya lag raha hai. I love how you guys are handling organic ${category}.`
    });

    // Write placeholder media to prevent render failure
    fs.writeFileSync(path.join(manifestDir, `scene-${i + 1}.jpg`), Buffer.alloc(0)); // empty placeholder jpg
    fs.writeFileSync(path.join(manifestDir, `scene-${i + 1}.mp3`), Buffer.alloc(0)); // empty placeholder mp3
  }

  // Save the manifest
  fs.writeFileSync(path.join(manifestDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`✅ manifest.json saved in: ${manifestDir}`);
  console.log(`🎬 To render this compiled video report, run:`);
  console.log(`   npx remotion render StoryTemplate out/${folderName}.mp4 --props='{"folder": "${folderName}", "sceneDurationFrames": 360}'`);
}

runPipeline('Ayurveda Wellness', 'Jaipur').catch(console.error);
