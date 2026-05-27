import { describe, test, expect } from 'vitest';
import { DuckDuckGoProvider } from '../engines/03_retriever/search.js';

describe('Search Aggregator Engine 03 (ESM)', () => {
  test('should execute keyless DuckDuckGo scraping query', async () => {
    const provider = new DuckDuckGoProvider();
    const results = await provider.search("javascript standard library", 3);

    expect(Array.isArray(results)).toBe(true);
    
    if (results.length > 0) {
      const match = results[0];
      expect(match.title).toBeDefined();
      expect(match.url).toBeDefined();
      expect(match.snippet).toBeDefined();
    }
  });
});
