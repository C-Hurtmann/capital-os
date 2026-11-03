from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.credit_limit import PostCreditLimitRequest


def test_valid_request_without_effective_from() -> None:
    request = PostCreditLimitRequest.model_validate({"amountMinor": 5_000_000})

    assert request.amount_minor == 5_000_000
    assert request.effective_from is None


def test_valid_request_with_effective_from() -> None:
    request = PostCreditLimitRequest.model_validate(
        {
            "amountMinor": 5_000_000,
            "effectiveFrom": "2026-10-15T12:00:00+03:00",
        }
    )

    assert request.effective_from is not None
    assert request.effective_from.astimezone(UTC) == datetime(
        2026, 10, 15, 9, 0, tzinfo=UTC
    )


@pytest.mark.parametrize("amount", [0, 2**53 - 1])
def test_valid_amount_boundaries(amount: int) -> None:
    request = PostCreditLimitRequest.model_validate({"amountMinor": amount})

    assert request.amount_minor == amount


@pytest.mark.parametrize(
    "amount",
    [-1, 2**53, "5000000", 5.5, 5.0, True, None],
)
def test_invalid_amount(amount: object) -> None:
    with pytest.raises(ValidationError):
        PostCreditLimitRequest.model_validate({"amountMinor": amount})


@pytest.mark.parametrize(
    "effective_from",
    [
        None,
        1_700_000_000,
        "2026-10-15",
        "2026-10-15T12:00:00",
        "invalid-date",
    ],
)
def test_invalid_effective_from(effective_from: object) -> None:
    with pytest.raises(ValidationError):
        PostCreditLimitRequest.model_validate(
            {
                "amountMinor": 5_000_000,
                "effectiveFrom": effective_from,
            }
        )


def test_future_effective_from_rejected() -> None:
    future = datetime.now(UTC) + timedelta(days=1)

    with pytest.raises(ValidationError):
        PostCreditLimitRequest.model_validate(
            {
                "amountMinor": 5_000_000,
                "effectiveFrom": future.isoformat(),
            }
        )


def test_unknown_fields_rejected() -> None:
    with pytest.raises(ValidationError):
        PostCreditLimitRequest.model_validate(
            {
                "amountMinor": 5_000_000,
                "accountId": "monobank-main",
            }
        )


def test_missing_amount_rejected() -> None:
    with pytest.raises(ValidationError):
        PostCreditLimitRequest.model_validate({})
