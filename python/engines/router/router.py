"""
Multi-provider LLM router with fallback chains, timeouts, and session circuit breakers.
Ported from Agentic-SDLC BaseAgent.js and ace-engine services/provider_router.py.
Upgraded with guardrails, token optimizer, and cost metrics tracking.
"""
import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional, Set
import httpx

from .guardrails import Guardrails
from .token_optimizer import TokenOptimizer

logger = logging.getLogger(__name__)

# Global session-level circuit breaker: providers that have failed completely
_down_providers: Set[str] = set()

# Model pricing structures (per 1M tokens)
MODEL_PRICING = {
    "openai": {
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4o": {"input": 2.50, "output": 10.00},
    },
    "anthropic": {
        "claude-3-5-haiku-20241022": {"input": 0.80, "output": 4.00},
        "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    },
    "gemini": {
        "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
        "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
        "gemini-2.0-flash": {"input": 0.075, "output": 0.30},
    },
    "ollama": {
        "qwen2.5-coder:7b": {"input": 0.0, "output": 0.0},
    }
}

class Router:
    """Manages LLM completions across multiple providers with failover chains and circuit breakers."""
    
    def __init__(
        self,
        openai_key: Optional[str] = None,
        anthropic_key: Optional[str] = None,
        gemini_key: Optional[str] = None,
        ollama_url: str = "http://localhost:11434",
        default_provider: str = "ollama"
    ):
        self.keys = {
            "openai": openai_key,
            "anthropic": anthropic_key,
            "gemini": gemini_key,
        }
        self.ollama_url = ollama_url
        self.default_provider = default_provider
        self.guardrails = Guardrails()
        self.token_optimizer = TokenOptimizer()
        
        # Configure fallback order per task class
        self.provider_chains = {
            "code": ["openai", "gemini", "anthropic", "ollama"],
            "ui": ["gemini", "openai", "ollama"],
            "simple": ["openai", "gemini", "ollama"],
            "content": ["gemini", "openai", "anthropic", "ollama"]
        }
        
        # Models per provider in order of choice
        self.model_chains = {
            "openai": ["gpt-4o-mini", "gpt-4o"],
            "anthropic": ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
            "gemini": ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"],
            "ollama": ["qwen2.5-coder:7b"]
        }
        
        # Per-provider request timeouts in seconds
        self.timeouts = {
            "openai": 30,
            "anthropic": 45,
            "gemini": 30,
            "ollama": 90,
        }

    def _provider_available(self, provider: str) -> bool:
        """Check if provider keys are present, or falls back to Ollama."""
        if provider in _down_providers:
            return False
        if provider == "ollama":
            return True
        key = self.keys.get(provider)
        return bool(key and key.strip())

    def _wrap_system_prompt(self, provider: str, model: str, system_prompt: str) -> str:
        """Applies model-specific prompt styling to maximize instruction adherence."""
        if not system_prompt:
            return ""
        
        # Gemini: XML tag structure
        if provider == "gemini":
            return f"<role>\n{system_prompt}\n</role>\n<instruction>Respond ONLY with valid JSON. No text outside the JSON block.</instruction>"
        
        # OpenAI & Anthropic: standard JSON suffix
        if "mini" in model or "haiku" in model:
            return f"{system_prompt}\n\nCRITICAL: Output valid JSON only. Do not add markdown or explanations outside the JSON."
            
        return system_prompt

    def _calculate_cost(self, provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
        """Calculates estimated request cost based on token counts."""
        try:
            pricing = MODEL_PRICING.get(provider, {}).get(model)
            if not pricing:
                return 0.0
            
            input_cost = (input_tokens / 1_000_000) * pricing["input"]
            output_cost = (output_tokens / 1_000_000) * pricing["output"]
            return input_cost + output_cost
        except Exception:
            return 0.0

    async def chat(
        self,
        prompt: str,
        system_prompt: str = "",
        task_class: str = "content",
        temperature: float = 0.3,
        max_tokens: int = 4096,
        budget: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Executes chat completion with fallback chains, active guardrails, and circuit breakers.
        Returns detailed dict metadata: {"content", "provider", "model", "cost"}.
        """
        # 1. Active Input Guardrail Check
        self.guardrails.validate_input(prompt)
        self.guardrails.validate_input(system_prompt)
        
        # 2. Token Optimization Pruning
        optimized_prompt = self.token_optimizer.optimize_prompt(prompt)
        optimized_system = self.token_optimizer.optimize_prompt(system_prompt)
        
        # Walk active chain
        chain = self.provider_chains.get(task_class, self.provider_chains["content"])
        usable_providers = [p for p in chain if self._provider_available(p)]
        
        if not usable_providers:
            # Fallback to Ollama if no keys configured
            usable_providers = ["ollama"]
            
        failures = []
        for provider in usable_providers:
            models = self.model_chains.get(provider, [])
            
            # If budget constraint, filter out models exceeding cost
            if budget is not None:
                # Filter models where base pricing exceeds threshold
                filtered_models = []
                for m in models:
                    est_in = self.token_optimizer.estimate_tokens(optimized_prompt)
                    est_out = max_tokens // 4
                    est_cost = self._calculate_cost(provider, m, est_in, est_out)
                    if est_cost <= budget:
                        filtered_models.append(m)
                models = filtered_models
                if not models:
                    logger.warning(f"No models for provider {provider} fit in budget {budget}")
                    continue
            
            provider_succeeded = False
            for model in models:
                attempts = 2
                for attempt in range(attempts):
                    try:
                        logger.info(f"Routing request -> {provider.upper()} ({model}), attempt {attempt + 1}")
                        wrapped_system = self._wrap_system_prompt(provider, model, optimized_system)
                        
                        start_time = time.time()
                        content, in_tokens, out_tokens = await self._dispatch_call(
                            provider, model, optimized_prompt, wrapped_system, temperature, max_tokens
                        )
                        elapsed = time.time() - start_time
                        
                        # Apply Output Sanitization
                        sanitized_content = self.guardrails.sanitize_output(content)
                        
                        cost = self._calculate_cost(provider, model, in_tokens, out_tokens)
                        provider_succeeded = True
                        
                        logger.info(f"✓ {provider.upper()} ({model}) call succeeded in {elapsed:.2f}s")
                        return {
                            "content": sanitized_content,
                            "provider": provider,
                            "model": model,
                            "cost": cost,
                            "latency": elapsed
                        }
                    except Exception as e:
                        msg = str(e)[:150]
                        failures.append(f"{provider}/{model}: {msg}")
                        logger.warning(f"{provider}/{model} failed on attempt {attempt + 1}: {msg}")
                        if attempt + 1 < attempts:
                            await asyncio.sleep(2.0)
                            
            if not provider_succeeded:
                _down_providers.add(provider)
                logger.error(f"CIRCUIT OPENED: Provider {provider} failed all models and is marked down.")
                
        raise RuntimeError(f"All routed providers in {task_class} chain failed: {'; '.join(failures)}")

    async def _dispatch_call(
        self,
        provider: str,
        model: str,
        prompt: str,
        system_prompt: str,
        temperature: float,
        max_tokens: int
    ) -> tuple:
        """Dispatches request directly to HTTP endpoint."""
        timeout = self.timeouts.get(provider, 30)
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            if provider == "openai":
                return await self._call_openai(client, model, prompt, system_prompt, temperature, max_tokens)
            elif provider == "anthropic":
                return await self._call_anthropic(client, model, prompt, system_prompt, temperature, max_tokens)
            elif provider == "gemini":
                return await self._call_gemini(client, model, prompt, system_prompt, temperature, max_tokens)
            elif provider == "ollama":
                return await self._call_ollama(client, model, prompt, system_prompt, temperature)
            else:
                raise ValueError(f"Unknown provider: {provider}")

    async def _call_openai(self, client: httpx.AsyncClient, model: str, prompt: str, system_prompt: str, temp: float, max_tok: int) -> tuple:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.keys['openai']}",
            "Content-Type": "application/json"
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temp,
            "max_tokens": max_tok
        }
        
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        
        content = data["choices"][0]["message"]["content"]
        in_tok = data["usage"]["prompt_tokens"]
        out_tok = data["usage"]["completion_tokens"]
        return content, in_tok, out_tok

    async def _call_anthropic(self, client: httpx.AsyncClient, model: str, prompt: str, system_prompt: str, temp: float, max_tok: int) -> tuple:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.keys["anthropic"],
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }
        messages = [{"role": "user", "content": prompt}]
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temp,
            "max_tokens": max_tok
        }
        if system_prompt:
            payload["system"] = system_prompt
            
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        
        content = data["content"][0]["text"]
        in_tok = data["usage"]["input_tokens"]
        out_tok = data["usage"]["output_tokens"]
        return content, in_tok, out_tok

    async def _call_gemini(self, client: httpx.AsyncClient, model: str, prompt: str, system_prompt: str, temp: float, max_tok: int) -> tuple:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.keys['gemini']}"
        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": system_prompt}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temp,
                "maxOutputTokens": max_tok
            }
        }
        
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        # Estimate tokens as API doesn't return counts consistently in standard output
        in_tok = len(prompt) // 4
        out_tok = len(content) // 4
        return content, in_tok, out_tok

    async def _call_ollama(self, client: httpx.AsyncClient, model: str, prompt: str, system_prompt: str, temp: float) -> tuple:
        url = f"{self.ollama_url}/api/chat"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temp}
        }
        
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        
        content = data["message"]["content"]
        in_tok = data.get("prompt_eval_count", len(prompt) // 4)
        out_tok = data.get("eval_count", len(content) // 4)
        return content, in_tok, out_tok

def reset_circuit_breakers():
    """Resets the circuit breakers for all providers."""
    _down_providers.clear()
