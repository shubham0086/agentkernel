import os
import logging
from typing import Dict, Any, Optional

# Import the custom Router
from ..router.router import Router

logger = logging.getLogger("equilibrium.chaipitch")

class ChaiPitchEngine:
    """
    ChaiPitch Hinglish (Hindi + English) WhatsApp AI Outreach generator.
    Tailors messages specifically for Indian D2C brands, using custom LLM router.
    """
    
    def __init__(self, router: Optional[Router] = None):
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

    async def generate_pitch(self, lead_data: Dict[str, Any]) -> str:
        """
        Generates a personalized WhatsApp outreach message in HINGLISH.
        Uses the fallback chains in the custom Router (Gemini -> OpenAI -> Anthropic -> Ollama).
        """
        company = lead_data.get("company_name", "your brand")
        person = lead_data.get("contact_person", "there")
        category = lead_data.get("category", "D2C")
        additional_context = lead_data.get("additional_context", "")
        
        prompt = f"""
        You are a professional growth consultant for Indian D2C brands. 
        Write a warm, high-converting WhatsApp outreach message in HINGLISH (Hindi + English) for the following lead:
        
        Lead Name: {person}
        Company: {company}
        Category: {category}
        Additional Context: {additional_context}
        
        Guidelines:
        - Start with a warm 'Namaste' or 'Hey'.
        - Use 'Ji' for respect when referencing names (e.g., Rahul ji).
        - Compliment their brand (e.g., "Aapka {company} ka kaam kaafi badhiya lag raha hai").
        - Keep it short, conversational, and direct.
        - End with a simple question to prompt response.
        - Do not use corporate speak; write like you're talking to a friend.
        
        Example output format:
        "Hey Rahul ji, Namaste! Ayurveda Essentials ka content kaafi solid lag raha hai. I love how you guys are handling Organic Wellness. Humne aapke brand ke liye ek special marketing plan banaya hai. Small chat ke liye free hain aap? 💬"
        """
        
        system_prompt = "You are a growth consultant writing natural, engaging Hinglish copy. Do not include quotes or surrounding markers."
        
        try:
            # Route to simple/content fallback chain
            response = await self.router.chat(
                prompt=prompt,
                system_prompt=system_prompt,
                task_class="content",
                temperature=0.7,
                max_tokens=300
            )
            pitch = response.get("content", "").strip()
            
            # Clean up potential markdown formatting or quotes
            if pitch.startswith('"') and pitch.endswith('"'):
                pitch = pitch[1:-1]
            return pitch.strip()
        except Exception as e:
            logger.error(f"Failed to generate outreach pitch: {e}")
            # Dynamic recovery default
            greeting = f"Hey {person} ji" if person != "there" else "Hey there"
            return f"{greeting}! I came across {company} and really loved your work in {category}. We compiled a custom audit showing how to scale your outreach. Let me know if we can chat for 5 mins? ☕"
