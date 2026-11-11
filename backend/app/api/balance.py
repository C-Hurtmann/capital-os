import logging
from typing import Annotated

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException

from app.constants import ACCOUNT_ID_PLACEHOLDER
from app.repositories.balance import BalanceRepository
from app.repositories.credit_limit import CreditLimitRepository
from app.schemas.balance import BalanceResponse

router = APIRouter(prefix="/api/v1", tags=["Balance"])

logger = logging.getLogger(__name__)


@router.get("/balance")
def get_balance(
    balance_repository: Annotated[
        BalanceRepository,
        Depends(BalanceRepository.get_repository),
    ],
    credit_repository: Annotated[
        CreditLimitRepository,
        Depends(CreditLimitRepository.get_repository),
    ],
) -> BalanceResponse | None:
    try:
        snapshot = balance_repository.get_snapshot(ACCOUNT_ID_PLACEHOLDER)
        if snapshot is None:
            raise HTTPException(
                status_code=503,
                detail="Bank balance snapshot is unavailable",
            )

        bank_balance = snapshot.bank_balance_minor
        credit_limit = credit_repository.get_current(ACCOUNT_ID_PLACEHOLDER)

        own_funds = None
        credit_used = None

        if bank_balance < 0:
            logger.warning("Negative bank balance in stored snapshot")
        elif credit_limit is not None:
            limit = credit_limit.credit_limit_minor
            own_funds = max(bank_balance - limit, 0)
            credit_used = max(limit - bank_balance, 0)

        return BalanceResponse(
            bank_balance_minor=bank_balance,
            own_funds_minor=own_funds,
            credit_used_minor=credit_used,
            fetched_at=snapshot.fetched_at,
        )

    except ClientError as exc:
        if exc.response["Error"]["Code"] in {
            "ProvisionedThroughputExceededException",
            "ThrottlingException",
            "RequestLimitExceeded",
        }:
            raise HTTPException(
                status_code=503,
                detail="Balance storage is temporarily unavailable",
            ) from exc
