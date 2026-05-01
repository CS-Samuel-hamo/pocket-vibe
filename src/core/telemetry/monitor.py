"""Telemetry and monitoring utilities for OpenVibe."""

import asyncio
import functools
import time
import logging
from typing import Callable, Any, Optional, TypeVar
from contextlib import contextmanager

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

def monitor(func: F) -> F:
    """Decorator to monitor function execution time and errors."""
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs) -> Any:
        start_time = time.time()
        context_id = kwargs.get('context_id', 'unknown')
        try:
            result = await func(*args, **kwargs)
            latency_ms = (time.time() - start_time) * 1000
            logger.info({
                "event": "function_execution",
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "success",
                "context_id": context_id
            })
            return result
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.error({
                "event": "function_execution",
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "failure",
                "error_type": type(e).__name__,
                "error_message": str(e),
                "context_id": context_id
            })
            raise

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs) -> Any:
        start_time = time.time()
        context_id = kwargs.get('context_id', 'unknown')
        try:
            result = func(*args, **kwargs)
            latency_ms = (time.time() - start_time) * 1000
            logger.info({
                "event": "function_execution",
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "success",
                "context_id": context_id
            })
            return result
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logger.error({
                "event": "function_execution",
                "function": func.__name__,
                "latency_ms": round(latency_ms, 2),
                "status": "failure",
                "error_type": type(e).__name__,
                "error_message": str(e),
                "context_id": context_id
            })
            raise

    if asyncio.iscoroutinefunction(func):
        return async_wrapper  # type: ignore
    return sync_wrapper  # type: ignore

@contextmanager
def monitor_block(operation_name: str, context_id: Optional[str] = None):
    """Context manager for monitoring blocks of code."""
    start_time = time.time()
    context_id = context_id or 'unknown'
    try:
        yield
        latency_ms = (time.time() - start_time) * 1000
        logger.info({
            "event": "block_execution",
            "operation": operation_name,
            "latency_ms": round(latency_ms, 2),
            "status": "success",
            "context_id": context_id
        })
    except Exception as e:
        latency_ms = (time.time() - start_time) * 1000
        logger.error({
            "event": "block_execution",
            "operation": operation_name,
            "latency_ms": round(latency_ms, 2),
            "status": "failure",
            "error_type": type(e).__name__,
            "error_message": str(e),
            "context_id": context_id
        })
        raise

def log_metric(metric_name: str, value: float, context_id: Optional[str] = None):
    """Log a custom metric."""
    logger.info({
        "event": "metric",
        "metric_name": metric_name,
        "value": value,
        "context_id": context_id or 'unknown'
    })

def log_event(event_name: str, details: dict, context_id: Optional[str] = None):
    """Log a custom event with details."""
    logger.info({
        "event": event_name,
        **details,
        "context_id": context_id or 'unknown'
    })
