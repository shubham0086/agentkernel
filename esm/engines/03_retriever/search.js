/**
 * Standardized search result format and search aggregator.
 * Uses native fetch and ESModules.
 */

export class SearchResult {
  constructor({ title, url, snippet, source, publishedDate = null, authorityScore = 0.0, relevanceScore = 0.0 }) {
    this.title = title;
    this.url = url;
    this.snippet = snippet;
    this.source = source;
    this.publishedDate = publishedDate;
    this.authorityScore = authorityScore;
    this.relevanceScore = relevanceScore;
  }

  toObject() {
    return {
      title: this.title,
      url: this.url,
      snippet: this.snippet,
      source: this.source,
      publishedDate: this.publishedDate,
      authorityScore: this.authorityScore,
      relevanceScore: this.relevanceScore
    };
  }
}

export class BaseSearchProvider {
  constructor(apiKey = "") {
    this.apiKey = apiKey;
    this.rateLimitRemaining = 100;
    this.rateLimitReset = new Date();
  }

  canSearch() {
    if (new Date() < this.rateLimitReset && this.rateLimitRemaining <= 0) {
      return false;
    }
    return true;
  }
}

export class DuckDuckGoProvider extends BaseSearchProvider {
  constructor() {
    super("");
  }

  get name() {
    return "DuckDuckGo (Keyless)";
  }

  async search(query, maxResults = 10) {
    if (!this.canSearch()) return [];

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo responded with status ${response.status}`);
      }

      const html = await response.text();
      const results = [];

      // Regex matches
      const linkRegex = /<a\s+class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex = /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

      const cleanHtml = (str) => str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

      let linkMatch;
      const links = [];
      while ((linkMatch = linkRegex.exec(html)) !== null) {
        links.push({
          rawHref: linkMatch[1],
          title: cleanHtml(linkMatch[2])
        });
      }

      let snippetMatch;
      const snippets = [];
      while ((snippetMatch = snippetRegex.exec(html)) !== null) {
        snippets.push(cleanHtml(snippetMatch[1]));
      }

      for (let i = 0; i < Math.min(links.length, maxResults); i++) {
        const link = links[i];
        let realUrl = link.rawHref;

        // Parse redirect target if possible
        if (realUrl.includes("uddg=")) {
          try {
            const uddg = realUrl.split("uddg=")[1].split("&")[0];
            realUrl = decodeURIComponent(uddg);
          } catch (_) {}
        }

        results.push(new SearchResult({
          title: link.title,
          url: realUrl,
          snippet: snippets[i] || "",
          source: "DuckDuckGo",
          authorityScore: 6.0,
          relevanceScore: 7.0
        }));
      }

      this.rateLimitRemaining -= 1;
      return results;
    } catch (e) {
      console.error(`[DuckDuckGoProvider] Search failed: ${e.message}`);
      return [];
    }
  }
}

export class SerpAPIProvider extends BaseSearchProvider {
  get name() {
    return "SerpAPI";
  }

  async search(query, maxResults = 10) {
    if (!this.apiKey || !this.canSearch()) return [];

    try {
      const params = new URLSearchParams({
        engine: "google",
        q: query,
        api_key: this.apiKey,
        num: Math.min(maxResults, 20),
        gl: "us",
        hl: "en"
      });
      
      const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`SerpAPI status: ${response.status}`);
      }

      const data = await response.json();
      this.rateLimitRemaining -= 1;

      return (data.organic_results || []).slice(0, maxResults).map(item => new SearchResult({
        title: item.title || "",
        url: item.link || "",
        snippet: item.snippet || "",
        source: "Google (SerpAPI)",
        publishedDate: item.date || null,
        authorityScore: this._calculateAuthority(item.link || ""),
        relevanceScore: 8.5
      }));
    } catch (e) {
      console.error(`[SerpAPIProvider] Search failed: ${e.message}`);
      return [];
    }
  }

  _calculateAuthority(url) {
    const highAuth = ['wikipedia.org', 'reuters.com', 'bbc.com', 'cnn.com', 'nytimes.com', 'wsj.com', 'bloomberg.com', 'techcrunch.com'];
    for (const d of highAuth) {
      if (url.includes(d)) return 9.0;
    }
    if (url.includes('.edu') || url.includes('.gov') || url.includes('.org')) return 8.0;
    return 6.0;
  }
}

export class TavilyProvider extends BaseSearchProvider {
  get name() {
    return "Tavily";
  }

  async search(query, maxResults = 10) {
    if (!this.apiKey || !this.canSearch()) return [];

    try {
      const payload = {
        api_key: this.apiKey,
        query: query,
        search_depth: "advanced",
        include_answer: false,
        max_results: maxResults
      };

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Tavily status: ${response.status}`);
      }

      const data = await response.json();
      this.rateLimitRemaining -= 1;

      return (data.results || []).slice(0, maxResults).map(item => new SearchResult({
        title: item.title || "",
        url: item.url || "",
        snippet: item.content || "",
        source: "Tavily AI",
        publishedDate: item.published_date || null,
        authorityScore: (item.score || 0.7) * 10.0,
        relevanceScore: 9.0
      }));
    } catch (e) {
      console.error(`[TavilyProvider] Search failed: ${e.message}`);
      return [];
    }
  }
}

