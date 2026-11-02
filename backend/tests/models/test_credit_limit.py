from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.models.credit_limit import CreditLimit


def test_credit_limit_accepts_zero() -> None:
    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=0,
        effective_from=datetime(2026, 11, 2, tzinfo=UTC),
    )

    assert credit_limit.credit_limit_minor == 0


def test_credit_limit_rejects_negative_amount() -> None:
    with pytest.raises(ValidationError):
        CreditLimit(
            account_id="monobank-main",
            credit_limit_minor=-100,
            effective_from=datetime.now(UTC),
        )


def test_credit_limit_requires_timezone() -> None:
    with pytest.raises(ValidationError):
        CreditLimit(
            account_id="monobank-main",
            credit_limit_minor=100000,
            effective_from=datetime(2026, 11, 2),
        )


def test_credit_limit_requires_account_id() -> None:
    with pytest.raises(ValidationError):
        CreditLimit(
            account_id="",
            credit_limit_minor=100000,
            effective_from=datetime.now(UTC),
        )
