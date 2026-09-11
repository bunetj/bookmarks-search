#!/usr/bin/env python3
# launch.py — cross-platform launcher

import subprocess
import sys

def print_header():
    print("=" * 50)
    print("  FF Bookmark Search Engine v0.3")
    print("=" * 50)
    print()

def run_server():
    print("[1/1] Starting server...")
    subprocess.run([sys.executable, "server.py"])

if __name__ == "__main__":
    print_header()
    run_server()