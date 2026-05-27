import time
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger("equilibrium.breaker")

class CircuitBreaker:
    """Circuit breaker pattern implementation to prevent infinite loops and cascade API failures."""
    
    def __init__(self, failure_threshold: int = 3, recovery_timeout: int = 60, expected_exception: Exception = Exception):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception
        
        self.failure_count = 0
        self.last_failure_time = None
        self.state = 'CLOSED'  # CLOSED, OPEN, HALF_OPEN
        
    def call(self, func, *args, **kwargs):
        """Execute sync function with circuit breaker protection."""
        if self.state == 'OPEN':
            if self._should_attempt_reset():
                self.state = 'HALF_OPEN'
            else:
                raise RuntimeError(f"Circuit breaker OPEN - too many failures. Try again after {self.recovery_timeout}s")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except self.expected_exception:
            self._on_failure()
            raise
    
    async def acall(self, func, *args, **kwargs):
        """Execute async function with circuit breaker protection."""
        if self.state == 'OPEN':
            if self._should_attempt_reset():
                self.state = 'HALF_OPEN'
            else:
                raise RuntimeError(f"Circuit breaker OPEN - too many failures. Try again after {self.recovery_timeout}s")
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except self.expected_exception:
            self._on_failure()
            raise
            
    def _should_attempt_reset(self) -> bool:
        return (
            self.last_failure_time is not None and 
            datetime.now() - self.last_failure_time > timedelta(seconds=self.recovery_timeout)
        )
        
    def _on_success(self):
        self.failure_count = 0
        self.state = 'CLOSED'
        
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = datetime.now()
        if self.failure_count >= self.failure_threshold:
            self.state = 'OPEN'
            logger.warning(f"Circuit breaker transitions to OPEN state after {self.failure_count} failures.")

async def async_timeout(func, timeout_seconds: int = 30, *args, **kwargs):
    """Executes an async callable with a maximum timeout threshold."""
    try:
        if asyncio.iscoroutinefunction(func):
            return await asyncio.wait_for(func(*args, **kwargs), timeout=timeout_seconds)
        else:
            # Run blocking function in loop thread pool executor
            return await asyncio.wait_for(
                asyncio.get_running_loop().run_in_executor(None, func, *args, **kwargs),
                timeout=timeout_seconds
            )
    except asyncio.TimeoutError:
        raise TimeoutError(f"Operation timed out after exceeding {timeout_seconds} seconds threshold.")

class OperationTimeout:
    """Context manager wrapper tracking and enforcing maximum time ceilings."""
    
    def __init__(self, timeout_seconds: int = 30):
        self.timeout_seconds = timeout_seconds
        self.start_time = None
        
    def __enter__(self):
        self.start_time = time.time()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass
        
    def check_timeout(self):
        if self.start_time and (time.time() - self.start_time) > self.timeout_seconds:
            raise TimeoutError(f"Execution context exceeded timeout constraint of {self.timeout_seconds}s.")

class RetryWithBackoff:
    """Executes operations with exponential sleep backoff retry schedules."""
    
    def __init__(self, max_retries: int = 3, base_delay: float = 1.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        
    def execute(self, func, *args, **kwargs):
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries:
                    delay = self.base_delay * (2 ** attempt)
                    logger.warning(f"Attempt {attempt + 1} failed. Re-trying in {delay:.1f}s. Error: {e}")
                    time.sleep(delay)
                else:
                    logger.error(f"All {self.max_retries + 1} attempts exhausted. Operation aborted.")
        raise last_exception

    async def aexecute(self, func, *args, **kwargs):
        """Async execution matching exponential retry schema."""
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                if asyncio.iscoroutinefunction(func):
                    return await func(*args, **kwargs)
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries:
                    delay = self.base_delay * (2 ** attempt)
                    logger.warning(f"Attempt {attempt + 1} failed. Re-trying in {delay:.1f}s. Error: {e}")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"All {self.max_retries + 1} attempts exhausted. Async operation aborted.")
        raise last_exception

PROVIDER_CIRCUIT_BREAKERS: Dict[str, CircuitBreaker] = {}

def get_provider_circuit_breaker(provider_name: str) -> CircuitBreaker:
    if provider_name not in PROVIDER_CIRCUIT_BREAKERS:
        PROVIDER_CIRCUIT_BREAKERS[provider_name] = CircuitBreaker(failure_threshold=3, recovery_timeout=60)
    return PROVIDER_CIRCUIT_BREAKERS[provider_name]

def safe_provider_call(provider_name: str, func, *args, **kwargs):
    breaker = get_provider_circuit_breaker(provider_name)
    try:
        return breaker.call(func, *args, **kwargs)
    except Exception as e:
        logger.error(f"Sync call on provider {provider_name} failed: {e}")
        raise

async def async_safe_provider_call(provider_name: str, func, *args, **kwargs):
    breaker = get_provider_circuit_breaker(provider_name)
    try:
        return await async_timeout(
            lambda: breaker.acall(func, *args, **kwargs),
            timeout_seconds=30
        )
    except Exception as e:
        logger.error(f"Async call on provider {provider_name} failed: {e}")
        raise
