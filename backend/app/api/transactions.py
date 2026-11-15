from typing import Annotated

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, Query, Request
from fastapi.exceptions import RequestValidationError

from app.schemas.transactions import TransactionsQuery, TransactionsResponse
from app.services.transactions import TransactionsService

router = APIRouter(prefix="/api/v1", tags=["Transactions"])


@router.get("/transactions", response_model=TransactionsResponse)
def get_transactions(
    request: Request,
    query: Annotated[TransactionsQuery, Query()],
    service: Annotated[TransactionsService, Depends()],
) -> TransactionsResponse:
    names = [name for name, _ in request.query_params.multi_items()]

    if len(names) != len(set(names)):
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("query",),
                    "msg": "Duplicate query parameter",
                    "input": None,
                }
            ]
        )

    try:
        result = service.get_transactions(query)
    except ValueError as exc:
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("query",),
                    "msg": "Invalid transactions query",
                    "input": None,
                }
            ]
        ) from exc
    except (BotoCoreError, ClientError) as exc:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail="Transactions storage is temporarily unavailable",
        ) from exc

    return TransactionsResponse.model_validate(result)
