from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OHM_")

    # The add-on image sets OHM_DATA_DIR=/data. The default suits local dev.
    data_dir: Path = REPO_DIR / ".data"
    # Built frontend served by FastAPI. Missing in dev, where Vite serves it instead.
    frontend_dist: Path = REPO_DIR / "frontend" / "dist"
    # Keeps a mistaken upload from bloating every HA backup.
    max_upload_mb: int = 50
    # Addresses or networks (CIDR) whose requests are trusted as already logged in
    # (see core/access.py).
    # The add-on narrows this to HA's Ingress gateway; loopback is for local dev, where
    # Vite and the Ingress stand-in connect from this machine.
    trusted_clients: list[str] = ["172.30.32.2", "127.0.0.1", "::1"]

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'ohm-sweet-ohm.db'}"

    @property
    def attachments_dir(self) -> Path:
        return self.data_dir / "attachments"

    def ensure_data_dirs(self) -> None:
        self.attachments_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
