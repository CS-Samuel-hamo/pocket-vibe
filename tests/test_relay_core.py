from backend.relay_core import FAILED, SUCCESS, RelayCore


class FakeClock:
    def __init__(self, start=1000.0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class FakeIds:
    def __init__(self):
        self.counts = {}

    def __call__(self, prefix):
        self.counts[prefix] = self.counts.get(prefix, 0) + 1
        return f"{prefix}-{self.counts[prefix]}"


def _store(code="123456"):
    clock = FakeClock()
    ids = FakeIds()
    return RelayCore(clock=clock, id_factory=ids, code_factory=lambda: code), clock


def _paired_session():
    store, clock = _store()
    host = store.register_host("host-1", label="Workstation")
    pairing = store.open_pairing_code("host-1", ttl_seconds=60)
    mobile = store.pair_mobile_device(pairing.code, label="Phone")
    return store, clock, host, mobile


def test_relay_core_pairs_mobile_with_short_code():
    store, _clock = _store(code="654321")

    host = store.register_host("host-1", label="Workstation")
    pairing = store.open_pairing_code("host-1", ttl_seconds=60)
    mobile = store.pair_mobile_device("654321", label="Phone")

    assert host.status == SUCCESS
    assert host.session_id == "session-1"
    assert host.device_id == "host-1"
    assert pairing.code == "654321"
    assert mobile.status == SUCCESS
    assert mobile.reason == "device_paired"
    assert mobile.session_id == host.session_id
    assert mobile.device_id == "mobile-1"


def test_relay_core_rejects_expired_short_code():
    store, clock = _store()
    store.register_host("host-1")
    pairing = store.open_pairing_code("host-1", ttl_seconds=10)

    clock.advance(11)
    result = store.pair_mobile_device(pairing.code)

    assert result.status == FAILED
    assert result.reason == "short_code_expired"


def test_relay_core_tracks_presence_and_revocation():
    store, _clock, host, mobile = _paired_session()

    online = store.set_device_online(host.session_id, mobile.device_id, True)
    presence = store.get_presence(host.session_id)

    assert online.ok is True
    assert presence["host_online"] is True
    assert any(device["device_id"] == mobile.device_id and device["online"] for device in presence["devices"])

    revoked = store.revoke_device(host.session_id, mobile.device_id)
    presence = store.get_presence(host.session_id)

    assert revoked.ok is True
    assert any(device["device_id"] == mobile.device_id and device["revoked"] for device in presence["devices"])


def test_relay_core_requires_encrypted_envelopes():
    store, _clock, host, mobile = _paired_session()

    result = store.append_encrypted_envelope(
        host.session_id,
        mobile.device_id,
        {"type": "prompt.submit", "text": "plaintext"},
    )

    assert result.status == FAILED
    assert result.reason == "payload_not_encrypted"


def test_relay_core_replays_from_cursor():
    store, _clock, host, mobile = _paired_session()
    first = store.append_encrypted_envelope(
        host.session_id,
        host.device_id,
        {"message_type": "session.state", "ciphertext": "aaa", "nonce": "n1"},
    )
    second = store.append_encrypted_envelope(
        host.session_id,
        mobile.device_id,
        {"message_type": "prompt.submit", "ciphertext": "bbb", "nonce": "n2"},
    )

    replay = store.replay_since(host.session_id, mobile.device_id, cursor=first.next_cursor)

    assert second.status == SUCCESS
    assert replay.status == SUCCESS
    assert replay.next_cursor == second.next_cursor
    assert [message["seq"] for message in replay.messages] == [second.next_cursor]
    assert replay.messages[0]["envelope"]["ciphertext"] == "bbb"


def test_relay_core_blocks_revoked_device_replay():
    store, _clock, host, mobile = _paired_session()
    store.revoke_device(host.session_id, mobile.device_id)

    result = store.replay_since(host.session_id, mobile.device_id, cursor=0)

    assert result.status == FAILED
    assert result.reason == "device_not_authorized"
