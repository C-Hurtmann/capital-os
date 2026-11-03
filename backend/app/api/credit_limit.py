from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.dynamodb import get_dynamodb_client
from app.core.settings import Settings
from app.repositories.credit_limit import CreditLimitRepository
from app.schemas.credit_limit import CreditLimitResponse

router = APIRouter(prefix="/api/v1", tags=["Credit Limit"])

ACCOUNT_ID = "monobank-main"


def get_credit_limit_repository(
    settings: Annotated[Settings, Depends(Settings.settings_cached)],
    client: Annotated[Any, Depends(get_dynamodb_client)],
) -> CreditLimitRepository:
    return CreditLimitRepository(
        client=client,
        table_name=settings.dynamodb_table_name,
    )


@router.get("/credit-limit")
def get_credit_limit(
    repository: Annotated[CreditLimitRepository, Depends(get_credit_limit_repository)],
) -> CreditLimitResponse:
    if not (credit_limit := repository.get_current(ACCOUNT_ID)):
        return CreditLimitResponse(amount_minor=None, effective_from=None)

    return CreditLimitResponse(
        amount_minor=credit_limit.credit_limit_minor,
        effective_from=credit_limit.effective_from,
    )
