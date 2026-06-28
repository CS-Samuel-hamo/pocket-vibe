"""Unit tests for monitor module."""

import pytest
import asyncio
import logging
from unittest.mock import Mock, patch, MagicMock
from src.core.telemetry.monitor import monitor, monitor_block, log_metric, log_event

class TestMonitorDecorator:
    """Tests for @monitor decorator."""

    def test_monitor_sync_function_success(self, caplog):
        """Test @monitor on successful sync function."""
        caplog.set_level(logging.INFO)

        @monitor
        def test_func(x: int) -> int:
            return x * 2

        result = test_func(5)

        assert result == 10
        assert "function_execution" in caplog.text
        assert "test_func" in caplog.text
        assert "'status': 'success'" in caplog.text

    def test_monitor_sync_function_failure(self, caplog):
        """Test @monitor on failing sync function."""
        caplog.set_level(logging.ERROR)

        @monitor
        def test_func_error():
            raise ValueError("Test error")

        with pytest.raises(ValueError):
            test_func_error()

        assert "function_execution" in caplog.text
        assert "'status': 'failure'" in caplog.text
        assert "ValueError" in caplog.text

    @pytest.mark.asyncio
    async def test_monitor_async_function_success(self, caplog):
        """Test @monitor on successful async function."""
        caplog.set_level(logging.INFO)

        @monitor
        async def async_test_func(x: int) -> int:
            await asyncio.sleep(0.01)
            return x * 2

        result = await async_test_func(5)

        assert result == 10
        assert "function_execution" in caplog.text
        assert "async_test_func" in caplog.text
        assert "'status': 'success'" in caplog.text

    @pytest.mark.asyncio
    async def test_monitor_async_function_failure(self, caplog):
        """Test @monitor on failing async function."""
        caplog.set_level(logging.ERROR)

        @monitor
        async def async_test_func_error():
            await asyncio.sleep(0.01)
            raise RuntimeError("Async error")

        with pytest.raises(RuntimeError):
            await async_test_func_error()

        assert "function_execution" in caplog.text
        assert "'status': 'failure'" in caplog.text

    def test_monitor_preserves_function_name(self):
        """Test @monitor preserves original function name."""
        @monitor
        def my_function():
            pass

        assert my_function.__name__ == "my_function"

class TestMonitorBlock:
    """Tests for monitor_block context manager."""

    def test_monitor_block_success(self, caplog):
        """Test monitor_block on successful operation."""
        caplog.set_level(logging.INFO)

        with monitor_block("test_operation", "ctx_123"):
            result = 42

        assert "block_execution" in caplog.text
        assert "test_operation" in caplog.text
        assert "'status': 'success'" in caplog.text
        assert "ctx_123" in caplog.text

    def test_monitor_block_failure(self, caplog):
        """Test monitor_block on failing operation."""
        caplog.set_level(logging.ERROR)

        with pytest.raises(ValueError):
            with monitor_block("failing_operation"):
                raise ValueError("Block error")

        assert "block_execution" in caplog.text
        assert "failing_operation" in caplog.text
        assert "'status': 'failure'" in caplog.text

class TestLogMetric:
    """Tests for log_metric function."""

    def test_log_metric(self, caplog):
        """Test log_metric logs correctly."""
        caplog.set_level(logging.INFO)

        log_metric("response_time", 150.5, "req_123")

        assert "metric" in caplog.text
        assert "response_time" in caplog.text
        assert "150.5" in caplog.text
        assert "req_123" in caplog.text

class TestLogEvent:
    """Tests for log_event function."""

    def test_log_event(self, caplog):
        """Test log_event logs correctly."""
        caplog.set_level(logging.INFO)

        log_event("user_login", {"user_id": "123", "ip": "192.168.1.1"}, "session_456")

        assert "user_login" in caplog.text
        assert "user_id" in caplog.text
        assert "192.168.1.1" in caplog.text
        assert "session_456" in caplog.text

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
