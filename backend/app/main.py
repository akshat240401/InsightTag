"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.config import get_settings
from app.database import DEFAULT_DATABASE_PATH, initialize_database
from app.openrouter import OpenRouterClient
from app.routes import router


def create_app(
    database_path: str | Path = DEFAULT_DATABASE_PATH,
    llm_client: OpenRouterClient | None = None,
) -> FastAPI:
    """Create an application using the supplied SQLite database path."""
    resolved_database_path = Path(database_path)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        initialize_database(resolved_database_path)
        yield

    application = FastAPI(title="InsightTag API", lifespan=lifespan)
    application.state.database_path = resolved_database_path
    application.state.llm_client = llm_client or OpenRouterClient.from_settings(
        get_settings()
    )
    application.include_router(router)
    return application


app = create_app()
