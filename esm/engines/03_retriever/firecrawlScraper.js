/**
 * Wrapper for Firecrawl API scraping and structured data extraction.
 * ESModules and native fetch.
 */

export class FirecrawlScraper {
  /**
   * @param {string} [apiKey]
   */
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.FIRECRAWL_API_KEY;
  }

  isConfigured() {
    return !!(this.apiKey && this.apiKey.trim());
  }

  /**
   * Scrapes URL content using Firecrawl.
   * @param {string} url 
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async scrape(url, options = null) {
    if (!this.isConfigured()) {
      console.error("[FirecrawlScraper] API Key is not configured.");
      return { success: false, error: "Firecrawl connector not configured" };
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log(`[FirecrawlScraper] Scraping URL: ${formattedUrl}`);

    const payload = {
      url: formattedUrl,
      formats: options?.formats || ['markdown'],
      onlyMainContent: options?.onlyMainContent ?? true
    };

    if (options) {
      if (options.waitFor) payload.waitFor = options.waitFor;
      if (options.location) payload.location = options.location;
      if (options.jsonOptions) payload.jsonOptions = options.jsonOptions;
    }

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[FirecrawlScraper] API error:`, data);
        return { success: false, error: data.error || `Request failed with status ${response.status}` };
      }

      return { success: true, data: data.data || {} };
    } catch (e) {
      console.error(`[FirecrawlScraper] Scrape request failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * Scraping IndiaMART leads specifically with structured JSON output formats.
   * @param {string} keyword 
   * @param {string} [city] 
   * @returns {Promise<Array>}
   */
  async scrapeIndiamart(keyword, city = null) {
    if (!this.isConfigured()) {
      console.warn("[FirecrawlScraper] Firecrawl not configured. Returning empty leads.");
      return [];
    }

    const searchQuery = city ? `${keyword} ${city}` : keyword;
    const searchUrl = `https://www.indiamart.com/isearch.php?s=${encodeURIComponent(searchQuery)}`;

    console.log(`[FirecrawlScraper] Scrape IndiaMART: "${keyword}" in ${city || 'India'}`);

    const jsonSchema = {
      type: "object",
      properties: {
        leads: {
          type: "array",
          items: {
            type: "object",
            properties: {
              company_name: { type: "string" },
              contact_person: { type: "string" },
              phone: { type: "string" },
              category: { type: "string" }
            },
            required: ["company_name"]
          }
        }
      }
    };

    const options = {
      formats: ["json"],
      jsonOptions: {
        schema: jsonSchema
      }
    };

    const res = await this.scrape(searchUrl, options);
    if (!res.success) {
      console.error(`[FirecrawlScraper] IndiaMART structured scrape failed: ${res.error}`);
      return [];
    }

    const extracted = res.data?.json || {};
    const rawLeads = extracted.leads || [];

    const leads = rawLeads
      .filter(l => l.company_name)
      .map(l => ({
        name: l.contact_person || l.company_name,
        company_name: l.company_name,
        contact_person: l.contact_person || "",
        phone: l.phone || "",
        category: l.category || keyword,
        source: 'IndiaMART',
        stage: 'new'
      }));

    console.log(`[FirecrawlScraper] Scraped ${leads.length} leads successfully from IndiaMART.`);
    return leads;
  }
}
