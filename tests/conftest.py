"""Shared pytest fixtures."""
from __future__ import annotations

import sys
import threading
import time
import urllib.request
from pathlib import Path

import pytest
from werkzeug.serving import make_server

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import app as flask_app  # noqa: E402


@pytest.fixture(scope="session")
def app():
    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture()
def client(app):
    return app.test_client()


class _ServerThread(threading.Thread):
    def __init__(self, wsgi_app, port: int):
        super().__init__(daemon=True)
        self.server = make_server("127.0.0.1", port, wsgi_app)

    def run(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()


@pytest.fixture(scope="session")
def live_server(app):
    server = _ServerThread(app, 0)
    port = server.server.server_port
    server.start()
    base_url = f"http://127.0.0.1:{port}"

    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{base_url}/", timeout=1).read()
            break
        except Exception:
            time.sleep(0.1)
    else:
        server.shutdown()
        raise RuntimeError("live_server failed to start within 10s")

    yield base_url
    server.shutdown()
