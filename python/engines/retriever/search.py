import os
import re
import asyncio
import logging
from typing import List, Dict, Optional, Any
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("equilibrium.search")

@dataclass
class SearchResult:
    """Standardized search result format"""
    title: str
    url: str
    snippet: str
    source: str
    published_date: Optional[datetime] = None
    authority_score: float = 0.0
    relevance_score: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source": self.source,
            "published_date": self.published_date.isoformat() if self.published_date else None,
            "authority_score": self.authority_score,
            "relevance_score": self.relevance_score
        }

class BaseSearchProvider(ABC):
    """Base class for search providers"""
    
    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.session = requests.Session()
        self.rate_limit_remaining = 100
        self.rate_limit_reset = datetime.now()
    
    @abstractmethod
    async def search(self, query: str, max_results: int = 10) -> List[SearchResult]:
        """Search for content"""
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name"""
        pass
    
    def can_search(self) -> bool:
        """Check if provider can handle a search request"""
        if datetime.now() < self.rate_limit_reset and self.rate_limit_remaining <= 0:
            return False
        return True

class DuckDuckGoProvider(BaseSearchProvider):
    """Keyless DuckDuckGo search provider using HTML scraping"""
    
    def __init__(self):
        super().__init__(api_key="")
        
    @property
    def name(self) -> str:
        return "DuckDuckGo (Keyless)"
        
    async def search(self, query: str, max_results: int = 10) -> List[SearchResult]:
        if not self.can_search():
            return []
            
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
            
            url = "https://html.duckduckgo.com/html/"
            params = {"q": query}
            
            response = await asyncio.to_thread(
                self.session.get,
                url,
                params=params,
                headers=headers,
                timeout=12
            )
            response.raise_for_status()
            
            results = []
            
            # Try BeautifulSoup parsing first
            try:
                soup = BeautifulSoup(response.text, "html.parser")
                for result_div in soup.find_all("div", class_="result")[:max_results]:
                    title_a = result_div.find("a", class_="result__a")
                    snippet_a = result_div.find("a", class_="result__snippet")
                    url_a = result_div.find("a", class_="result__url")
                    
                    if not title_a:
                        continue
                    
                    title = title_a.get_text(strip=True)
                    raw_href = title_a.get("href", "")
                    
                    # DuckDuckGo redirects URLs in the HTML version, extract the target
                    parsed_href = urlparse(raw_href)
                    query_params = parse_qs(parsed_href.query)
                    real_url = query_params.get("uddg", [None])[0]
                    if not real_url:
                        real_url = url_a.get_text(strip=True) if url_a else raw_href
                        
                    snippet = snippet_a.get_text(strip=True) if snippet_a else ""
                    
                    results.append(SearchResult(
                        title=title,
                        url=real_url,
                        snippet=snippet,
                        source="DuckDuckGo",
                        published_date=None,
                        authority_score=6.0,
                        relevance_score=7.0
                    ))
            except Exception as bs_err:
                logger.debug(f"BeautifulSoup parsing failed in DDG provider, using regex: {bs_err}")
            
            # Regex fallback
            if not results:
                link_pattern = re.compile(r'<a\s+class="result__a"\s+href="([^"]+)"[^>]*>(.*?)</a>', re.IGNORECASE)
                snippet_pattern = re.compile(r'<a\s+class="result__snippet"[^>]*>(.*?)</a>', re.IGNORECASE)
                
                matches = link_pattern.findall(response.text)
                snippets = snippet_pattern.findall(response.text)
                
                for idx, (href, title_html) in enumerate(matches[:max_results]):
                    title = re.sub(r'<[^>]+>', '', title_html).strip()
                    
                    parsed_href = urlparse(href)
                    query_params = parse_qs(parsed_href.query)
                    real_url = query_params.get("uddg", [None])[0] or href
                    
                    snippet = ""
                    if idx < len(snippets):
                        snippet = re.sub(r'<[^>]+>', '', snippets[idx]).strip()
                        
                    results.append(SearchResult(
                        title=title,
                        url=real_url,
                        snippet=snippet,
                        source="DuckDuckGo (Regex Fallback)",
                        published_date=None,
                        authority_score=5.5,
                        relevance_score=6.5
                    ))
            
            self.rate_limit_remaining -= 1
            return results
        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {e}")
            return []

class SerpAPIProvider(BaseSearchProvider):
    """SerpAPI Google search provider"""
    
    @property
    def name(self) -> str:
        return "SerpAPI"
    
    async def search(self, query: str, max_results: int = 10) -> List[SearchResult]:
        if not self.api_key or not self.can_search():
            return []
        
        try:
            params = {
                "engine": "google",
                "q": query,
                "api_key": self.api_key,
                "num": min(max_results, 20),
                "gl": "us",
                "hl": "en"
            }
            
            response = await asyncio.to_thread(
                self.session.get,
                "https://serpapi.com/search",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            self.rate_limit_remaining -= 1
            
            results = []
            for item in data.get("organic_results", [])[:max_results]:
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    source="Google (SerpAPI)",
                    published_date=self._parse_date(item.get("date")),
                    authority_score=self._calculate_authority(item.get("link", "")),
                    relevance_score=8.5
                ))
            return results
        except Exception as e:
            logger.error(f"SerpAPI search failed: {e}")
            return []
            
    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except Exception:
            return None
            
    def _calculate_authority(self, url: str) -> float:
        high_authority = [
            'wikipedia.org', 'reuters.com', 'bbc.com', 'cnn.com',
            'nytimes.com', 'wsj.com', 'bloomberg.com', 'techcrunch.com',
            'arxiv.org', 'nature.com', 'science.org', 'mit.edu', 'github.com'
        ]
        for domain in high_authority:
            if domain in url:
                return 9.0
        if any(ext in url for ext in ['.edu', '.gov', '.org']):
            return 8.0
        return 6.0

class TavilyProvider(BaseSearchProvider):
    """Tavily AI-powered search provider"""
    
    @property
    def name(self) -> str:
        return "Tavily"
    
    async def search(self, query: str, max_results: int = 10) -> List[SearchResult]:
        if not self.api_key or not self.can_search():
            return []
        
        try:
            payload = {
                "api_key": self.api_key,
                "query": query,
                "search_depth": "advanced",
                "include_answer": False,
                "max_results": max_results
            }
            
            response = await asyncio.to_thread(
                self.session.post,
                "https://api.tavily.com/search",
                json=payload,
                timeout=15
            )
            response.raise_for_status()
            data = response.json()
            
            self.rate_limit_remaining -= 1
            
            results = []
            for item in data.get("results", [])[:max_results]:
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", ""),
                    source="Tavily AI",
                    published_date=self._parse_date(item.get("published_date")),
                    authority_score=item.get("score", 7.0) * 10.0,  # Normalize score scale
                    relevance_score=9.0
                ))
            return results
        except Exception as e:
            logger.error(f"Tavily search failed: {e}")
            return []
            
    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except Exception:
            return None

class BraveSearchProvider(BaseSearchProvider):
    """Brave Search API provider"""
    
    @property
    def name(self) -> str:
        return "Brave Search"
    
    async def search(self, query: str, max_results: int = 10) -> List[SearchResult]:
        if not self.api_key or not self.can_search():
            return []
        
        try:
            headers = {
                "Accept": "application/json",
                "X-Subscription-Token": self.api_key
            }
            params = {
                "q": query,
                "count": min(max_results, 20),
                "safesearch": "moderate"
            }
            
            response = await asyncio.to_thread(
                self.session.get,
                "https://api.search.brave.com/res/v1/web/search",
                headers=headers,
                params=params,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            self.rate_limit_remaining -= 1
            
            results = []
            for item in data.get("web", {}).get("results", [])[:max_results]:
                results.append(SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    source="Brave Search",
                    published_date=self._parse_age(item.get("age")),
                    authority_score=7.5,
                    relevance_score=8.0
                ))
            return results
        except Exception as e:
            logger.error(f"Brave Search failed: {e}")
            return []
            
    def _parse_age(self, age_str: Optional[str]) -> Optional[datetime]:
        if not age_str:
            return None
        try:
            if "day" in age_str:
                days = int(age_str.split()[0])
                return datetime.now() - timedelta(days=days)
            elif "week" in age_str:
                weeks = int(age_str.split()[0])
                return datetime.now() - timedelta(weeks=weeks)
            elif "hour" in age_str:
                hours = int(age_str.split()[0])
                return datetime.now() - timedelta(hours=hours)
        except Exception:
            pass
        return None

class SearchProviderManager:
    """Manages multiple search providers with intelligent routing and fallback"""
    
    def __init__(self, serp_api_key: str = "", tavily_api_key: str = "", brave_search_api_key: str = ""):
        self.providers: List[BaseSearchProvider] = []
        
        # Add API providers if keys are available
        if serp_api_key:
            self.providers.append(SerpAPIProvider(serp_api_key))
        if tavily_api_key:
            self.providers.append(TavilyProvider(tavily_api_key))
        if brave_search_api_key:
            self.providers.append(BraveSearchProvider(brave_search_api_key))
            
        # Always append keyless DuckDuckGo scraper as final fallback
        self.providers.append(DuckDuckGoProvider())
        self.performance_logs = {}
        
        logger.info(f"Aggregator search initiated with providers: {[p.name for p in self.providers]}")

    async def search(self, query: str, max_results: int = 10) -> List[SearchResult]:
        """Runs search across providers. If primary API keys are available, runs them. Otherwise runs DuckDuckGo."""
        all_results = []
        seen_urls = set()
        
        # Select active providers (run API providers concurrently; if none, or if they fail, use DuckDuckGo)
        active_api_providers = [p for p in self.providers if p.api_key and p.can_search()]
        
        if active_api_providers:
            tasks = [self._search_with_tracking(p, query, max_results) for p in active_api_providers]
            completed = await asyncio.gather(*tasks, return_exceptions=True)
            for res_list in completed:
                if isinstance(res_list, list):
                    for r in res_list:
                        if r.url not in seen_urls:
                            all_results.append(r)
                            seen_urls.add(r.url)
        
        # If API providers returned no results (or none are configured), fall back to keyless DuckDuckGo
        if not all_results:
            ddg_provider = next((p for p in self.providers if isinstance(p, DuckDuckGoProvider)), None)
            if ddg_provider and ddg_provider.can_search():
                ddg_results = await self._search_with_tracking(ddg_provider, query, max_results)
                for r in ddg_results:
                    if r.url not in seen_urls:
                        all_results.append(r)
                        seen_urls.add(r.url)

        # Sort combined results by weighted score: relevance + authority
        all_results.sort(
            key=lambda x: (x.relevance_score * 0.6 + x.authority_score * 0.4),
            reverse=True
        )
        return all_results[:max_results]

    async def _search_with_tracking(self, provider: BaseSearchProvider, query: str, max_results: int) -> List[SearchResult]:
        start = datetime.now()
        try:
            res = await provider.search(query, max_results)
            duration = (datetime.now() - start).total_seconds()
            self.performance_logs[provider.name] = {
                "duration": duration,
                "count": len(res),
                "success": True
            }
            return res
        except Exception as e:
            duration = (datetime.now() - start).total_seconds()
            self.performance_logs[provider.name] = {
                "duration": duration,
                "count": 0,
                "success": False,
                "error": str(e)
            }
            return []
