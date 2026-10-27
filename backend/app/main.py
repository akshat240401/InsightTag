"""FastAPI application entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import DEFAULT_DATABASE_PATH, initialize_database
from app.errors import ApplicationError
from app.openrouter import OpenRouterClient
from app.routes import router

logger = logging.getLogger(__name__)


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

    @application.exception_handler(ApplicationError)
    async def application_error_handler(
        _: Request,
        exc: ApplicationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
            headers=exc.headers,
        )

    @application.exception_handler(Exception)
    async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "Unhandled application error category=internal exception_type=%s",
            type(exc).__name__,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected server error occurred.",
                }
            },
        )

    application.include_router(router)
    return application


app = create_app()
