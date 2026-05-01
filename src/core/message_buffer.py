"""Thread-safe ring buffer for message persistence and replay."""

import collections
import time
import asyncio
from typing import List, Dict, Any

class MessageBuffer:
    """Ring buffer that keeps the last N messages for replay upon reconnection."""

    def __init__(self, size: int = 500):
        self.size = size
        self.buffer = collections.deque(maxlen=size)
        self.next_seq_id = 1
        self._lock = asyncio.Lock()

    async def push(self, message: Dict[str, Any]) -> int:
        """Add a message to the buffer and return its sequence ID without mutating caller state."""
        buffered_message = await self.push_and_get(message)
        return buffered_message["seq_id"]

    async def push_and_get(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Add a message to the buffer and return the buffered copy with metadata."""
        async with self._lock:
            seq_id = self.next_seq_id
            self.next_seq_id += 1

            buffered_message = dict(message)
            buffered_message["seq_id"] = seq_id
            buffered_message["timestamp"] = time.time()

            self.buffer.append(buffered_message)
            return dict(buffered_message)

    async def get_since(self, last_seq_id: int) -> List[Dict[str, Any]]:
        """Retrieve all messages with seq_id > last_seq_id."""
        async with self._lock:
            return [msg for msg in self.buffer if msg["seq_id"] > last_seq_id]

class TokenBucket:
    """Rate limiter for WebSocket broadcasts."""

    def __init__(self, rate: int = 30):
        self.rate = rate
        self.capacity = rate
        self.tokens = rate
        self.last_update = time.time()
        self._lock = asyncio.Lock()

    async def consume(self) -> bool:
        """Try to consume a token. Returns True if successful."""
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_update
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last_update = now

            if self.tokens >= 1:
                self.tokens -= 1
                return True
            return False
