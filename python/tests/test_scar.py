import os
import pytest
from engines.memory.scar import SCAR

def test_scar_warning_injects_after_repeats():
    db_path = "data/test_scars.db"
    # Remove existing test DB if present
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
            
    tracker = SCAR(db_path=db_path)
    
    # Initially no scars, repeat guard should not inject warning block
    scars = tracker.get_recent_scars()
    prompt = tracker.inject_repeat_guard("Run compile", scars)
    assert "REPEAT FAILURE GUARD" not in prompt
    
    # Record first incident
    tracker.record_incident("syntax", "Step 1", "ollama", 500, "syntax check failed: unexpected token")
    scars = tracker.get_recent_scars()
    prompt = tracker.inject_repeat_guard("Run compile", scars)
    assert "REPEAT FAILURE GUARD" not in prompt
    
    # Record second identical incident
    tracker.record_incident("syntax", "Step 1", "ollama", 500, "syntax check failed: unexpected token")
    scars = tracker.get_recent_scars()
    prompt = tracker.inject_repeat_guard("Run compile", scars)
    
    # It should now inject the warning block
    assert "REPEAT FAILURE GUARD" in prompt
    assert "SYNTAX COMPLIANCE ERROR" in prompt
    
    # Clean up test DB
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass
