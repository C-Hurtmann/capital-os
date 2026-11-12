from typing import Annotated

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query

from app.schemas.balance_history import BalanceHistoryResponse
from app.services.balance_history import (
    BalanceHistoryPreset,
    BalanceHistoryService,
)

router = APIRouter(prefix="/api/v1", tags=["Balance History"])


@router.get(
    "/balance-history",
    response_model=BalanceHistoryResponse,
)
def get_balance_history(
    service: Annotated[BalanceHistoryService, Depends()],
    preset: Annotated[
        BalanceHistoryPreset, Query()
    ] = BalanceHistoryPreset.THREE_MONTHS,
) -> BalanceHistoryResponse:
    try:
        result = service.get_history(preset)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Balance history storage is temporarily unavailable",
        ) from exc

    return BalanceHistoryResponse.model_validate(result)
