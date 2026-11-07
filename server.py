"""خادم محلي صغير لتشغيل التطبيق على الحاسوب وفتحه من الهاتف عبر نفس شبكة الويفي.

الاستعمال:  python server.py   ثم افتح العنوان الذي يظهر.
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = Path(__file__).resolve().parent


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".m3u": "audio/x-mpegurl",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler) as httpd:
        ip = lan_ip()
        print()
        print("  Open TV is running / tilfaz maftouh yaamal")
        print(f"  PC     : http://localhost:{PORT}")
        print(f"  Phone  : http://{ip}:{PORT}   (same Wi-Fi network)")
        print()
        print("  Keep this window open. Close it to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
