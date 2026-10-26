"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.database import DEFAULT_DATABASE_PATH, initialize_database
from app.routes import router


def create_app(database_path: str | Path = DEFAULT_DATABASE_PATH) -> FastAPI:
    """Create an application using the supplied SQLite database path."""
    resolved_database_path = Path(database_path)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        initialize_database(resolved_database_path)
        yield

    application = FastAPI(title="InsightTag API", lifespan=lifespan)
    application.state.database_path = resolved_database_path
    application.include_router(router)
    return application


app = create_app()
