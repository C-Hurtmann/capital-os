from typing import Annotated

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException

from app.schemas.cashflow import CashflowResponse
from app.services.cashflow import CashflowService

router = APIRouter(prefix="/api/v1", tags=["Cashflow"])


@router.get("/cashflow/current", response_model=CashflowResponse)
def get_current_cashflow(
    service: Annotated[CashflowService, Depends()],
) -> CashflowResponse:
    try:
        result = service.get_current()
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Cashflow storage is temporarily unavailable",
        ) from exc

    return CashflowResponse.model_validate(result)
