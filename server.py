#!/usr/bin/env python3
# server.py — fixed rare port 49187

import os
import sys
import subprocess
import webbrowser
import time
import threading
import socket

PORT = 49187
URL = f"http://localhost:{PORT}"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return False
        except OSError:
            return True

def open_browser():
    time.sleep(1.5)
    webbrowser.open(URL)
    print(f"  🌐 Opened {URL}")

def run_server():
    if is_port_in_use(PORT):
        print(f"⚠️ Port {PORT} is already in use!")
        print(f"   Close the other server or change PORT in server.py")
        sys.exit(1)

    print("=" * 50)
    print("  FF Bookmark Search Engine v0.3")
    print("=" * 50)
    print(f"  🌐 Server running at: {URL}")
    print("  Press Ctrl+C to stop")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    subprocess.run([sys.executable, "-m", "http.server", str(PORT)])

if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        print("\n👋 Server stopped. Goodbye!")
        sys.exit(0)