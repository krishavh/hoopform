#!/usr/bin/env python3
"""Serve hoopform/web with correct MIME types (mjs=JS, wasm=application/wasm)
so the self-hosted MediaPipe module loads properly. Offline & on-device."""
import http.server, functools, os, sys

HANDLERS = {
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".wasm": "application/wasm",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".json": "application/json",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".task": "application/octet-stream",
    ".png": "image/png",
    ".jpg": "image/jpeg",
}

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {".mjs": "text/javascript", ".wasm": "application/wasm",
                      **http.server.SimpleHTTPRequestHandler.extensions_map}
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

os.chdir("/home/onikita/projects/krishav-challenge-projects/hoopform/web")
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8771
http.server.ThreadingHTTPServer(("0.0.0.0", port), functools.partial(H, directory=os.getcwd())).serve_forever()
