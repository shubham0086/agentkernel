/**
 * Circuit Breaker pattern and Exponential Retry.
 * ESModules.
 */

export class CircuitBreaker {
  constructor(failureThreshold = 3, recoveryTimeout = 60, expectedException = Error) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.expectedException = expectedException;

    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async call(func, ...args) {
    if (this.state === 'OPEN') {
      if (this._shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(`Circuit breaker OPEN - too many failures. Try again after ${this.recoveryTimeout}s`);
      }
    }

    try {
      const result = await func(...args);
      this._onSuccess();
      return result;
    } catch (e) {
      if (e instanceof this.expectedException) {
        this._onFailure();
      }
      throw e;
    }
  }

  _shouldAttemptReset() {
    return (
      this.lastFailureTime &&
      (Date.now() - this.lastFailureTime) / 1000 > this.recoveryTimeout
    );
  }

  _onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker] State transitioned to OPEN after ${this.failureCount} consecutive failures.`);
    }
  }
}

export async function asyncTimeout(func, timeoutSeconds = 30, ...args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const result = await func({ signal: controller.signal }, ...args);
    clearTimeout(timer);
    return result;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error(`Operation timed out after exceeding ${timeoutSeconds}s ceiling limit.`);
    }
    throw e;
  }
}

export class RetryWithBackoff {
  constructor(maxRetries = 3, baseDelay = 1.0) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async execute(func, ...args) {
    let lastException = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await func(...args);
      } catch (e) {
        lastException = e;
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.warn(`[Retry] Attempt ${attempt + 1} failed. Re-trying in ${delay.toFixed(1)}s. Error: ${e.message}`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        } else {
          console.error(`[Retry] All ${this.maxRetries + 1} attempts exhausted. Operation aborted.`);
        }
      }
    }
    throw lastException;
  }
}

const PROVIDER_CIRCUIT_BREAKERS = new Map();

export function getProviderCircuitBreaker(providerName) {
  if (!PROVIDER_CIRCUIT_BREAKERS.has(providerName)) {
    PROVIDER_CIRCUIT_BREAKERS.set(providerName, new CircuitBreaker(3, 60));
  }
  return PROVIDER_CIRCUIT_BREAKERS.get(providerName);
}

export async function safeProviderCall(providerName, func, ...args) {
  const breaker = getProviderCircuitBreaker(providerName);
  try {
    return await breaker.call(func, ...args);
  } catch (e) {
    console.error(`[CircuitBreaker] Call on provider ${providerName} failed: ${e.message}`);
    throw e;
  }
}

export async function asyncSafeProviderCall(providerName, func, ...args) {
  const breaker = getProviderCircuitBreaker(providerName);
  try {
    return await asyncTimeout(
      async () => breaker.call(func, ...args),
      30
    );
  } catch (e) {
    console.error(`[CircuitBreaker] Async timeout call on provider ${providerName} failed: ${e.message}`);
    throw e;
  }
}
