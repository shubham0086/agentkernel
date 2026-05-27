import pytest
from engines.retriever.search import SearchProviderManager, DuckDuckGoProvider

@pytest.mark.asyncio
async def test_duckduckgo_provider_scrapes():
    # Test standalone DDG provider
    provider = DuckDuckGoProvider()
    results = await provider.search("python programming", max_results=3)
    
    # Assert we get a list
    assert isinstance(results, list)
    
    # If the network request succeeded, verify structured results
    if results:
        first = results[0]
        assert first.title
        assert first.url
        assert first.snippet
        assert first.source == "DuckDuckGo" or "Fallback" in first.source
