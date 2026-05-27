/**
 * Redis-based distributed queue for workflow processing.
 * Upgraded to ESModules with a robust in-memory event-driven fallback.
 */

import crypto from 'crypto';
import EventEmitter from 'events';

let redisModule = null;
let useFallback = false;

// Attempt to load ioredis or redis dynamically
try {
  const ioRedis = await import('ioredis');
  redisModule = ioRedis.default;
} catch (_) {
  try {
    const redisPkg = await import('redis');
    redisModule = redisPkg;
  } catch (err) {
    console.warn(`[QueueManager] No Redis packages found (ioredis/redis). Defaulting to in-memory queue fallback.`);
    useFallback = true;
  }
}

export class QueuedWorkflow {
  constructor({ id, userId, task, agents, budget, mode = 'agents', meta = {}, priority = 0, retryCount = 0, maxRetries = 3 }) {
    this.id = id || crypto.randomUUID();
    this.userId = userId;
    this.task = task;
    this.agents = agents;
    this.budget = budget;
    this.mode = mode;
    this.meta = meta;
    this.priority = priority;
    this.retryCount = retryCount;
    this.maxRetries = maxRetries;
    this.createdAt = Date.now() / 1000;
  }

  toObject() {
    return {
      id: this.id,
      userId: this.userId,
      task: this.task,
      agents: this.agents,
      budget: this.budget,
      mode: this.mode,
      meta: this.meta,
      priority: this.priority,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      createdAt: this.createdAt
    };
  }
}

export class RedisQueueManager {
  constructor(redisUrl = null) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379/0';
    this.client = null;
    this.workerId = crypto.randomUUID();
    this.useFallback = useFallback;

    // In-memory queues and tables
    this._fallbackQueue = [];
    this._fallbackPriorityQueue = [];
    this._fallbackProcessing = new Map();
    this._fallbackCompleted = new Map();
    this._fallbackFailed = new Map();
    this._fallbackWorkers = new Map();
    this._fallbackHeartbeats = new Map();
    this._fallbackSseConnections = new Map();
    this._fallbackUserSets = new Map();
    this._fallbackEmitter = new EventEmitter();

