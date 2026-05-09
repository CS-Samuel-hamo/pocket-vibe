from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.main as backend_main
from backend.relay_api import build_relay_router


def test_main_app_keeps_relay_api_disabled_by_default():
    assert backend_main.RELAY_API_ENABLED is False
    assert not any(route.path.startswith("/api/relay") for route in backend_main.app.routes)


def _client():
    app = FastAPI()
    app.include_router(build_relay_router())
    return TestClient(app)


def _pair_mobile(client):
    host = client.post("/api/relay/hosts", json={"host_id": "host-1", "label": "Workstation"})
    assert host.status_code == 200
    host_payload = host.json()
    pairing = client.post("/api/relay/hosts/host-1/pairing-code", json={"ttl_seconds": 60})
    assert pairing.status_code == 200
    mobile = client.post("/api/relay/pair", json={"code": pairing.json()["code"], "label": "Phone"})
    assert mobile.status_code == 200
    return host_payload, mobile.json()


def _post_message(client, session_id, device_id, envelope):
    return client.post(
        f"/api/relay/sessions/{session_id}/messages",
        json={"device_id": device_id, "envelope": envelope},
    )


def _replay(client, session_id, device_id, cursor=0):
    return client.get(
        f"/api/relay/sessions/{session_id}/messages",
        params={"device_id": device_id, "cursor": cursor},
    )


def _assert_plaintext_rejected(response):
    assert response.status_code == 400
    assert response.json()["reason"] == "payload_not_encrypted"
    assert response.json()["error_code"] == "PV-DIAG-002"


def _append_ciphertext_message(client, session_id, device_id):
    response = _post_message(
        client,
        session_id,
        device_id,
        {"message_type": "prompt.submit", "ciphertext": "aaa", "nonce": "n1"},
    )
    assert response.status_code == 200
    assert response.json()["next_cursor"] == 1


def test_relay_api_pairs_routes_and_replays_encrypted_messages():
    client = _client()
    host_payload, mobile_payload = _pair_mobile(client)

    assert host_payload["ok"] is True
    assert host_payload["session_id"]
    assert host_payload["device_id"]
    assert mobile_payload["ok"] is True
    assert mobile_payload["session_id"] == host_payload["session_id"]

    plaintext = _post_message(
        client,
        host_payload["session_id"],
        mobile_payload["device_id"],
        {"message_type": "prompt.submit", "text": "plaintext"},
    )
    _assert_plaintext_rejected(plaintext)

    _append_ciphertext_message(client, host_payload["session_id"], mobile_payload["device_id"])

    replay = _replay(client, host_payload["session_id"], mobile_payload["device_id"])
    assert replay.status_code == 200
    assert replay.json()["messages"][0]["envelope"]["ciphertext"] == "aaa"


def test_relay_api_revokes_devices_immediately():
    client = _client()
    host, mobile = _pair_mobile(client)

    revoked = client.delete(f"/api/relay/sessions/{host['session_id']}/devices/{mobile['device_id']}")
    replay = _replay(client, host["session_id"], mobile["device_id"])

    assert revoked.status_code == 200
    assert replay.status_code == 400
    assert replay.json()["reason"] == "device_not_authorized"
    assert replay.json()["error_code"] == "PV-AUTH-003"


def test_relay_api_returns_error_code_for_expired_or_invalid_pairing():
    client = _client()

    invalid = client.post("/api/relay/pair", json={"code": "missing"})
    orphan_code = client.post("/api/relay/hosts/missing/pairing-code", json={})

    assert invalid.status_code == 400
    assert invalid.json()["error_code"] == "PV-AUTH-003"
    assert orphan_code.status_code == 400
    assert orphan_code.json()["error_code"] == "PV-RELAY-004"
