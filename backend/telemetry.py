"""Telemetry and monitoring utilities for OpenVibe."""

import functools
import time
import logging
from typing import Callable, Any, TypeVar

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

def monitor(func: F) -> F:
    """Monitor external API and database calls.

    This decorator logs function execution time, success/failure status,
    and any exceptions that occur during execution.

    Args:
        func: The function to be monitored.

    Returns:
        The wrapped function with monitoring capabilities.
    """
    @functools.wraps(func)
    async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
        start_time = time.time()
        context_id = kwargs.get("context_id", "unknown")

        try:
            result = await func(*args, **kwargs)
            latency_ms = (time.time() - start_time) * 1000

            logger.info({
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "success",
                "context_id": context_id
            })
            return result

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.error({
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "failure",
                "error": str(e),
                "context_id": context_id
            })
            raise

    @functools.wraps(func)
    def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
        start_time = time.time()
        context_id = kwargs.get("context_id", "unknown")

        try:
            result = func(*args, **kwargs)
            latency_ms = (time.time() - start_time) * 1000

            logger.info({
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "success",
                "context_id": context_id
            })
            return result

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.error({
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "failure",
                "error": str(e),
                "context_id": context_id
            })
            raise

    # Return appropriate wrapper based on whether function is async or not
    if asyncio.iscoroutinefunction(func):
        return async_wrapper  # type: ignore
    return sync_wrapper  # type: ignore

# Import asyncio here to avoid circular import issues
import asyncio
