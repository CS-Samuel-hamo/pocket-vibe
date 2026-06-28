"""Centralized configuration for OpenVibe."""

import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from root .env file
root_dir = Path(__file__).resolve().parent.parent.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

@dataclass(frozen=True)
class Settings:
    """System-wide settings and environment variables."""

    # Server Settings
    PORT: int = int(os.getenv("PORT", 8000))
    HOST: str = os.getenv("HOST", "0.0.0.0")

    # Security
    AUTH_TOKEN: Optional[str] = os.getenv("POCKET_VIBE_TOKEN")

    # Aider/Driver Settings
    TARGET_DIR: str = os.getenv("TARGET_DIR", ".")
    MAX_READ_ITERATIONS: int = 10000
    DEFAULT_CONFIRM_TIMEOUT: int = 60
    MAX_FILE_READ_BYTES: int = int(os.getenv("MAX_FILE_READ_BYTES", 10 * 1024 * 1024))

    # OpenCode Settings
    OPENCODE_HOST: str = os.getenv("OPENCODE_HOST", "http://localhost")
    OPENCODE_PORT: int = int(os.getenv("OPENCODE_PORT", 4097))

    # Reliability & Scalability
    MESSAGE_BUFFER_SIZE: int = 500
    RATE_LIMIT_PER_SEC: int = 30
    E2EE_ENABLED: bool = os.getenv("E2EE_ENABLED", "True").lower() == "true"

    # Telemetry
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

# Singleton instance
settings = Settings()
