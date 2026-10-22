#!/usr/bin/env python3
"""Local dev server with SPA fallback (serves 404.html for unknown paths)."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, *args, **kwargs):
        if code == 404:
            self.path = "/404.html"
            return self.do_GET()
        super().send_error(code, *args, **kwargs)

    def log_message(self, fmt, *args):
        pass  # suppress per-request noise


os.chdir(ROOT)
print(f"Serving {ROOT} at http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), SPAHandler).serve_forever()
