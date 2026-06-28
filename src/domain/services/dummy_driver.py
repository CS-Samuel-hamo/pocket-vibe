"""Dummy driver implementation for testing."""

import asyncio
import json
from typing import AsyncGenerator

from src.domain.models.driver import DriverInterface
from src.domain.models.protocol import SESSION_CAPABILITIES


class DummyDriver(DriverInterface):
    """Dummy driver for testing purposes."""

    def __init__(self) -> None:
        self.running: bool = False

    async def start(self) -> AsyncGenerator[str, None]:
        """Simulate starting a driver process."""
        self.running = True
        yield json.dumps({"type": "status", "state": "started", "message": "Dummy Aider Started"})
        await asyncio.sleep(0.5)

        yield json.dumps({"type": "log", "content": "I am thinking about your request..."})
        await asyncio.sleep(1)

        yield json.dumps({"type": "log", "content": "Found some files. Creating a diff."})
        await asyncio.sleep(1)

        # Simulate Diff
        diff_content = """@@ -1,5 +1,8 @@
 def hello():
-    print("Old World")
+    print("New World")
+    print("Vibe Coding")
+
+def footer():
     pass"""

        yield json.dumps({
            "type": "diff",
            "file": "main.py",
            "content": diff_content
        })

        await asyncio.sleep(1)
        yield json.dumps({"type": "log", "content": "Done."})
        self.running = False

    async def stop(self) -> str:
        """Simulate stopping the driver."""
        self.running = False
        return json.dumps({"type": "status", "state": "stopped", "message": "Dummy Stopped"})

    async def send_input(self, text: str) -> None:
        """Simulate sending input (no-op for dummy)."""
        pass

    async def get_output_stream(self) -> AsyncGenerator[str, None]:
        """For dummy, just return the same as start."""
        async for item in self.start():
            yield item

    def get_session_capabilities(self):
        return list(SESSION_CAPABILITIES)
