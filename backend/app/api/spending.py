from typing import Annotated

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException

from app.schemas.spending import SpendingResponse
from app.services.spending import SpendingService

router = APIRouter(prefix="/api/v1", tags=["Spending"])


@router.get("/spending/categories", response_model=SpendingResponse)
def get_spending_categories(
    service: Annotated[SpendingService, Depends()],
) -> SpendingResponse:
    try:
        result = service.get_current()
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Spending storage is temporarily unavailable",
        ) from exc

    return SpendingResponse.model_validate(result)
