import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List
from threading import Lock

logger = logging.getLogger("equilibrium.stream")

HEARTBEAT_INTERVAL = 15.0  # seconds

class EventStream:
    """Manages raw Event Queue and async HTTP byte stream generation."""
    
    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._closed = asyncio.Event()
        self._last_sent = time.monotonic()

    async def send(self, event: str, payload: Dict[str, Any]) -> None:
        """Enqueue SSE structured message."""
        msg = payload.copy()
        if "event" not in msg:
            msg["event"] = event
        data = f"event: {event}\ndata: {json.dumps(msg, ensure_ascii=False)}\n\n"
        await self._queue.put(data)

    async def _heartbeat(self) -> None:
        """Sends empty SSE ping comment to maintain active HTTP connection."""
        await self._queue.put(": ping\n\n")

    async def close(self) -> None:
        """Sends final end signal and shuts down stream listener."""
        await self.send("end", {"status": "done"})
        self._closed.set()

    async def __aiter__(self) -> AsyncIterator[bytes]:
        """Async generator yielding bytes matching SSE protocol."""
        while not self._closed.is_set():
            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=HEARTBEAT_INTERVAL)
                self._last_sent = time.monotonic()
                yield item.encode("utf-8")
            except asyncio.TimeoutError:
                await self._heartbeat()
                
        # Drain remaining enqueued messages
        while not self._queue.empty():
            yield (await self._queue.get()).encode("utf-8")

class SSEStream:
    """Manages high-level SSE formatting for a specific agent execution thread."""
    
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.events = asyncio.Queue()
        self.closed = False
        self.start_time = time.time()
    
    async def send_event(self, event_type: str, data: Dict[str, Any]):
        if self.closed:
            return
        await self.events.put({
            "event": event_type,
            "data": data,
            "timestamp": time.time()
        })
    
    def format_event(self, event_type: str, data: Dict[str, Any]) -> str:
        data_with_meta = {
            **data,
            "run_id": self.run_id,
            "timestamp": time.time()
        }
        return f"event: {event_type}\ndata: {json.dumps(data_with_meta)}\n\n"
    
    async def listen(self) -> AsyncIterator[str]:
        """Yielder yielding formatted text chunk streams."""
        try:
            while not self.closed:
                try:
                    event = await asyncio.wait_for(self.events.get(), timeout=1.0)
                    yield self.format_event(event["event"], event["data"])
                except asyncio.TimeoutError:
                    # Heartbeat message
                    yield self.format_event("heartbeat", {"status": "alive"})
                except Exception as e:
                    yield self.format_event("error", {"error": str(e)})
                    break
        finally:
            self.closed = True
            
    def close(self):
        self.closed = True

class AgentRunStore:
    """Thread-safe in-memory registry of live agent workflow executions."""
    
    def __init__(self):
        self.runs: Dict[str, Dict[str, Any]] = {}
        self.streams: Dict[str, SSEStream] = {}
        self.lock = Lock()
    
    def create_run(self, run_id: str, task: str, agents: List[str], budget: Dict[str, Any]):
        with self.lock:
            self.runs[run_id] = {
                "run_id": run_id,
                "task": task,
                "agents": agents,
                "budget": budget,
                "status": "created",
                "created_at": time.time(),
                "updated_at": time.time()
            }
    
    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            return self.runs.get(run_id)
    
    def update_run_status(self, run_id: str, status: str):
        with self.lock:
            if run_id in self.runs:
                self.runs[run_id]["status"] = status
                self.runs[run_id]["updated_at"] = time.time()
    
    def complete_run(self, run_id: str, output: str, trace: List[Dict[str, Any]]):
        with self.lock:
            if run_id in self.runs:
                self.runs[run_id].update({
                    "status": "completed",
                    "output": output,
                    "trace": trace,
                    "completed_at": time.time(),
                    "updated_at": time.time()
                })
    
    def fail_run(self, run_id: str, error: str):
        with self.lock:
            if run_id in self.runs:
                self.runs[run_id].update({
                    "status": "failed",
                    "error": error,
                    "failed_at": time.time(),
                    "updated_at": time.time()
                })
    
    def cancel_run(self, run_id: str):
        with self.lock:
            if run_id in self.runs:
                self.runs[run_id].update({
                    "status": "cancelled",
                    "cancelled_at": time.time(),
                    "updated_at": time.time()
                })
        # Shut down stream if active
        if run_id in self.streams:
            self.streams[run_id].close()
            
    def set_stream(self, run_id: str, stream: SSEStream):
        with self.lock:
            self.streams[run_id] = stream
            if run_id in self.runs:
                self.runs[run_id]["status"] = "streaming"
                self.runs[run_id]["updated_at"] = time.time()
                
    def get_stream(self, run_id: str) -> Optional[SSEStream]:
        with self.lock:
            return self.streams.get(run_id)
            
    def list_runs(self, limit: int = 10, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with self.lock:
            runs_list = list(self.runs.values())
            if status:
                runs_list = [r for r in runs_list if r["status"] == status]
            runs_list.sort(key=lambda x: x["created_at"], reverse=True)
            return runs_list[:limit]
            
    def cleanup_old_runs(self, max_age_hours: int = 24) -> int:
        cutoff = time.time() - (max_age_hours * 3600)
        removed = 0
        with self.lock:
            to_remove = [r_id for r_id, r_data in self.runs.items() if r_data["created_at"] < cutoff]
            for r_id in to_remove:
                if r_id in self.streams:
                    self.streams[r_id].close()
                    del self.streams[r_id]
                del self.runs[r_id]
                removed += 1
        return removed
