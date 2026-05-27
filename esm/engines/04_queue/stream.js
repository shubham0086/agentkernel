/**
 * Server-Sent Events (SSE) streaming utilities.
 * ESModules.
 */

export class SSEStream {
  constructor(runId) {
    this.runId = runId;
    this.events = [];
    this.closed = false;
    this.startTime = Date.now() / 1000;
    this._listeners = [];
  }

  async sendEvent(eventType, data) {
    if (this.closed) return;
    const event = {
      event: eventType,
      data,
      timestamp: Date.now() / 1000
    };
    this.events.push(event);
    for (const listener of this._listeners) {
      listener(event);
    }
  }

  formatEvent(eventType, data) {
    const dataWithMeta = {
      ...data,
      run_id: this.runId,
      timestamp: Date.now() / 1000
    };
    return `event: ${eventType}\ndata: ${JSON.stringify(dataWithMeta)}\n\n`;
  }

  close() {
    this.closed = true;
    for (const listener of this._listeners) {
      listener({ event: 'end', data: { status: 'done' } });
    }
    this._listeners = [];
  }

  /**
   * Node-friendly HTTP stream piped generator.
   */
  pipe(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent Nginx buffering
    });

    const heartbeatTimer = setInterval(() => {
      res.write(this.formatEvent('heartbeat', { status: 'alive' }));
    }, 15000);

    const listener = (event) => {
      res.write(this.formatEvent(event.event, event.data));
    };

    this._listeners.push(listener);

    // Initial flush of existing events
    for (const event of this.events) {
      res.write(this.formatEvent(event.event, event.data));
    }

    res.on('close', () => {
      clearInterval(heartbeatTimer);
      this.close();
    });
  }
}

export class AgentRunStore {
  constructor() {
    this.runs = new Map();
    this.streams = new Map();
  }

  createRun(runId, task, agents, budget) {
    this.runs.set(runId, {
      run_id: runId,
      task,
      agents,
      budget,
      status: 'created',
      created_at: Date.now() / 1000,
      updated_at: Date.now() / 1000
    });
  }

  getRun(runId) {
    return this.runs.get(runId) || null;
  }

  updateRunStatus(runId, status) {
    const run = this.runs.get(runId);
    if (run) {
      run.status = status;
      run.updated_at = Date.now() / 1000;
    }
  }

  completeRun(runId, output, trace) {
    const run = this.runs.get(runId);
    if (run) {
      Object.assign(run, {
        status: 'completed',
        output,
        trace,
        completed_at: Date.now() / 1000,
        updated_at: Date.now() / 1000
      });
    }
  }

  failRun(runId, error) {
    const run = this.runs.get(runId);
    if (run) {
      Object.assign(run, {
        status: 'failed',
        error,
        failed_at: Date.now() / 1000,
        updated_at: Date.now() / 1000
      });
    }
  }

  cancelRun(runId) {
    const run = this.runs.get(runId);
    if (run) {
      Object.assign(run, {
        status: 'cancelled',
        cancelled_at: Date.now() / 1000,
        updated_at: Date.now() / 1000
      });
    }
    const stream = this.streams.get(runId);
    if (stream) {
      stream.close();
    }
  }

  setStream(runId, stream) {
    this.streams.set(runId, stream);
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'streaming';
      run.updated_at = Date.now() / 1000;
    }
  }

  getStream(runId) {
    return this.streams.get(runId) || null;
  }

  listRuns(limit = 10, status = null) {
    let runsList = Array.from(this.runs.values());
    if (status) {
      runsList = runsList.filter(r => r.status === status);
    }
    runsList.sort((a, b) => b.created_at - a.created_at);
    return runsList.slice(0, limit);
  }

  cleanupOldRuns(maxAgeHours = 24) {
    const cutoff = (Date.now() / 1000) - (maxAgeHours * 3600);
    let removed = 0;
    for (const [runId, runData] of this.runs.entries()) {
      if (runData.created_at < cutoff) {
        const stream = this.streams.get(runId);
        if (stream) {
          stream.close();
          this.streams.delete(runId);
        }
        this.runs.delete(runId);
        removed++;
      }
    }
    return removed;
  }
}
