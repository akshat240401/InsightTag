"""Small, safe application error contract shared by API routes and providers."""

from http import HTTPStatus


class ApplicationError(Exception):
    """An expected failure that can be safely returned to an API client."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.headers = headers


class ProviderNotConfiguredError(ApplicationError):
    def __init__(self, message: str = "The AI provider is not configured.") -> None:
        super().__init__(
            "PROVIDER_NOT_CONFIGURED",
            message,
            HTTPStatus.SERVICE_UNAVAILABLE,
        )


class ProviderAuthenticationError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            "PROVIDER_AUTH_FAILED",
            "The AI provider rejected its credentials.",
            HTTPStatus.BAD_GATEWAY,
        )


class ProviderRateLimitError(ApplicationError):
    def __init__(self, retry_after: str | None = None) -> None:
        headers = {"Retry-After": retry_after} if retry_after else None
        super().__init__(
            "PROVIDER_RATE_LIMITED",
            "The AI provider is rate limited. Please try again later.",
            HTTPStatus.SERVICE_UNAVAILABLE,
            headers,
        )
        self.retry_after = retry_after


class ProviderTimeoutError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            "PROVIDER_TIMEOUT",
            "The AI provider did not respond in time.",
            HTTPStatus.GATEWAY_TIMEOUT,
        )


class ProviderUnavailableError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            "PROVIDER_UNAVAILABLE",
            "The AI provider is temporarily unavailable.",
            HTTPStatus.BAD_GATEWAY,
        )


class InvalidModelOutputError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            "INVALID_MODEL_OUTPUT",
            "The AI provider returned invalid output.",
            HTTPStatus.BAD_GATEWAY,
        )


class EntryNotFoundError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            "ENTRY_NOT_FOUND",
            "Entry not found.",
            HTTPStatus.NOT_FOUND,
        )


class DatabaseError(ApplicationError):
    def __init__(self) -> None:
        super().__init__(
            "DATABASE_ERROR",
            "The database operation could not be completed.",
            HTTPStatus.INTERNAL_SERVER_ERROR,
        )
