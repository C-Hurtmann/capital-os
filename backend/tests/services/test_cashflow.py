from datetime import UTC, datetime

import pytest

from app.models.transaction import Transaction
from app.services.cashflow import (
    CashflowTotals,
    month_bounds_utc,
    summarize_cashflow,
    summarize_monthly_cashflow,
)


@pytest.mark.parametrize(
    ("year", "month", "expected_start", "expected_end"),
    [
        (
            2026,
            3,
            datetime(2026, 2, 28, 22, tzinfo=UTC),
            datetime(2026, 3, 31, 21, tzinfo=UTC),
        ),
        (
            2026,
            10,
            datetime(2026, 9, 30, 21, tzinfo=UTC),
            datetime(2026, 10, 31, 22, tzinfo=UTC),
        ),
        (
            2026,
            12,
            datetime(2026, 11, 30, 22, tzinfo=UTC),
            datetime(2026, 12, 31, 22, tzinfo=UTC),
        ),
    ],
)
def test_month_bounds_utc(
    year: int,
    month: int,
    expected_start: datetime,
    expected_end: datetime,
) -> None:
    assert month_bounds_utc(year, month) == (
        expected_start,
        expected_end,
    )


def test_summarize_cashflow() -> None:
    base_transaction = Transaction(
        bank_id="tx-1",
        occurred_at=datetime(2026, 11, 2, tzinfo=UTC),
        amount_minor=0,
        operation_amount_minor=0,
        operation_currency_code=980,
        balance_minor=0,
        mcc=5411,
        commission_minor=0,
    )

    transactions = [
        base_transaction.model_copy(
            update={"amount_minor": 3000},
        ),
        base_transaction.model_copy(
            update={"amount_minor": -1000, "commission_minor": 100},
        ),
        base_transaction.model_copy(
            update={"amount_minor": -2500},
        ),
        base_transaction,
    ]

    result = summarize_cashflow(transactions)

    assert result == CashflowTotals(
        income_minor=3000,
        expenses_minor=-3500,
        net_minor=-500,
    )


def test_summarize_cashflow_empty() -> None:
    assert summarize_cashflow([]) == CashflowTotals(
        income_minor=0,
        expenses_minor=0,
        net_minor=0,
    )


def test_summarize_monthly_cashflow_uses_kyiv_timezone() -> None:
    base = Transaction(
        bank_id="tx-1",
        occurred_at=datetime(2026, 9, 30, 20, 30, tzinfo=UTC),
        amount_minor=1000,
        operation_amount_minor=1000,
        operation_currency_code=980,
        balance_minor=0,
        mcc=5411,
        commission_minor=0,
    )

    transactions = [
        base,
        base.model_copy(
            update={
                "bank_id": "tx-2",
                "occurred_at": datetime(2026, 9, 30, 21, 30, tzinfo=UTC),
                "amount_minor": -300,
            }
        ),
        base.model_copy(
            update={
                "bank_id": "tx-3",
                "occurred_at": datetime(2026, 10, 31, 22, 30, tzinfo=UTC),
                "amount_minor": 200,
            }
        ),
    ]

    result = summarize_monthly_cashflow(transactions)

    assert result == {
        (2026, 9): CashflowTotals(1000, 0, 1000),
        (2026, 10): CashflowTotals(0, -300, -300),
        (2026, 11): CashflowTotals(200, 0, 200),
    }