    // Registry keys
    this.workflowQueue = "eq:workflows:pending";
    this.priorityQueue = "eq:workflows:priority";
    this.processingQueue = "eq:workflows:processing";
    this.completedQueue = "eq:workflows:completed";
    this.failedQueue = "eq:workflows:failed";
    this.sseChannels = "eq:sse:channels";
    this.workflowUpdates = "eq:workflow:updates";
    this.workersRegistry = "eq:workers:registry";
    this.workerHeartbeats = "eq:workers:heartbeats";
  }

  async connect() {
    if (this.useFallback) return;

    if (!this.client) {
      try {
        if (redisModule) {
          // If using ioredis
          if (typeof redisModule === 'function') {
            this.client = new redisModule(this.redisUrl);
          } else if (redisModule.createClient) {
            this.client = redisModule.createClient({ url: this.redisUrl });
            await this.client.connect();
          }
          // Validate connection
          await this.client.ping();
          console.log(`[QueueManager] Connected to Redis queue: ${this.redisUrl}`);
        } else {
          this.useFallback = true;
        }
      } catch (err) {
        console.warn(`[QueueManager] Redis connection failed (${err.message}). Falling back to in-memory queue.`);
        this.useFallback = true;
        this.client = null;
      }
    }
  }

  async disconnect() {
    if (this.client) {
      if (typeof this.client.quit === 'function') {
        await this.client.quit();
      } else if (typeof this.client.disconnect === 'function') {
        await this.client.disconnect();
      }
      this.client = null;
    }
  }

  async enqueueWorkflow(workflow, highPriority = false) {
    await this.connect();
    const data = workflow.toObject();

    if (this.useFallback) {
      if (highPriority) {
        // Sort insertion by priority score
        this._fallbackPriorityQueue.push(data);
        this._fallbackPriorityQueue.sort((a, b) => b.priority - a.priority);
      } else {
        this._fallbackQueue.push(data);
      }

      const event = {
        type: "workflow_queued",
        workflowId: workflow.id,
        userId: workflow.userId,
        queue: highPriority ? this.priorityQueue : this.workflowQueue
      };
      this._fallbackEmitter.emit(this.workflowUpdates, event);
      return workflow.id;
    }

    // Redis flow (using sorted set)
    const payload = JSON.stringify(data);
    const queueName = highPriority ? this.priorityQueue : this.workflowQueue;
    const score = highPriority ? workflow.priority : 0;
    
    if (typeof this.client.zadd === 'function') {
      await this.client.zadd(queueName, score, payload);
      await this.client.publish(this.workflowUpdates, JSON.stringify({
        type: "workflow_queued",
        workflowId: workflow.id,
        userId: workflow.userId,
        queue: queueName
      }));
    } else {
      // redis v4 format
      await this.client.zAdd(queueName, { score, value: payload });
      await this.client.publish(this.workflowUpdates, JSON.stringify({
        type: "workflow_queued",
        workflowId: workflow.id,
        userId: workflow.userId,
        queue: queueName
      }));
    }
    return workflow.id;
  }

  async dequeueWorkflow(timeout = 5) {
    await this.connect();

    if (this.useFallback) {
      if (this._fallbackPriorityQueue.length > 0) {
        const item = this._fallbackPriorityQueue.shift();
        const workflow = new QueuedWorkflow(item);
        await this.markWorkflowProcessing(workflow);
        return workflow;
      }
      if (this._fallbackQueue.length > 0) {
        const item = this._fallbackQueue.shift();
        const workflow = new QueuedWorkflow(item);
        await this.markWorkflowProcessing(workflow);
        return workflow;
      }
      // Wait for item using standard event emitter with timeout
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this._fallbackEmitter.off('new_item', handler);
          resolve(null);
        }, timeout * 1000);

        const handler = (item) => {
          clearTimeout(timer);
          const workflow = new QueuedWorkflow(item);
          this.markWorkflowProcessing(workflow).then(() => resolve(workflow));
        };

        this._fallbackEmitter.once('new_item', handler);
      });
    }

    // Redis flow
    const queues = [this.priorityQueue, this.workflowQueue];
    for (const queue of queues) {
      let result = null;
      if (typeof this.client.bzpopmax === 'function') {
        result = await this.client.bzpopmax(queue, timeout);
      } else {
        // node-redis v4
        result = await this.client.bzPopMax(queue, timeout);
      }
      
      if (result) {
        // bzpopmax returns [key, member, score] or {key, element, score}
        const workflowData = Array.isArray(result) ? result[1] : (result.element || result.value);
        const workflow = new QueuedWorkflow(JSON.parse(workflowData));
        await this.markWorkflowProcessing(workflow);
        return workflow;
      }
    }
    return null;
  }

  async markWorkflowProcessing(workflow) {
    await this.connect();
    const data = {
      workflow: workflow.toObject(),
      workerId: this.workerId,
      startedAt: Date.now() / 1000
    };

    if (this.useFallback) {
      this._fallbackProcessing.set(workflow.id, data);
      this._fallbackEmitter.emit(this.workflowUpdates, {
        type: "workflow_started",
        workflowId: workflow.id,
        workerId: this.workerId
      });
      return;
    }

    const payload = JSON.stringify(data);
    if (typeof this.client.hset === 'function') {
      await this.client.hset(this.processingQueue, workflow.id, payload);
      await this.client.publish(this.workflowUpdates, JSON.stringify({
        type: "workflow_started",
        workflowId: workflow.id,
        workerId: this.workerId
      }));
    } else {
      await this.client.hSet(this.processingQueue, workflow.id, payload);
      await this.client.publish(this.workflowUpdates, JSON.stringify({
        type: "workflow_started",
        workflowId: workflow.id,
        workerId: this.workerId
      }));
    }
  }

  async markWorkflowCompleted(workflowId, result) {
    await this.connect();
    const completedData = {
      workflowId,
      workerId: this.workerId,
      result,
      completedAt: Date.now() / 1000
    };

    if (this.useFallback) {
      this._fallbackProcessing.delete(workflowId);
      this._fallbackCompleted.set(workflowId, completedData);
      this._fallbackEmitter.emit(this.workflowUpdates, {
        type: "workflow_completed",
        workflowId,
        workerId: this.workerId,
        result
      });
      return;
    }

    const payload = JSON.stringify(completedData);
    if (typeof this.client.hdel === 'function') {
      await this.client.hdel(this.processingQueue, workflowId);
      await this.client.hset(this.completedQueue, workflowId, payload);
      await this.client.publish(this.workflowUpdates, JSON.stringify({
        type: "workflow_completed",
        workflowId,
        workerId: this.workerId,
        result
      }));
    } else {
      await this.client.hDel(this.processingQueue, workflowId);
      await this.client.hSet(this.completedQueue, workflowId, payload);
      await this.client.publish(this.workflowUpdates, JSON.stringify({
        type: "workflow_completed",
        workflowId,
        workerId: this.workerId,
        result
      }));
    }
  }

  async markWorkflowFailed(workflowId, error, retry = true) {
    await this.connect();
    let workflow = null;

    if (this.useFallback) {
      const procInfo = this._fallbackProcessing.get(workflowId);
      if (procInfo) workflow = new QueuedWorkflow(procInfo.workflow);
    } else {
      const procData = typeof this.client.hget === 'function' 
        ? await this.client.hget(this.processingQueue, workflowId)
        : await this.client.hGet(this.processingQueue, workflowId);
      if (procData) {
        workflow = new QueuedWorkflow(JSON.parse(procData).workflow);
      }
    }

    if (!workflow) return;

    const willRetry = retry && workflow.retryCount < workflow.maxRetries;
    if (willRetry) {
      workflow.retryCount += 1;
      const delay = Math.min(300, 10 * Math.pow(2, workflow.retryCount));
      console.log(`[QueueManager] Re-queueing failing workflow ${workflow.id} in ${delay}s`);
      
      setTimeout(() => {
        this.enqueueWorkflow(workflow);
      }, delay * 1000);
    } else {
      const failedData = {
        workflow: workflow.toObject(),
        workerId: this.workerId,
        error,
        failedAt: Date.now() / 1000
      };
      if (this.useFallback) {
        this._fallbackFailed.set(workflowId, failedData);
      } else {
        const payload = JSON.stringify(failedData);
        if (typeof this.client.hset === 'function') {
          await this.client.hset(this.failedQueue, workflowId, payload);
        } else {
          await this.client.hSet(this.failedQueue, workflowId, payload);
        }
      }
    }

    if (this.useFallback) {
      this._fallbackProcessing.delete(workflowId);
      this._fallbackEmitter.emit(this.workflowUpdates, {
        type: "workflow_failed",
        workflowId,
        workerId: this.workerId,
        error,
        retryCount: workflow.retryCount,
        willRetry
      });
      return;
    }

    if (typeof this.client.hdel === 'function') {
      await this.client.hdel(this.processingQueue, workflowId);
    } else {
      await this.client.hDel(this.processingQueue, workflowId);
    }

    await this.client.publish(this.workflowUpdates, JSON.stringify({
      type: "workflow_failed",
      workflowId,
      workerId: this.workerId,
      error,
      retryCount: workflow.retryCount,
      willRetry
    }));
  }

  async registerWorker(capabilities = null) {
    await this.connect();
    const data = {
      workerId: this.workerId,
      status: "idle",
      capabilities: capabilities || ["agents", "builder"],
      lastSeen: Date.now() / 1000
    };

    if (this.useFallback) {
      this._fallbackWorkers.set(this.workerId, data);
      return;
    }

    const payload = JSON.stringify(data);
    if (typeof this.client.hset === 'function') {
      await this.client.hset(this.workersRegistry, this.workerId, payload);
    } else {
      await this.client.hSet(this.workersRegistry, this.workerId, payload);
    }
  }

  async updateWorkerHeartbeat(status = "idle", currentWorkflow = null) {
    await this.connect();
    const data = {
      workerId: this.workerId,
      status,
      currentWorkflow,
      lastSeen: Date.now() / 1000
    };

    if (this.useFallback) {
      this._fallbackHeartbeats.set(this.workerId, data);
      const wrk = this._fallbackWorkers.get(this.workerId);
      if (wrk) {
        Object.assign(wrk, data);
      }
      return;
    }

    const payload = JSON.stringify(data);
    if (typeof this.client.hset === 'function') {
      await this.client.hset(this.workerHeartbeats, this.workerId, payload);
    } else {
      await this.client.hSet(this.workerHeartbeats, this.workerId, payload);
    }
  }

  async getQueueStats() {
    await this.connect();
    if (this.useFallback) {
      return {
        pendingWorkflows: this._fallbackQueue.length,
        priorityWorkflows: this._fallbackPriorityQueue.length,
        processingWorkflows: this._fallbackProcessing.size,
        completedWorkflows: this._fallbackCompleted.size,
        failedWorkflows: this._fallbackFailed.size,
        activeWorkers: this._fallbackWorkers.size,
        totalSseConnections: this._fallbackSseConnections.size
      };
    }

    if (typeof this.client.zcard === 'function') {
      return {
        pendingWorkflows: await this.client.zcard(this.workflowQueue),
        priorityWorkflows: await this.client.zcard(this.priorityQueue),
        processingWorkflows: await this.client.hlen(self.processingQueue),
        completedWorkflows: await this.client.hlen(this.completedQueue),
        failedWorkflows: await this.client.hlen(this.failedQueue),
        activeWorkers: await this.client.hlen(this.workersRegistry),
        totalSseConnections: await this.client.hlen(`${this.sseChannels}:connections`)
      };
    } else {
      return {
        pendingWorkflows: await this.client.zCard(this.workflowQueue),
        priorityWorkflows: await this.client.zCard(this.priorityQueue),
        processingWorkflows: await this.client.hLen(this.processingQueue),
        completedWorkflows: await this.client.hLen(this.completedQueue),
        failedWorkflows: await this.client.hLen(this.failedQueue),
        activeWorkers: await this.client.hLen(this.workersRegistry),
        totalSseConnections: await this.client.hLen(`${this.sseChannels}:connections`)
      };
    }
  }

  async registerSseConnection(connectionId, userId) {
    await this.connect();
    const data = {
      connectionId,
      userId,
      workerId: this.workerId,
      connectedAt: Date.now() / 1000
    };

    if (this.useFallback) {
      this._fallbackSseConnections.set(connectionId, data);
      if (!this._fallbackUserSets.has(userId)) {
        this._fallbackUserSets.set(userId, new Set());
      }
      this._fallbackUserSets.get(userId).add(connectionId);
      return;
    }

    const payload = JSON.stringify(data);
    if (typeof this.client.hset === 'function') {
      await this.client.hset(`${this.sseChannels}:connections`, connectionId, payload);
      await this.client.sadd(`${this.sseChannels}:user:${userId}`, connectionId);
    } else {
      await this.client.hSet(`${this.sseChannels}:connections`, connectionId, payload);
      await this.client.sAdd(`${this.sseChannels}:user:${userId}`, connectionId);
    }
  }

  async unregisterSseConnection(connectionId, userId) {
    await this.connect();
    if (this.useFallback) {
      this._fallbackSseConnections.delete(connectionId);
      if (this._fallbackUserSets.has(userId)) {
        this._fallbackUserSets.get(userId).delete(connectionId);
      }
      return;
    }

    if (typeof this.client.hdel === 'function') {
      await this.client.hdel(`${this.sseChannels}:connections`, connectionId);
      await this.client.srem(`${this.sseChannels}:user:${userId}`, connectionId);
    } else {
      await this.client.hDel(`${this.sseChannels}:connections`, connectionId);
      await this.client.sRem(`${this.sseChannels}:user:${userId}`, connectionId);
    }
  }

  async subscribeToWorkflowUpdates(callback) {
    await this.connect();
    if (this.useFallback) {
      this._fallbackEmitter.on(this.workflowUpdates, callback);
      return;
    }

    // In native Node redis, subscription must happen on a separate connection, but for simplicity
    // we use a pubsub subscription mechanism.
    try {
      let subClient = null;
      if (typeof redisModule === 'function') {
        subClient = new redisModule(this.redisUrl);
      } else if (redisModule.createClient) {
        subClient = redisModule.createClient({ url: this.redisUrl });
        await subClient.connect();
      }

      if (typeof subClient.subscribe === 'function') {
        await subClient.subscribe(this.workflowUpdates, (msg) => {
          try {
            callback(JSON.parse(msg));
          } catch (_) {
            callback(msg);
          }
        });
      }
    } catch (e) {
      console.error(`[QueueManager] Subscription failed: ${e.message}`);
    }
  }
}
