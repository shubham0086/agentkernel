"""
Active Input Guardrails and Output Sanitization.
Follows rules from repo-publishing-rules.md.
"""
import re
import logging

logger = logging.getLogger(__name__)

class GuardrailError(Exception):
    """Raised when an active security guardrail check fails."""
    pass

class Guardrails:
    """Provides active input check and output redaction stack."""
    
    def __init__(self):
        # Input prompt injection payload keywords
        self.injection_keywords = [
            r"ignore\s+(?:all\s+)?(?:prior|previous)\s+instructions",
            r"system\s+prompt\s+override",
            r"bypass\s+(?:system|agent)\s+rules",
            r"you\s+are\s+now\s+a\s+(?:different|new)\s+agent",
            r"disregard\s+all\s+previous",
            r"forget\s+what\s+we\s+discussed",
            r"bypass\s+the\s+guardrails",
        ]
        
        # Output secrets regex definitions
        self.secret_patterns = [
            # OpenAI / Anthropic API Key
            (r"sk-[a-zA-Z0-9_\-]{20,}", "[REDACTED_API_KEY]"),
            # Google API Key
            (r"AIzaSy[a-zA-Z0-9_\-]{33}", "[REDACTED_API_KEY]"),
            # JWT Bearer tokens
            (r"eyJhbGciOi[a-zA-Z0-9_\-\.]+", "[REDACTED_JWT_TOKEN]"),
            # General bearer tokens
            (r"bearer\s+[a-zA-Z0-9_\-\.]{20,}", "Bearer [REDACTED_BEARER_TOKEN]"),
            # Database URI connection strings
            (r"(postgresql|mongodb|mysql|redis|sqlite):\/\/[a-zA-Z0-9_\-\.]+:[a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+:\d+\/[a-zA-Z0-9_\-]+", "\\1://[REDACTED_DB_CREDENTIALS]"),
        ]

    def validate_input(self, text: str) -> None:
        """
        Validate input against prompt injection payloads.
        Raises GuardrailError if keyword is matched.
        """
        if not text:
            return
        
        for pattern in self.injection_keywords:
            if re.search(pattern, text, re.IGNORECASE):
                logger.error(f"Guardrail trigger: prompt injection detected matching pattern: {pattern}")
                raise GuardrailError(f"Security Policy Blocked Request: Injection pattern matched.")

    def sanitize_output(self, text: str) -> str:
        """
        Sanitize response text by redacting sensitive keys and connection strings.
        """
        if not text:
            return ""
        
        sanitized = text
        for pattern, replacement in self.secret_patterns:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
            
        return sanitized
