"""The MCP access token: a long random secret kept in the data directory.

A file rather than the database, so the access check can read it without a session.
It lives in /data, so it survives restarts and updates (and is in HA backups).
"""

import hmac
import os
import secrets
from pathlib import Path

from app.core.config import settings

TOKEN_FILE = "mcp-token"


def _path() -> Path:
    return settings.data_dir / TOKEN_FILE


def _write(token: str) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    temp = _path().with_suffix(".tmp")
    # Readable by the app only; swapped in whole so a reader never sees half a token.
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(token)
    os.replace(temp, _path())


def get_token() -> str:
    """The current token, created the first time it's needed."""
    try:
        token = _path().read_text().strip()
    except FileNotFoundError:
        token = ""
    if not token:
        token = regenerate()
    return token


def regenerate() -> str:
    """A new token. The old one stops working at once."""
    token = secrets.token_urlsafe(32)
    _write(token)
    return token


def is_valid(candidate: str) -> bool:
    # Constant-time, so response timing doesn't leak how much of a guess was right.
    return hmac.compare_digest(candidate.encode(), get_token().encode())
