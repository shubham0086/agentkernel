"""
Token optimizer for prompt compression and token cost savings.
Ported from production AIOps utils/token_optimizer.py.
"""
import re
import logging

logger = logging.getLogger(__name__)

class TokenOptimizer:
    """Optimizes prompts for token efficiency while maintaining quality."""
    
    def __init__(self):
        self.optimization_rules = [
            # Remove excessive whitespace
            (r'\s+', ' '),
            # Remove redundant words
            (r'\b(very|quite|rather|somewhat|pretty)\s+', ''),
            # Simplify common phrases
            (r'in order to', 'to'),
            (r'due to the fact that', 'because'),
            (r'a lot of', 'many'),
            (r'at this point in time', 'now'),
            # Remove filler words in context
            (r'\b(basically|essentially|actually|literally)\s+', ''),
        ]
    
    def optimize_prompt(self, prompt: str) -> str:
        """Optimize a prompt for token efficiency."""
        try:
            if not prompt:
                return ""
            optimized = prompt.strip()
            
            # Apply optimization rules
            for pattern, replacement in self.optimization_rules:
                optimized = re.sub(pattern, replacement, optimized, flags=re.IGNORECASE)
            
            # Clean up multiple spaces
            optimized = re.sub(r'\s+', ' ', optimized)
            
            # Remove trailing/leading whitespace
            optimized = optimized.strip()
            
            # Log optimization if significant reduction
            original_length = len(prompt)
            optimized_length = len(optimized)
            
            if original_length > optimized_length:
                reduction = ((original_length - optimized_length) / original_length) * 100
                logger.debug(f"Prompt optimized: {reduction:.1f}% reduction ({original_length} -> {optimized_length} chars)")
            
            return optimized
            
        except Exception as e:
            logger.error(f"Prompt optimization failed: {e}")
            return prompt  # Return original on error
    
    def estimate_tokens(self, text: str) -> int:
        """Rough estimate of tokens (1 token ≈ 4 characters for English)."""
        return len(text) // 4
