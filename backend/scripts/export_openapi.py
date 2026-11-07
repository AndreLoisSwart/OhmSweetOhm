"""Writes the API's OpenAPI spec to a file without starting a server.

Run from backend/: uv run python -m scripts.export_openapi ../frontend/openapi.json
"""

import json
import sys
from pathlib import Path

from app.main import create_app

if __name__ == "__main__":
    spec = create_app().openapi()
    Path(sys.argv[1]).write_text(json.dumps(spec, indent=2) + "\n")
