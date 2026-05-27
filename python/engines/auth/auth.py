import os
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

# Dynamic import of PyJWT to prevent crash if library isn't preinstalled
try:
    import jwt
    JWT_AVAILABLE = True
except ImportError:
    JWT_AVAILABLE = False

logger = logging.getLogger("equilibrium.auth")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def hash_password(password: str) -> str:
    """Hashes password using pbkdf2_hmac with random salt."""
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + ":" + key.hex()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies plain password against hashed value."""
    try:
        salt_hex, key_hex = hashed_password.split(":")
        salt = bytes.fromhex(salt_hex)
        key = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt, 100000)
        return key.hex() == key_hex
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Encodes a JWT payload with an expiry threshold."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": int(expire.timestamp())})
    
    if JWT_AVAILABLE:
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    else:
        # Fallback signature scheme: simple base64 token generator for keyless environments
        import base64
        import hmac
        import json
        header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
        payload = base64.urlsafe_b64encode(json.dumps(to_encode).encode()).decode().rstrip("=")
        signature = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
        sig_encoded = base64.urlsafe_b64encode(signature).decode().rstrip("=")
        return f"{header}.{payload}.{sig_encoded}"

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token signature."""
    if JWT_AVAILABLE:
        try:
            return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception as e:
            logger.warning(f"JWT signature verification failed: {e}")
            return None
    else:
        # Verify fallback base64 token
        import base64
        import hmac
        import json
        try:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            header, payload, sig = parts
            expected_sig = hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
            sig_bytes = base64.urlsafe_b64decode(sig + "=" * (4 - len(sig) % 4))
            if not hmac.compare_digest(expected_sig, sig_bytes):
                return None
                
            payload_data = json.loads(base64.urlsafe_b64decode(payload + "=" * (4 - len(payload) % 4)).decode())
            if payload_data.get("exp", 0) < datetime.now(timezone.utc).timestamp():
                return None  # Expired
            return payload_data
        except Exception:
            return None
