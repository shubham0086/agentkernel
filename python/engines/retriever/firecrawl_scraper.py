import os
import logging
import asyncio
from typing import List, Dict, Optional, Any
import requests

logger = logging.getLogger("equilibrium.firecrawl")

class FirecrawlScraper:
    """Wrapper for Firecrawl API scraping and structured data extraction."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("FIRECRAWL_API_KEY")
        self.session = requests.Session()
        
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def scrape(self, url: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Scrapes URL using Firecrawl API."""
        if not self.is_configured():
            logger.error("Firecrawl API key is not configured.")
            return {"success": False, "error": "Firecrawl connector not configured"}

        # Format URL
        formatted_url = url.strip()
        if not formatted_url.startswith('http://') and not formatted_url.startswith('https://'):
            formatted_url = f"https://{formatted_url}"

        logger.info(f"Firecrawl scraping URL: {formatted_url}")
        
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        
        payload = {
            'url': formatted_url,
            'formats': options.get('formats', ['markdown']) if options else ['markdown'],
            'onlyMainContent': options.get('onlyMainContent', True) if options else True,
        }
        if options:
            if 'waitFor' in options:
                payload['waitFor'] = options['waitFor']
            if 'location' in options:
                payload['location'] = options['location']
            if 'jsonOptions' in options:
                payload['jsonOptions'] = options['jsonOptions']

        try:
            response = await asyncio.to_thread(
                self.session.post,
                'https://api.firecrawl.dev/v1/scrape',
                headers=headers,
                json=payload,
                timeout=30
            )
            
            data = response.json()
            if not response.ok:
                logger.error(f"Firecrawl API returned error: {data}")
                return {"success": False, "error": data.get("error", f"Status {response.status_code}")}
                
            return {"success": True, "data": data.get("data", {})}
        except Exception as e:
            logger.error(f"Firecrawl scrape request failed: {e}")
            return {"success": False, "error": str(e)}

    async def scrape_indiamart(self, keyword: str, city: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Directory-specific scraper that searches IndiaMART for suppliers matching a keyword,
        running a structured LLM extraction query on Firecrawl.
        """
        if not self.is_configured():
            logger.warning("Firecrawl not configured. Returning empty leads.")
            return []

        search_query = f"{keyword} {city}" if city else keyword
        search_url = f"https://www.indiamart.com/isearch.php?s={requests.utils.quote(search_query)}"
        
        logger.info(f"Hunting leads on IndiaMART: '{keyword}' in {city or 'India'}")
        
        # Define JSON extraction schema for Firecrawl
        json_schema = {
            "type": "object",
            "properties": {
                "leads": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "company_name": {"type": "string"},
                            "contact_person": {"type": "string"},
                            "phone": {"type": "string"},
                            "category": {"type": "string"}
                        },
                        "required": ["company_name"]
                    }
                }
            }
        }
        
        options = {
            "formats": ["json"],
            "jsonOptions": {
                "schema": json_schema
            }
        }
        
        res = await self.scrape(search_url, options)
        if not res.get("success"):
            logger.error(f"IndiaMART scrape failed: {res.get('error')}")
            return []
            
        extracted_data = res.get("data", {}).get("json", {})
        raw_leads = extracted_data.get("leads", [])
        
        # Standardize leads output
        leads = []
        for l in raw_leads:
            company_name = l.get("company_name")
            if not company_name:
                continue
            leads.append({
                "name": l.get("contact_person") or company_name,
                "company_name": company_name,
                "contact_person": l.get("contact_person", ""),
                "phone": l.get("phone") or "",
                "category": l.get("category") or keyword,
                "source": "IndiaMART",
                "stage": "new"
            })
            
        logger.info(f"Successfully scraped {len(leads)} leads from IndiaMART.")
        return leads
