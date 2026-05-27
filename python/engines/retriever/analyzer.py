import os
import json
import logging
import asyncio
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse
from datetime import datetime
import requests
from bs4 import BeautifulSoup

# Import custom Router from router
from ..router.router import Router

logger = logging.getLogger("equilibrium.analyzer")

class ContentAnalyzer:
    """AI-powered content analysis and insights generation using custom LLM router."""
    
    def __init__(self, router: Optional[Router] = None):
        # Initialize Router if not provided
        if router is None:
            self.router = Router(
                openai_key=os.environ.get("OPENAI_API_KEY"),
                anthropic_key=os.environ.get("ANTHROPIC_API_KEY"),
                gemini_key=os.environ.get("GEMINI_API_KEY"),
                ollama_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
                default_provider="ollama"
            )
        else:
            self.router = router
            
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        })
    
    async def analyze_url(self, url: str) -> Dict[str, Any]:
        """Extract content from URL and generate insights using LLM router."""
        try:
            content = await self._extract_content(url)
            if not content:
                return self._default_analysis(url)
            
            analysis = await self._ai_analyze_content(content, url)
            return analysis
        except Exception as e:
            logger.error(f"URL analysis failed for {url}: {e}")
            return self._default_analysis(url)
    
    async def analyze_text(self, text: str) -> Dict[str, Any]:
        """Analyze raw text content directly."""
        try:
            if not text or len(text.strip()) < 30:
                return self._default_analysis()
            
            analysis = await self._ai_analyze_content(text)
            return analysis
        except Exception as e:
            logger.error(f"Text analysis failed: {e}")
            return self._default_analysis()
            
    async def _extract_content(self, url: str) -> Optional[str]:
        """Fetch page and extract clean body content using BeautifulSoup selectors."""
        try:
            # Ensure protocol
            if not url.startswith('http://') and not url.startswith('https://'):
                url = f"https://{url}"

            response = await asyncio.to_thread(
                self.session.get,
                url,
                timeout=12
            )
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Decompose scripts, nav, footer, style headers to avoid noise
            for elem in soup(['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript']):
                elem.decompose()
            
            # Target content selectors
            content_selectors = [
                'article', 'main', '.content', '#content',
                '.post-content', '.entry-content', '.article-content'
            ]
            
            content = ""
            for selector in content_selectors:
                elem = soup.select_one(selector)
                if elem:
                    content = elem.get_text(strip=True)
                    break
            
            if not content:
                content = soup.get_text(strip=True)
            
            # Collapse whitespace
            content = ' '.join(content.split())
            return content[:6000]  # Return up to 6000 characters
            
        except Exception as e:
            logger.error(f"Content extraction failed for {url}: {e}")
            return None

    async def _ai_analyze_content(self, content: str, url: Optional[str] = None) -> Dict[str, Any]:
        """Formats an AI prompt, dispatches it to the Router, and parses JSON output."""
        system_prompt = "You are a professional content analysis bot. You extract metadata and insights in clean JSON format."
        
        prompt = f"""
        Analyze this text content for key insights, relevance, and sentiment.

        Text Content (first 4000 characters):
        {content[:4000]}

        Respond ONLY with a valid, parsable JSON block matching this exact structure:
        {{
            "key_insights": ["insight 1", "insight 2", "insight 3"],
            "sentiment": "positive",
            "relevance_score": 8.5,
            "content_type": "report",
            "main_topics": ["topic 1", "topic 2"],
            "quality_score": 7.5,
            "summary": "Brief one sentence summary of the article."
        }}
        """
        
        try:
            # Call router (routing to simple/content chain)
            result = await self.router.chat(
                prompt=prompt,
                system_prompt=system_prompt,
                task_class="content",
                temperature=0.2,
                max_tokens=1000
            )
            
            raw_content = result.get("content", "").strip()
            
            # Clean possible markdown enclosing JSON from LLM response
            if raw_content.startswith("```json"):
                raw_content = raw_content[7:]
            if raw_content.endswith("```"):
                raw_content = raw_content[:-3]
            raw_content = raw_content.strip()
            
            analysis = json.loads(raw_content)
            
            # Add metadata
            analysis.update({
                "analyzed_at": datetime.now().isoformat(),
                "content_length": len(content),
                "url": url,
                "domain": urlparse(url).netloc if url else None,
                "provider_used": result.get("provider"),
                "model_used": result.get("model")
            })
            
            return analysis
        except Exception as e:
            logger.error(f"AI analysis failed or JSON parsing error: {e}")
            return self._default_analysis(url)

    def _default_analysis(self, url: Optional[str] = None) -> Dict[str, Any]:
        return {
            "key_insights": [
                "Requires manual verification.",
                "Content analysis system fallback activated."
            ],
            "sentiment": "neutral",
            "relevance_score": 5.0,
            "content_type": "webpage",
            "main_topics": ["general"],
            "quality_score": 5.0,
            "summary": "Content analysis fallback due to system failure or short input.",
            "analyzed_at": datetime.now().isoformat(),
            "content_length": 0,
            "url": url,
            "domain": urlparse(url).netloc if url else None,
            "fallback": True
        }
