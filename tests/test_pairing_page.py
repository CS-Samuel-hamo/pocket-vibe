"""Tests for the desktop pairing page renderer."""

from backend.pairing_page import build_pairing_page_html


def _pairing_payload():
    return {
        "token": "token<unsafe>",
        "target_url": "http://phone.example/?q=<script>",
        "pairing_page_url": "http://desktop.example/",
        "auth_mode": "configured",
        "api_base_url": "http://desktop.example:8000",
        "backend_ws_url": "ws://desktop.example:8000/ws",
        "connection_mode": "lan",
        "qr_svg_url": "http://desktop.example/api/pairing/qr.svg",
    }


def test_pairing_page_escapes_user_visible_values():
    rendered = build_pairing_page_html(_pairing_payload(), qr_svg="<svg />")

    assert "token&lt;unsafe&gt;" in rendered
    assert "q=&lt;script&gt;" in rendered
    assert "<script>" not in rendered


def test_pairing_page_falls_back_when_qr_is_unavailable():
    rendered = build_pairing_page_html(_pairing_payload(), qr_svg=None)

    assert "QR generation is unavailable" in rendered
    assert "http://desktop.example/api/pairing/qr.svg" not in rendered
