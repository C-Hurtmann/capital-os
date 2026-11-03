import logging
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler as default_http_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.credit_limit import router as credit_limit_router
from app.api.health import router as health_router

logger = logging.getLogger(__name__)


app = FastAPI(
    title="Capital OS API",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(credit_limit_router)


@app.exception_handler(Exception)
async def handle_unexpected_error(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    request_id = str(uuid4())

    logger.error(
        "Unhandled error: request_id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )

    return JSONResponse(
        status_code=500,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An unexpected error occurred",
            "requestId": request_id,
        },
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(
    request: Request,
    exc: StarletteHTTPException,
) -> Response:
    titles = {
        415: "Unsupported Media Type",
        503: "Service Unavailable",
    }

    if exc.status_code not in titles:
        return await default_http_exception_handler(request, exc)

    request_id = str(uuid4())

    logger.warning(
        "Request failed: request_id=%s method=%s path=%s status=%s",
        request_id,
        request.method,
        request.url.path,
        exc.status_code,
    )

    return JSONResponse(
        status_code=exc.status_code,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": titles[exc.status_code],
            "status": exc.status_code,
            "detail": str(exc.detail),
            "requestId": request_id,
        },
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    invalid_json = any(error["type"] == "json_invalid" for error in exc.errors())

    status_code = 400 if invalid_json else 422
    request_id = str(uuid4())

    logger.warning(
        "Request rejected: request_id=%s method=%s path=%s status=%s",
        request_id,
        request.method,
        request.url.path,
        status_code,
    )

    return JSONResponse(
        status_code=status_code,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": "Bad Request" if invalid_json else "Unprocessable Content",
            "status": status_code,
            "detail": (
                "Malformed JSON request body"
                if invalid_json
                else "Request validation failed"
            ),
            "requestId": request_id,
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, port=8001)
