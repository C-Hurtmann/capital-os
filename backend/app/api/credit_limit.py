from datetime import UTC, datetime
from typing import Annotated

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Request

from app.constants import ACCOUNT_ID_PLACEHOLDER
from app.models.credit_limit import CreditLimit
from app.repositories.credit_limit import CreditLimitRepository
from app.schemas.credit_limit import CreditLimitResponse, PostCreditLimitRequest

router = APIRouter(prefix="/api/v1", tags=["Credit Limit"])


@router.get("/credit-limit")
def get_credit_limit(
    repository: Annotated[
        CreditLimitRepository, Depends(CreditLimitRepository.get_repository)
    ],
) -> CreditLimitResponse:
    if not (credit_limit := repository.get_current(ACCOUNT_ID_PLACEHOLDER)):
        return CreditLimitResponse(amount_minor=None, effective_from=None)

    return CreditLimitResponse(
        amount_minor=credit_limit.credit_limit_minor,
        effective_from=credit_limit.effective_from,
    )


def require_json_content_type(request: Request) -> None:
    content_type = request.headers.get("content-type", "")
    media_type = content_type.split(";", 1)[0].strip().lower()

    if media_type != "application/json":
        raise HTTPException(
            status_code=415,
            detail="Content-Type must be application/json",
        )


@router.post(
    "/credit-limit",
    response_model=CreditLimitResponse,
    dependencies=[Depends(require_json_content_type)],
)
def post_credit_limit(
    request: PostCreditLimitRequest,
    repository: Annotated[
        CreditLimitRepository, Depends(CreditLimitRepository.get_repository)
    ],
) -> CreditLimitResponse:
    credit_limit = CreditLimit(
        account_id=ACCOUNT_ID_PLACEHOLDER,
        credit_limit_minor=request.amount_minor,
        effective_from=request.effective_from or datetime.now(UTC),
    )

    try:
        saved = repository.set_current(credit_limit)
    except ClientError as exc:
        if exc.response["Error"]["Code"] in {
            "ProvisionedThroughputExceededException",
            "ThrottlingException",
            "RequestLimitExceeded",
        }:
            raise HTTPException(
                status_code=503,
                detail="Credit limit storage is temporarily unavailable",
            ) from exc
        raise

    return CreditLimitResponse(
        amount_minor=saved.credit_limit_minor,
        effective_from=saved.effective_from,
    )
