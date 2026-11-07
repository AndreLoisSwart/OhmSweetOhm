import importlib
import pkgutil
from collections.abc import Iterator
from datetime import UTC, datetime
from enum import StrEnum
from functools import cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Engine,
    Enum,
    MetaData,
    TypeDecorator,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

import app.modules
from app.core.config import settings

# Stable constraint names, so Alembic can find them again in later migrations.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UTCDateTime(TypeDecorator[datetime]):
    """Stored as naive UTC (SQLite has no time zones), returned as aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return value.astimezone(UTC).replace(tzinfo=None) if value is not None else None

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


def utcnow() -> datetime:
    return datetime.now(UTC)


def str_enum(enum: type[StrEnum], name: str) -> Enum:
    """An enum column stored as its string value, with a CHECK constraint."""
    return Enum(
        enum,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=max(len(m.value) for m in enum),
        values_callable=lambda e: [m.value for m in e],
    )


def one_owner_constraint(*columns: str) -> CheckConstraint:
    """For attachments: exactly one owner column is set. SQLite adds booleans as 0 and 1."""
    return CheckConstraint(
        " + ".join(f"({c} IS NOT NULL)" for c in columns) + " = 1", name="one_owner"
    )


def create_db_engine(url: str, *, foreign_keys: bool = True) -> Engine:
    # Sync endpoints run in a threadpool, so connections cross threads.
    engine = create_engine(url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record) -> None:
        cursor = dbapi_conn.cursor()
        # SQLite leaves foreign keys off by default; cascading deletes rely on them.
        cursor.execute(f"PRAGMA foreign_keys = {'ON' if foreign_keys else 'OFF'}")
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.execute("PRAGMA busy_timeout = 5000")
        cursor.close()

    return engine


@cache
def get_engine() -> Engine:
    settings.ensure_data_dirs()
    return create_db_engine(settings.database_url)


def get_session() -> Iterator[Session]:
    with sessionmaker(get_engine(), expire_on_commit=False)() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def import_all_models() -> None:
    """Import every module's models.py so Base.metadata knows all tables."""
    for module in pkgutil.iter_modules(app.modules.__path__):
        try:
            importlib.import_module(f"app.modules.{module.name}.models")
        except ModuleNotFoundError as e:
            if e.name != f"app.modules.{module.name}.models":
                raise
