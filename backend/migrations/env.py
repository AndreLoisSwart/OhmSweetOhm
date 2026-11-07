from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

from app.core.config import settings
from app.core.db import Base, UTCDateTime, create_db_engine, import_all_models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import_all_models()
target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    # UTCDateTime is a plain DATETIME column; keep app imports out of migrations.
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    settings.ensure_data_dirs()
    # Foreign keys off: SQLite batch migrations recreate tables, which would
    # otherwise trip or cascade through them. Checked once the migration is done.
    engine = create_db_engine(settings.database_url, foreign_keys=False)
    with engine.connect() as connection:
        # render_as_batch: SQLite can't ALTER most things, so Alembic recreates tables.
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()
        violations = connection.execute(text("PRAGMA foreign_key_check")).all()
        if violations:
            raise RuntimeError(f"Migration left foreign key violations: {violations}")
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
