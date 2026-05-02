"""HTML renderer for the desktop pairing page."""

import html
from typing import Any, Dict, Optional


PAIRING_PAGE_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Pocket Vibe Pairing</title>
  <style>
    body {{
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }}
    .card {{
      width: min(720px, calc(100vw - 32px));
      background: #111827;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    }}
    .meta {{
      display: grid;
      gap: 8px;
      margin-bottom: 20px;
    }}
    .label {{
      color: #94a3b8;
      font-size: 13px;
    }}
    .value {{
      font-size: 15px;
      word-break: break-all;
    }}
    .qr {{
      background: white;
      border-radius: 16px;
      padding: 16px;
      display: inline-flex;
      margin-bottom: 16px;
    }}
    .qr img {{
      width: min(320px, 60vw);
      height: auto;
      display: block;
    }}
    a {{
      color: #38bdf8;
    }}
    .hint {{
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.6;
    }}
  </style>
</head>
<body>
  <main class="card">
    <h1>Pocket Vibe Pairing</h1>
    <p class="hint">Open this page on your desktop and let your phone scan the QR code below. If scanning still fails, open the mobile link directly on your phone.</p>
    <p class="hint">For different networks, VPN, or tunnel setups, use the explicit backend URLs shown below instead of relying on LAN auto-discovery.</p>
    <div class="qr">{qr_markup}</div>
    <div class="meta">
      <div>
        <div class="label">Token</div>
        <div class="value">{token}</div>
      </div>
      <div>
        <div class="label">Mobile Link</div>
        <div class="value"><a href="{target_url}" target="_blank" rel="noreferrer">{target_url}</a></div>
      </div>
      <div>
        <div class="label">Pairing Page</div>
        <div class="value"><a href="{pairing_page_url}" target="_blank" rel="noreferrer">{pairing_page_url}</a></div>
      </div>
      <div>
        <div class="label">Backend WS</div>
        <div class="value">{backend_ws_url}</div>
      </div>
      <div>
        <div class="label">Backend API</div>
        <div class="value">{api_base_url}</div>
      </div>
      <div>
        <div class="label">Connection Mode</div>
        <div class="value">{connection_mode}</div>
      </div>
      <div>
        <div class="label">Auth Mode</div>
        <div class="value">{auth_mode}</div>
      </div>
    </div>
  </main>
</body>
</html>"""


def _escape_pairing_values(pairing: Dict[str, Any]) -> Dict[str, str]:
    return {
        "token": html.escape(str(pairing["token"])),
        "target_url": html.escape(str(pairing["target_url"])),
        "pairing_page_url": html.escape(str(pairing["pairing_page_url"])),
        "auth_mode": html.escape(str(pairing["auth_mode"])),
        "api_base_url": html.escape(str(pairing["api_base_url"])),
        "backend_ws_url": html.escape(str(pairing["backend_ws_url"])),
        "connection_mode": html.escape(str(pairing["connection_mode"])),
    }


def _qr_markup(pairing: Dict[str, Any], qr_svg: Optional[str]) -> str:
    if not qr_svg:
        return "<p style='color:#b91c1c'>QR generation is unavailable. Open the mobile link below on your phone.</p>"
    qr_svg_url = html.escape(str(pairing["qr_svg_url"]))
    return f'<img src="{qr_svg_url}" alt="Pocket Vibe QR Code" loading="eager" />'


def build_pairing_page_html(pairing: Dict[str, Any], qr_svg: Optional[str]) -> str:
    values = _escape_pairing_values(pairing)
    values["qr_markup"] = _qr_markup(pairing, qr_svg)
    return PAIRING_PAGE_TEMPLATE.format(**values)
