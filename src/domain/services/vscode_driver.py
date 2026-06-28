"""VS Code Bridge driver implementation for the domain layer."""

import asyncio
import logging
import json
from typing import AsyncGenerator, Optional, Dict, Any, List

from src.domain.models.driver import DriverInterface
from src.domain.models.protocol import SESSION_CAPABILITIES

logger = logging.getLogger(__name__)
DESKTOP_HOST_TARGET_ROLE = "desktop-host"

class VSCodeDriver(DriverInterface):
    """Driver that proxies commands to a connected VS Code extension via WebSocket."""

    def __init__(self) -> None:
        self._running = False
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._runtime_catalog: List[Dict[str, Any]] = []
        self._active_runtime: Optional[str] = None

    @property
    def running(self) -> bool:
        return self._running

    async def start(self) -> AsyncGenerator[str, None]:
        if self._running: return
        self._running = True
        yield self._emit_status("started", "Listening for VS Code Bridge connection")

        try:
            while self._running:
                # Driver yields messages that main.py consumes and broadcasts
                msg = await self._message_queue.get()
                if msg == "STOP":
                    break
                yield msg
        except Exception as e:
            logger.error(f"VSCodeDriver error: {e}")
            yield self._emit_status("error", f"Driver error: {str(e)}")
        finally:
            self._running = False
            yield self._emit_status("stopped", "VS Code Bridge Driver stopped")

    async def stop(self) -> str:
        self._running = False
        await self._message_queue.put("STOP")
        return self._emit_status("stopped", "VS Code Bridge Driver stopped")

    async def send_input(self, text: str) -> None:
        """Forward user input (from mobile) to the VS Code bridge."""
        if not self._running:
            return
        msg = json.dumps({
            "type": "prompt.submit",
            "prompt": text,
            "target_role": DESKTOP_HOST_TARGET_ROLE,
            "delivery": "desktop"
        })
        await self._message_queue.put(msg)

    async def handle_focus(self, file_path: str, line: Optional[int] = None) -> None:
        """Request VS Code to focus a specific file/line."""
        if not self._running:
            return
        msg = json.dumps({
            "type": "workspace.focus",
            "file": file_path,
            "line": line,
            "target_role": DESKTOP_HOST_TARGET_ROLE,
            "delivery": "desktop"
        })
        await self._message_queue.put(msg)

    async def request_context(self, file_path: str, line_start: int, line_end: int) -> None:
        """Request additional code context from VS Code for the Expandable Diff."""
        if not self._running:
            return
        msg = json.dumps({
            "type": "context.request",
            "file": file_path,
            "line_start": line_start,
            "line_end": line_end,
            "target_role": DESKTOP_HOST_TARGET_ROLE,
            "delivery": "desktop"
        })
        await self._message_queue.put(msg)

    async def apply_sniper_action(self, file_path: str, lines: List[int], action: str, instruction: str) -> None:
        """Dispatch a sniper mode action (e.g., rewrite) to VS Code."""
        if not self._running:
            return
        await self.dispatch_command({
            "type": "command.dispatch",
            "action": action, # 'rewrite', 'explain', 'focus'
            "file": file_path,
            "lines": lines,
            "instruction": instruction,
            "target_role": DESKTOP_HOST_TARGET_ROLE,
            "delivery": "desktop"
        })

    async def push_incoming_message(self, data: Dict[str, Any]) -> None:
        """Called by main.py when a relevant message is received from VS Code (like context_update)."""
        if not self._running:
            return
        await self._message_queue.put(json.dumps(data))

    async def send_confirm_response(self, confirm_id: str, response: str) -> bool:
        """Forward confirmation response to VS Code."""
        if not self._running:
            return False

        msg = json.dumps({
            "type": "approval.response",
            "approval_id": confirm_id,
            "decision": response,
            "target_role": DESKTOP_HOST_TARGET_ROLE,
            "delivery": "desktop"
        })
        await self._message_queue.put(msg)
        return True

    async def get_output_stream(self) -> AsyncGenerator[str, None]:
        yield ""

    async def dispatch_command(self, payload: Dict[str, Any]) -> None:
        if not self._running:
            return
        envelope = dict(payload)
        envelope.setdefault("target_role", DESKTOP_HOST_TARGET_ROLE)
        envelope.setdefault("delivery", "desktop")
        await self._message_queue.put(json.dumps(envelope))

    def get_session_capabilities(self) -> List[str]:
        return list(SESSION_CAPABILITIES)

    def get_runtime_catalog(self) -> List[Dict[str, Any]]:
        return list(self._runtime_catalog)

    def get_active_runtime(self) -> Optional[str]:
        return self._active_runtime

    async def update_runtime_catalog(
        self,
        runtimes: Optional[List[Dict[str, Any]]],
        active_runtime: Optional[str] = None,
    ) -> None:
        if runtimes is not None:
            self._runtime_catalog = list(runtimes)
        if active_runtime is not None or runtimes is not None:
            self._active_runtime = active_runtime

    def _emit_status(self, state: str, message: str) -> str:
        return json.dumps({"type": "status", "state": state, "message": message})
