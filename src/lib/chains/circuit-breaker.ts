/**
 * Circuit breaker for external RPC calls.
 * States: CLOSED (normal) → OPEN (failing, reject fast) → HALF_OPEN (test one request).
 */

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  lastFailure: number;
}

const circuits = new Map<string, CircuitEntry>();

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;

function getCircuit(key: string): CircuitEntry {
  if (!circuits.has(key)) {
    circuits.set(key, { state: "closed", failures: 0, lastFailure: 0 });
  }
  return circuits.get(key)!;
}

export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: CircuitBreakerOptions,
): Promise<T> {
  const threshold = opts?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const resetTimeout = opts?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
  const circuit = getCircuit(key);

  if (circuit.state === "open") {
    if (Date.now() - circuit.lastFailure >= resetTimeout) {
      circuit.state = "half_open";
    } else {
      throw new Error(`Circuit breaker OPEN for ${key}`);
    }
  }

  try {
    const result = await fn();
    // Success — reset
    circuit.state = "closed";
    circuit.failures = 0;
    return result;
  } catch (err) {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= threshold) {
      circuit.state = "open";
    }
    throw err;
  }
}

/** Reset a circuit (useful for testing). */
export function resetCircuit(key: string): void {
  circuits.delete(key);
}

/** Get current state of a circuit (useful for health checks). */
export function getCircuitState(key: string): CircuitState {
  return getCircuit(key).state;
}
