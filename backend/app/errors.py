"""Error envelope from api.md → Conventions: `{"detail": "human readable", "code": "snake_case_code"}`."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

_DEFAULT_CODES = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found",
                  405: "method_not_allowed", 409: "conflict", 422: "invalid"}


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, detail: str = ""):
        super().__init__(status_code=status_code, detail=detail or code.replace("_", " "))
        self.code = code


def forbidden(detail: str = "not allowed") -> ApiError:
    return ApiError(403, "forbidden", detail)


def not_found(what: str = "resource") -> ApiError:
    return ApiError(404, "not_found", f"{what} not found")


def install(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _http(request: Request, exc: HTTPException) -> JSONResponse:
        code = getattr(exc, "code", None) or _DEFAULT_CODES.get(exc.status_code, "error")
        return JSONResponse({"detail": exc.detail, "code": code}, status_code=exc.status_code,
                            headers=getattr(exc, "headers", None))
