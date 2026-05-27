import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { SCAR } from '../engines/02_memory/scar.js';

describe('SCAR Repeat Failure Guard Engine 02 (ESM)', () => {
  let tracker;

  beforeEach(() => {
    tracker = new SCAR('test-workspace', 'test-project');
    tracker.clearIncidents();
  });

  afterEach(() => {
    tracker.clearIncidents();
  });

  test('should inject warning STOP block on repeated failure matches', () => {
    // Initial check should not return warning
    let scars = tracker.getRecentScars();
    let prompt = tracker.injectRepeatGuard("Run task", scars);
    expect(prompt).not.toContain("REPEAT FAILURE GUARD");

    // Log first failure
    tracker.recordIncident("timeout", "Step 1", "ollama", 500, "timeout connecting to service");
    scars = tracker.getRecentScars();
    prompt = tracker.injectRepeatGuard("Run task", scars);
    expect(prompt).not.toContain("REPEAT FAILURE GUARD");

    // Log second identical failure
    tracker.recordIncident("timeout", "Step 1", "ollama", 500, "timeout connecting to service");
    scars = tracker.getRecentScars();
    prompt = tracker.injectRepeatGuard("Run task", scars);

    // Should now trigger the guard
    expect(prompt).toContain("REPEAT FAILURE GUARD");
    expect(prompt).toContain("REQUEST TIMEOUT EXPIRED");
  });
});
