import os
import asyncio
import logging
from typing import Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("research_video_assistant")

# Add parent folders to sys.path to enable local engines import
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[2]))

from python.engines.router import Router
from python.engines.retriever import SearchProviderManager, ContentAnalyzer, FirecrawlScraper
from python.engines.outreach import ChaiPitchEngine
from python.engines.auth import create_lead, create_outreach_message, SessionLocal, Base, engine

async def run_pipeline(keyword: str, city: str):
    logger.info(f"🚀 Starting Research Video Assistant for keyword: '{keyword}' in {city}...")
    
    # Initialize DB tables
    logger.info("Initializing SQLite database tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Initialize shared Router
    router = Router(
        openai_key=os.environ.get("OPENAI_API_KEY"),
        anthropic_key=os.environ.get("ANTHROPIC_API_KEY"),
        gemini_key=os.environ.get("GEMINI_API_KEY"),
        ollama_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        default_provider="ollama"
    )

    # 1. Lead Scraping Phase
    scraper = FirecrawlScraper(api_key=os.environ.get("FIRECRAWL_API_KEY"))
    leads = []
    
    if scraper.is_configured():
        logger.info("Firecrawl API Key configured. Hunting leads on IndiaMART...")
        leads = await scraper.scrape_indiamart(keyword=keyword, city=city)
    else:
        logger.warning("FIRECRAWL_API_KEY is not configured. Falling back to Keyless DuckDuckGo lead crawler...")
        # Use DDG aggregator to find relevant domain directories
        search_manager = SearchProviderManager()
        search_results = await search_manager.search(f"{keyword} suppliers in {city}", max_results=3)
        
        # Simulate structured lead extraction from search results
        for idx, result in enumerate(search_results):
            leads.append({
                "name": f"Supplier Contact {idx + 1}",
                "company_name": result.title.split("-")[0].strip(),
                "contact_person": f"Representative {idx + 1}",
                "phone": "+91 99999 88888",
                "category": keyword,
                "source": "DuckDuckGo Search Crawler",
                "stage": "new"
            })
            
    if not leads:
        logger.warning("No leads found. Using fallback mock lead for demonstration.")
        leads = [{
            "name": "Rajesh ji",
            "company_name": "Vedic Organics",
            "contact_person": "Rajesh Sharma",
            "phone": "+91 98765 43210",
            "category": "Ayurvedic Cosmetics",
            "source": "Mock Fallback",
            "stage": "new"
        }]

    logger.info(f"🔍 Discovered {len(leads)} leads. Generating outreach pitches...")

    # 2. Hinglish Copywriting Phase
    pitch_engine = ChaiPitchEngine(router=router)
    content_analyzer = ContentAnalyzer(router=router)
    
    for lead in leads:
        company = lead["company_name"]
        contact = lead["contact_person"]
        category = lead["category"]
        
        # Analyze company sector using keyless search content analyzer if url/info is available
        logger.info(f"Analyzing brand context for '{company}'...")
        brand_summary = await content_analyzer.analyze_text(
            f"{company} is an Indian manufacturer of {category} organic products located in {city}."
        )
        
        logger.info(f"Drafting Hinglish WhatsApp outreach message for {company}...")
        lead_payload = {
            "company_name": company,
            "contact_person": contact,
            "category": category,
            "additional_context": f"Brand quality score: {brand_summary.get('quality_score', 7.5)}/10. Summary: {brand_summary.get('summary', '')}"
        }
        
        pitch = await pitch_engine.generate_pitch(lead_payload)
        logger.info(f"✨ Pitch generated for {company}:\n\"{pitch}\"\n")
        
        # Save to Database
        db_lead = create_lead(
            db=db,
            name=lead["name"],
            company_name=company,
            contact_person=contact,
            phone=lead.get("phone", ""),
            category=category,
            source=lead["source"]
        )
        
        create_outreach_message(
            db=db,
            lead_id=db_lead.id,
            message_text=pitch,
            channel="whatsapp"
        )
        
    db.close()
    logger.info("🎉 Assistant pipeline completed successfully! Leads and drafts saved in SQLite.")

if __name__ == "__main__":
    keyword = "Ayurvedic Wellness"
    city = "Jaipur"
    asyncio.run(run_pipeline(keyword, city))
