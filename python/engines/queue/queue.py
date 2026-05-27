import os
import json
import uuid
import logging
import asyncio
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict

logger = logging.getLogger("equilibrium.queue")

# Optional Redis import
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

@dataclass
class QueuedWorkflow:
    """Workflow queued for processing"""
    id: str
    user_id: str
    task: str
    agents: List[str]
    budget: Dict[str, Any]
    mode: str = "agents"
    meta: Dict[str, Any] = None
    priority: int = 0
    retry_count: int = 0
    max_retries: int = 3
    created_at: float = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now(timezone.utc).timestamp()
        if self.meta is None:
            self.meta = {}

@dataclass
class WorkerHeartbeat:
    """Worker health monitoring"""
    worker_id: str
    status: str  # idle, busy, error
    current_workflow: Optional[str] = None
    last_seen: float = None
    capabilities: List[str] = None
    
    def __post_init__(self):
        if self.last_seen is None:
            self.last_seen = datetime.now(timezone.utc).timestamp()
        if self.capabilities is None:
            self.capabilities = ["agents", "builder"]

class RedisQueueManager:
    """Redis-based distributed queue with seamless in-memory fallback for local environments."""
    
    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL") or "redis://localhost:6379/0"
        self.redis = None
        self.worker_id = str(uuid.uuid4())
        self.use_fallback = not REDIS_AVAILABLE
        
        # In-memory fallbacks
        self._fallback_queue: asyncio.Queue = asyncio.Queue()
        self._fallback_priority_queue: asyncio.Queue = asyncio.Queue()
        self._fallback_processing: Dict[str, Dict[str, Any]] = {}
        self._fallback_completed: Dict[str, Dict[str, Any]] = {}
        self._fallback_failed: Dict[str, Dict[str, Any]] = {}
        self._fallback_workers: Dict[str, Dict[str, Any]] = {}
        self._fallback_heartbeats: Dict[str, Dict[str, Any]] = {}
        self._fallback_sse_connections: Dict[str, Dict[str, Any]] = {}
        self._fallback_user_sets: Dict[str, set] = {}
        self._fallback_subscribers: List[Callable] = []

        # Key registries
        self.workflow_queue = "eq:workflows:pending"
        self.priority_queue = "eq:workflows:priority"
        self.processing_queue = "eq:workflows:processing"
        self.completed_queue = "eq:workflows:completed"
        self.failed_queue = "eq:workflows:failed"
        self.sse_channels = "eq:sse:channels"
        self.workflow_updates = "eq:workflow:updates"
        self.workers_registry = "eq:workers:registry"
        self.worker_heartbeats = "eq:workers:heartbeats"

    async def connect(self):
        """Connect to Redis. Fallback to in-memory on failure or missing packages."""
        if self.use_fallback:
            return
            
        if not self.redis:
            try:
                self.redis = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5
                )
                await self.redis.ping()
                logger.info(f"Connected to Redis queue: {self.redis_url}")
            except Exception as e:
                logger.warning(f"Redis connection failed ({e}). Falling back to fully functional in-memory queue.")
                self.use_fallback = True
                self.redis = None

    async def disconnect(self):
        if self.redis:
            await self.redis.close()
            self.redis = None

    async def enqueue_workflow(self, workflow: QueuedWorkflow, high_priority: bool = False) -> str:
        await self.connect()
        
        if self.use_fallback:
            workflow_data = asdict(workflow)
            if high_priority:
                await self._fallback_priority_queue.put(workflow_data)
            else:
                await self._fallback_queue.put(workflow_data)
                
            # Trigger updates to subscriber callbacks
            event = {
                "type": "workflow_queued",
                "workflow_id": workflow.id,
                "user_id": workflow.user_id,
                "queue": self.priority_queue if high_priority else self.workflow_queue
            }
            for cb in self._fallback_subscribers:
                asyncio.create_task(cb(event))
            return workflow.id

        # Redis path
        workflow_data = json.dumps(asdict(workflow))
        queue_name = self.priority_queue if high_priority else self.workflow_queue
        score = workflow.priority if high_priority else 0
        await self.redis.zadd(queue_name, {workflow_data: score})
        await self.redis.publish(
            self.workflow_updates,
            json.dumps({
                "type": "workflow_queued",
                "workflow_id": workflow.id,
                "user_id": workflow.user_id,
                "queue": queue_name
            })
        )
        return workflow.id

    async def dequeue_workflow(self, timeout: int = 5) -> Optional[QueuedWorkflow]:
        await self.connect()
        
        if self.use_fallback:
            try:
                # Try priority queue first
                if not self._fallback_priority_queue.empty():
                    item = await self._fallback_priority_queue.get()
                else:
                    # Async wait for timeout
                    item = await asyncio.wait_for(self._fallback_queue.get(), timeout=float(timeout))
                
                workflow = QueuedWorkflow(**item)
                await self.mark_workflow_processing(workflow)
                return workflow
            except asyncio.TimeoutError:
                return None
                
        # Redis path
        queues = [self.priority_queue, self.workflow_queue]
        for queue in queues:
            result = await self.redis.bzpopmax(queue, timeout=timeout)
            if result:
                _, workflow_data, _ = result
                workflow = QueuedWorkflow(**json.loads(workflow_data))
                await self.mark_workflow_processing(workflow)
                return workflow
        return None

    async def mark_workflow_processing(self, workflow: QueuedWorkflow):
        await self.connect()
        processing_data = {
            "workflow": asdict(workflow),
            "worker_id": self.worker_id,
            "started_at": datetime.now(timezone.utc).timestamp()
        }
        
        if self.use_fallback:
            self._fallback_processing[workflow.id] = processing_data
            event = {
                "type": "workflow_started",
                "workflow_id": workflow.id,
                "worker_id": self.worker_id
            }
            for cb in self._fallback_subscribers:
                asyncio.create_task(cb(event))
            return

        await self.redis.hset(self.processing_queue, workflow.id, json.dumps(processing_data))
        await self.redis.publish(
            self.workflow_updates,
            json.dumps({
                "type": "workflow_started",
                "workflow_id": workflow.id,
                "worker_id": self.worker_id
            })
        )

    async def mark_workflow_completed(self, workflow_id: str, result: Dict[str, Any]):
        await self.connect()
        completed_data = {
            "workflow_id": workflow_id,
            "worker_id": self.worker_id,
            "result": result,
            "completed_at": datetime.now(timezone.utc).timestamp()
        }
        
        if self.use_fallback:
            self._fallback_processing.pop(workflow_id, None)
            self._fallback_completed[workflow_id] = completed_data
            event = {
                "type": "workflow_completed",
                "workflow_id": workflow_id,
                "worker_id": self.worker_id,
                "result": result
            }
            for cb in self._fallback_subscribers:
                asyncio.create_task(cb(event))
            return

        await self.redis.hdel(self.processing_queue, workflow_id)
        await self.redis.hset(self.completed_queue, workflow_id, json.dumps(completed_data))
        await self.redis.publish(
            self.workflow_updates,
            json.dumps({
                "type": "workflow_completed",
                "workflow_id": workflow_id,
                "worker_id": self.worker_id,
                "result": result
            })
        )

    async def mark_workflow_failed(self, workflow_id: str, error: str, retry: bool = True):
        await self.connect()
        
        workflow = None
        if self.use_fallback:
            proc_info = self._fallback_processing.get(workflow_id)
            if proc_info:
                workflow = QueuedWorkflow(**proc_info["workflow"])
        else:
            proc_data = await self.redis.hget(self.processing_queue, workflow_id)
            if proc_data:
                workflow = QueuedWorkflow(**json.loads(proc_data)["workflow"])

        if not workflow:
            return

        will_retry = retry and workflow.retry_count < workflow.max_retries
        if will_retry:
            workflow.retry_count += 1
            delay = min(300, 10 * (2 ** workflow.retry_count))
            logger.info(f"Re-queueing workflow {workflow.id} in {delay}s (Attempt {workflow.retry_count})")
            
            # Run delayed retry task in background
            async def delayed_requeue():
                await asyncio.sleep(delay)
                await self.enqueue_workflow(workflow)
            asyncio.create_task(delayed_requeue())
        else:
            failed_data = {
                "workflow": asdict(workflow),
                "worker_id": self.worker_id,
                "error": error,
                "failed_at": datetime.now(timezone.utc).timestamp()
            }
            if self.use_fallback:
                self._fallback_failed[workflow_id] = failed_data
            else:
                await self.redis.hset(self.failed_queue, workflow_id, json.dumps(failed_data))

        # Remove from processing
        if self.use_fallback:
            self._fallback_processing.pop(workflow_id, None)
            event = {
                "type": "workflow_failed",
                "workflow_id": workflow_id,
                "worker_id": self.worker_id,
                "error": error,
                "retry_count": workflow.retry_count,
                "will_retry": will_retry
            }
            for cb in self._fallback_subscribers:
                asyncio.create_task(cb(event))
            return

        await self.redis.hdel(self.processing_queue, workflow_id)
        await self.redis.publish(
            self.workflow_updates,
            json.dumps({
                "type": "workflow_failed",
                "workflow_id": workflow_id,
                "worker_id": self.worker_id,
                "error": error,
                "retry_count": workflow.retry_count,
                "will_retry": will_retry
            })
        )

    async def register_worker(self, capabilities: List[str] = None):
        await self.connect()
        heartbeat = WorkerHeartbeat(
            worker_id=self.worker_id,
            status="idle",
            capabilities=capabilities or ["agents", "builder"]
        )
        
        if self.use_fallback:
            self._fallback_workers[self.worker_id] = asdict(heartbeat)
            return

        await self.redis.hset(self.workers_registry, self.worker_id, json.dumps(asdict(heartbeat)))

    async def update_worker_heartbeat(self, status: str = "idle", current_workflow: str = None):
        await self.connect()
        heartbeat_data = {
            "worker_id": self.worker_id,
            "status": status,
            "current_workflow": current_workflow,
            "last_seen": datetime.now(timezone.utc).timestamp()
        }
        
        if self.use_fallback:
            self._fallback_heartbeats[self.worker_id] = heartbeat_data
            if self.worker_id in self._fallback_workers:
                self._fallback_workers[self.worker_id].update(heartbeat_data)
            return

        await self.redis.hset(self.worker_heartbeats, self.worker_id, json.dumps(heartbeat_data))

    async def get_queue_stats(self) -> Dict[str, Any]:
        await self.connect()
        if self.use_fallback:
            return {
                "pending_workflows": self._fallback_queue.qsize(),
                "priority_workflows": self._fallback_priority_queue.qsize(),
                "processing_workflows": len(self._fallback_processing),
                "completed_workflows": len(self._fallback_completed),
                "failed_workflows": len(self._fallback_failed),
                "active_workers": len(self._fallback_workers),
                "total_sse_connections": len(self._fallback_sse_connections)
            }
            
        return {
            "pending_workflows": await self.redis.zcard(self.workflow_queue),
            "priority_workflows": await self.redis.zcard(self.priority_queue),
            "processing_workflows": await self.redis.hlen(self.processing_queue),
            "completed_workflows": await self.redis.hlen(self.completed_queue),
            "failed_workflows": await self.redis.hlen(self.failed_queue),
            "active_workers": await self.redis.hlen(self.workers_registry),
            "total_sse_connections": await self.redis.hlen(f"{self.sse_channels}:connections")
        }

    async def register_sse_connection(self, connection_id: str, user_id: str):
        await self.connect()
        connection_data = {
            "connection_id": connection_id,
            "user_id": user_id,
            "worker_id": self.worker_id,
            "connected_at": datetime.now(timezone.utc).timestamp()
        }
        
        if self.use_fallback:
            self._fallback_sse_connections[connection_id] = connection_data
            if user_id not in self._fallback_user_sets:
                self._fallback_user_sets[user_id] = set()
            self._fallback_user_sets[user_id].add(connection_id)
            return

        await self.redis.hset(f"{self.sse_channels}:connections", connection_id, json.dumps(connection_data))
        await self.redis.sadd(f"{self.sse_channels}:user:{user_id}", connection_id)

    async def unregister_sse_connection(self, connection_id: str, user_id: str):
        await self.connect()
        if self.use_fallback:
            self._fallback_sse_connections.pop(connection_id, None)
            if user_id in self._fallback_user_sets:
                self._fallback_user_sets[user_id].discard(connection_id)
            return

        await self.redis.hdel(f"{self.sse_channels}:connections", connection_id)
        await self.redis.srem(f"{self.sse_channels}:user:{user_id}", connection_id)

    async def subscribe_to_workflow_updates(self, callback: Callable):
        await self.connect()
        if self.use_fallback:
            self._fallback_subscribers.append(callback)
            return

        pubsub = self.redis.pubsub()
        await pubsub.subscribe(self.workflow_updates)
        
        async def listen_loop():
            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            event_data = json.loads(message["data"])
                            await callback(event_data)
                        except Exception as e:
                            logger.error(f"Error processing workflow update: {e}")
            except Exception as e:
                logger.error(f"Workflow update subscription channel error: {e}")
                
        asyncio.create_task(listen_loop())
