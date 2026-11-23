#!/usr/bin/env python3
"""Serves the generated panel with a fake bridge so the UI can be exercised in
any browser:  python3 archicad/tests/ui/harness.py [port]  ->  http://localhost:8765/"""
import http.server
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
subprocess.run([sys.executable, str(ROOT / "tools" / "gen_ui.py")], check=True)
panel = (ROOT / "RFIX" / "Images" / "SpaceNodePanel.html").read_text(encoding="utf-8")
mock = (ROOT / "tests" / "ui" / "mock-bridge.js").read_text(encoding="utf-8")
html = panel.replace("<script>\n(function () {\n  'use strict';", "<script>" + mock + "</script>\n<script>\n(function () {\n  'use strict';", 1)
assert html != panel, "could not inject the mock bridge"
sample = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
          '<stop offset="0" stop-color="#d9d4c8"/><stop offset="1" stop-color="#8a8579"/></linearGradient></defs>'
          '<rect width="1920" height="1080" fill="url(#g)"/><rect x="260" y="520" width="1400" height="300" fill="#5b574f"/>'
          '<text x="960" y="360" font-size="64" text-anchor="middle" fill="#2b2a27" font-family="sans-serif">render de exemplo</text></svg>')


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0].split("#")[0]
        if path in ("/", "/index.html"):
            body, ctype = html.encode(), "text/html; charset=utf-8"
        elif path == "/sample.svg":
            body, ctype = sample.encode(), "image/svg+xml"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("UI harness on http://localhost:%d/ (hash scenarios: #lowres #no3d #short #lost #expire #warn #light)" % port)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
