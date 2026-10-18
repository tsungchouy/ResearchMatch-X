from __future__ import annotations


class AppError(Exception):
    """An error that is safe to show to the user."""

    def __init__(self, code: str, message: str, status: int = 400, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


def not_configured() -> AppError:
    return AppError(
        "LIVE_NOT_CONFIGURED",
        "Live search is not configured. Try the sample workflow.",
        status=503,
    )
