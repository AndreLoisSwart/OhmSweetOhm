from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class NotFoundError(Exception):
    """A referenced record doesn't exist. Returned as 404."""


class ConflictError(Exception):
    """The change breaks a rule, e.g. a cycle or a record still in use. Returned as 409."""


class TooLargeError(Exception):
    """An upload over the size limit. Returned as 413."""


def register_error_handlers(app: FastAPI) -> None:
    for exc_type, status in ((NotFoundError, 404), (ConflictError, 409), (TooLargeError, 413)):

        def handler(_request: Request, exc: Exception, status: int = status) -> JSONResponse:
            return JSONResponse({"detail": str(exc)}, status_code=status)

        app.add_exception_handler(exc_type, handler)
