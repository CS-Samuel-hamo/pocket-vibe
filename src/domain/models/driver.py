"""Driver interface and models for the domain layer."""

from abc import ABC, abstractmethod
from typing import AsyncGenerator, Any, Dict, List, Optional


class DriverInterface(ABC):
    """Abstract interface for AI drivers (e.g., aider)."""

    @abstractmethod
    async def start(self) -> AsyncGenerator[str, None]:
        """Start the underlying process (e.g. aider)."""
        pass

    @property
    @abstractmethod
    def running(self) -> bool:
        """Check if the driver is currently running."""
        pass

    @abstractmethod
    async def stop(self) -> str:
        """Stop/Kill the process or disconnect."""
        pass

    @abstractmethod
    async def send_input(self, text: str) -> None:
        """Send text to the process stdin or API."""
        pass

    @abstractmethod
    async def send_confirm_response(self, confirm_id: str, response: str) -> bool:
        """Send a response to a confirmation request."""
        pass

    @abstractmethod
    async def handle_focus(self, file_path: str, line: Optional[int] = None) -> None:
        """Sync focus back to the desktop IDE."""
        pass

    @abstractmethod
    async def get_output_stream(self) -> AsyncGenerator[str, None]:
        """Yield output from the process or API."""
        pass

    async def dispatch_command(self, payload: Dict[str, Any]) -> None:
        """Dispatch a protocol command payload to the desktop host."""
        return None

    def get_session_capabilities(self) -> List[str]:
        """Return the currently available session capabilities."""
        return []

    def get_runtime_catalog(self) -> List[Dict[str, Any]]:
        """Return the runtimes currently available behind this driver."""
        return []

    def get_active_runtime(self) -> Optional[str]:
        """Return the active runtime id when known."""
        return None

    async def update_runtime_catalog(
        self,
        runtimes: Optional[List[Dict[str, Any]]],
        active_runtime: Optional[str] = None,
    ) -> None:
        """Update runtime catalog metadata from the desktop bridge."""
        return None
