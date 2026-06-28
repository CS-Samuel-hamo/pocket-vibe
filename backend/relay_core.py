"""Core relay session state for the future Pocket Vibe relay service.

The relay core is intentionally transport-free. HTTP/WebSocket handlers can
wrap this module later, while tests keep the pairing and replay rules stable.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


SUCCESS = "success"
FAILED = "failed"


@dataclass(frozen=True)
class RelayResult:
    status: str
    reason: str
    session_id: Optional[str] = None
    device_id: Optional[str] = None
    code: Optional[str] = None
    next_cursor: Optional[int] = None
    messages: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status == SUCCESS


@dataclass
class RelayDevice:
    device_id: str
    role: str
    label: str
    paired_at: float
    online: bool = False
    last_seen_at: Optional[float] = None
    revoked_at: Optional[float] = None

    @property
    def active(self) -> bool:
        return self.revoked_at is None


@dataclass
class RelayMessage:
    seq: int
    sender_device_id: str
    envelope: Dict[str, Any]
    created_at: float


@dataclass
class RelaySession:
    session_id: str
    host_id: str
    label: str
    devices: Dict[str, RelayDevice] = field(default_factory=dict)
    messages: List[RelayMessage] = field(default_factory=list)
    next_seq: int = 1


@dataclass
class PairingChallenge:
    code: str
    session_id: str
    expires_at: float
    consumed_at: Optional[float] = None


class RelayCore:
    """In-memory relay state machine.

    It does not authenticate users or open sockets. It only enforces the
    product rules that are independent from the eventual relay transport.
    """

    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.time,
        id_factory: Optional[Callable[[str], str]] = None,
        code_factory: Optional[Callable[[], str]] = None,
        max_messages_per_session: Optional[int] = 200,
    ) -> None:
        self._clock = clock
        self._id_factory = id_factory or self._default_id
        self._code_factory = code_factory or self._default_code
        self._max_messages_per_session = max_messages_per_session
        self._sessions: Dict[str, RelaySession] = {}
        self._host_sessions: Dict[str, str] = {}
        self._pairing_challenges: Dict[str, PairingChallenge] = {}

    def register_host(self, host_id: str, *, label: str = "Desktop Host") -> RelayResult:
        normalized_host_id = str(host_id or "").strip()
        if not normalized_host_id:
            return RelayResult(FAILED, "host_id_missing")

        existing_session_id = self._host_sessions.get(normalized_host_id)
        if existing_session_id:
            return RelayResult(
                SUCCESS,
                "host_already_registered",
                session_id=existing_session_id,
                device_id=self._host_device_id(existing_session_id),
            )

        session_id = self._id_factory("session")
        device_id = self._id_factory("host")
        now = self._clock()
        session = RelaySession(session_id=session_id, host_id=normalized_host_id, label=label)
        session.devices[device_id] = RelayDevice(
            device_id=device_id,
            role="host",
            label=label,
            paired_at=now,
            online=True,
            last_seen_at=now,
        )
        self._sessions[session_id] = session
        self._host_sessions[normalized_host_id] = session_id
        return RelayResult(SUCCESS, "host_registered", session_id=session_id, device_id=device_id)

    def open_pairing_code(self, host_id: str, *, ttl_seconds: int = 120) -> RelayResult:
        self.cleanup_pairing_challenges()
        session_id = self._host_sessions.get(str(host_id or "").strip())
        if not session_id:
            return RelayResult(FAILED, "host_not_registered")

        code = self._code_factory()
        now = self._clock()
        self._pairing_challenges[code] = PairingChallenge(
            code=code,
            session_id=session_id,
            expires_at=now + max(1, ttl_seconds),
        )
        return RelayResult(SUCCESS, "pairing_code_created", session_id=session_id, code=code)

    def pair_mobile_device(self, code: str, *, label: str = "Mobile") -> RelayResult:
        challenge = self._pairing_challenges.get(str(code or "").strip())
        if not challenge:
            return RelayResult(FAILED, "short_code_invalid")

        now = self._clock()
        if challenge.consumed_at is not None:
            return RelayResult(FAILED, "short_code_consumed", session_id=challenge.session_id)
        if now > challenge.expires_at:
            return RelayResult(FAILED, "short_code_expired", session_id=challenge.session_id)

        session = self._sessions[challenge.session_id]
        device_id = self._id_factory("mobile")
        session.devices[device_id] = RelayDevice(
            device_id=device_id,
            role="mobile",
            label=label,
            paired_at=now,
            online=False,
        )
        challenge.consumed_at = now
        return RelayResult(SUCCESS, "device_paired", session_id=session.session_id, device_id=device_id)

    def cleanup_pairing_challenges(self) -> int:
        now = self._clock()
        removable_codes = [
            code
            for code, challenge in self._pairing_challenges.items()
            if challenge.consumed_at is not None or now > challenge.expires_at
        ]
        for code in removable_codes:
            self._pairing_challenges.pop(code, None)
        return len(removable_codes)

    def revoke_device(self, session_id: str, device_id: str) -> RelayResult:
        device = self._get_device(session_id, device_id)
        if not device:
            return RelayResult(FAILED, "device_not_found", session_id=session_id, device_id=device_id)

        if device.revoked_at is None:
            device.revoked_at = self._clock()
        device.online = False
        device.last_seen_at = self._clock()
        return RelayResult(SUCCESS, "device_revoked", session_id=session_id, device_id=device_id)

    def set_device_online(self, session_id: str, device_id: str, online: bool) -> RelayResult:
        device = self._get_active_device(session_id, device_id)
        if not device:
            return RelayResult(FAILED, "device_not_authorized", session_id=session_id, device_id=device_id)

        device.online = bool(online)
        device.last_seen_at = self._clock()
        return RelayResult(
            SUCCESS,
            "device_online" if online else "device_offline",
            session_id=session_id,
            device_id=device_id,
        )

    def get_presence(self, session_id: str) -> Dict[str, Any]:
        session = self._sessions.get(session_id)
        if not session:
            return {"session_id": session_id, "host_online": False, "devices": []}

        devices = [
            {
                "device_id": device.device_id,
                "role": device.role,
                "label": device.label,
                "online": device.online,
                "revoked": not device.active,
                "last_seen_at": device.last_seen_at,
            }
            for device in session.devices.values()
        ]
        return {
            "session_id": session_id,
            "host_online": any(device.role == "host" and device.online and device.active for device in session.devices.values()),
            "devices": devices,
        }

    def append_encrypted_envelope(
        self,
        session_id: str,
        sender_device_id: str,
        envelope: Dict[str, Any],
    ) -> RelayResult:
        session = self._sessions.get(session_id)
        if not session:
            return RelayResult(FAILED, "session_not_found", session_id=session_id)
        if not self._get_active_device(session_id, sender_device_id):
            return RelayResult(FAILED, "device_not_authorized", session_id=session_id, device_id=sender_device_id)
        if not self._is_encrypted_envelope(envelope):
            return RelayResult(FAILED, "payload_not_encrypted", session_id=session_id, device_id=sender_device_id)

        message = RelayMessage(
            seq=session.next_seq,
            sender_device_id=sender_device_id,
            envelope=dict(envelope),
            created_at=self._clock(),
        )
        session.next_seq += 1
        session.messages.append(message)
        self._trim_messages(session)
        return RelayResult(SUCCESS, "message_appended", session_id=session_id, device_id=sender_device_id, next_cursor=message.seq)

    def replay_since(self, session_id: str, device_id: str, cursor: int = 0) -> RelayResult:
        session = self._sessions.get(session_id)
        if not session:
            return RelayResult(FAILED, "session_not_found", session_id=session_id)
        if not self._get_active_device(session_id, device_id):
            return RelayResult(FAILED, "device_not_authorized", session_id=session_id, device_id=device_id)

        replayed = [
            {
                "seq": message.seq,
                "sender_device_id": message.sender_device_id,
                "created_at": message.created_at,
                "envelope": dict(message.envelope),
            }
            for message in session.messages
            if message.seq > cursor
        ]
        next_cursor = replayed[-1]["seq"] if replayed else cursor
        return RelayResult(
            SUCCESS,
            "messages_replayed",
            session_id=session_id,
            device_id=device_id,
            next_cursor=next_cursor,
            messages=replayed,
        )

    def _host_device_id(self, session_id: str) -> Optional[str]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        for device in session.devices.values():
            if device.role == "host":
                return device.device_id
        return None

    def _get_device(self, session_id: str, device_id: str) -> Optional[RelayDevice]:
        session = self._sessions.get(session_id)
        if not session:
            return None
        return session.devices.get(device_id)

    def _get_active_device(self, session_id: str, device_id: str) -> Optional[RelayDevice]:
        device = self._get_device(session_id, device_id)
        if not device or not device.active:
            return None
        return device

    def _trim_messages(self, session: RelaySession) -> None:
        if self._max_messages_per_session is None:
            return
        overflow = len(session.messages) - max(1, self._max_messages_per_session)
        if overflow > 0:
            del session.messages[:overflow]

    @staticmethod
    def _is_encrypted_envelope(envelope: Dict[str, Any]) -> bool:
        if not isinstance(envelope, dict):
            return False
        return bool(envelope.get("ciphertext") and envelope.get("nonce"))

    @staticmethod
    def _default_id(prefix: str) -> str:
        return f"{prefix}_{secrets.token_urlsafe(12)}"

    @staticmethod
    def _default_code() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"