export class BraveSearchProvider extends BaseSearchProvider {
  get name() {
    return "Brave Search";
  }

  async search(query, maxResults = 10) {
    if (!this.apiKey || !this.canSearch()) return [];

    try {
      const params = new URLSearchParams({
        q: query,
        count: Math.min(maxResults, 20),
        safesearch: "moderate"
      });

      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Brave Search status: ${response.status}`);
      }

      const data = await response.json();
      this.rateLimitRemaining -= 1;

      return (data.web?.results || []).slice(0, maxResults).map(item => new SearchResult({
        title: item.title || "",
        url: item.url || "",
        snippet: item.description || "",
        source: "Brave Search",
        publishedDate: item.age || null,
        authorityScore: 7.5,
        relevanceScore: 8.0
      }));
    } catch (e) {
      console.error(`[BraveSearchProvider] Search failed: ${e.message}`);
      return [];
    }
  }
}

export class SearchProviderManager {
  constructor({ serpApiKey = "", tavilyApiKey = "", braveSearchApiKey = "" } = {}) {
    this.providers = [];
    if (serpApiKey) this.providers.push(new SerpAPIProvider(serpApiKey));
    if (tavilyApiKey) this.providers.push(new TavilyProvider(tavilyApiKey));
    if (braveSearchApiKey) this.providers.push(new BraveSearchProvider(braveSearchApiKey));

    // Keyless DuckDuckGo scraper fallback is always appended
    this.providers.push(new DuckDuckGoProvider());
    this.performanceLogs = {};
  }

  async search(query, maxResults = 10) {
    const allResults = [];
    const seenUrls = new Set();

    // Select active providers
    const activeApiProviders = this.providers.filter(p => p.apiKey && p.canSearch());

    if (activeApiProviders.length > 0) {
      const promises = activeApiProviders.map(p => this._searchWithTracking(p, query, maxResults));
      const completed = await Promise.all(promises);
      for (const resList of completed) {
        for (const r of resList) {
          if (!seenUrls.has(r.url)) {
            allResults.push(r);
            seenUrls.add(r.url);
          }
        }
      }
    }

    // Fallback to DuckDuckGo if no results found
    if (allResults.length === 0) {
      const ddgProvider = this.providers.find(p => p instanceof DuckDuckGoProvider);
      if (ddgProvider && ddgProvider.canSearch()) {
        const ddgResults = await this._searchWithTracking(ddgProvider, query, maxResults);
        for (const r of ddgResults) {
          if (!seenUrls.has(r.url)) {
            allResults.push(r);
            seenUrls.add(r.url);
          }
        }
      }
    }

    // Sort combined results by relevance and authority
    allResults.sort((a, b) => (b.relevanceScore * 0.6 + b.authorityScore * 0.4) - (a.relevanceScore * 0.6 + a.authorityScore * 0.4));
    return allResults.slice(0, maxResults);
  }

  async _searchWithTracking(provider, query, maxResults) {
    const start = Date.now();
    try {
      const res = await provider.search(query, maxResults);
      const duration = (Date.now() - start) / 1000;
      this.performanceLogs[provider.name] = { duration, count: res.length, success: true };
      return res;
    } catch (e) {
      const duration = (Date.now() - start) / 1000;
      this.performanceLogs[provider.name] = { duration, count: 0, success: false, error: e.message };
      return [];
    }
  }
}
