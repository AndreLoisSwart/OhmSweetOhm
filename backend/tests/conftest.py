import os
import tempfile

# Before any app import: keep tests away from the real data directory.
os.environ["OHM_DATA_DIR"] = tempfile.mkdtemp(prefix="ohm-sweet-ohm-test-")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.db import Base, create_db_engine, get_session, import_all_models  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
def api(tmp_path) -> TestClient:
    """An API client on a fresh, empty database."""
    engine = create_db_engine(f"sqlite:///{tmp_path / 'test.db'}")
    import_all_models()
    Base.metadata.create_all(engine)
    make_session = sessionmaker(engine, expire_on_commit=False)

    def session_override():
        with make_session() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = session_override
    # As if through Ingress: a trusted address (see core/access.py).
    return TestClient(app, client=("127.0.0.1", 50000))
