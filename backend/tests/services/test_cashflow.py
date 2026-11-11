from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.repositories.transactions import TransactionRepository
from app.services.cashflow import (
    CashflowResult,
    CashflowService,
    MonthlyCashflowResult,
)


def make_transaction(
    amount: int,
    occurred_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        amount_minor=amount,
        occurred_at=occurred_at or datetime(2026, 11, 10, 12, tzinfo=UTC),
    )


def make_repository(transactions: list | None = None) -> Mock:
    repository = Mock(spec=TransactionRepository)
    repository.query_period.return_value = transactions or []
    return repository


def calculate_at(
    repository: Mock,
    instant: datetime,
    *,
    monthly: bool = False,
) -> CashflowResult | MonthlyCashflowResult:
    with patch(
        "app.services.cashflow.datetime",
        wraps=datetime,
    ) as mocked_datetime:
        mocked_datetime.now.return_value = instant

        service = CashflowService(repository)
        result = service.get_monthly_trend() if monthly else service.get_current()

        mocked_datetime.now.assert_called_once_with(UTC)

    return result


@pytest.mark.parametrize(
    ("amounts", "income", "expenses"),
    [
        ([], 0, 0),
        ([5000], 5000, 0),
        ([-3000], 0, 3000),
        ([5000, -5000], 5000, 5000),
        ([10000, -4000, 1000], 11000, 4000),
        ([-8000, -2000], 0, 10000),
    ],
)
def test_current_totals(
    amounts: list[int],
    income: int,
    expenses: int,
) -> None:
    repository = make_repository([make_transaction(amount) for amount in amounts])

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
    )

    assert result.income_minor == income
    assert result.expense_minor == expenses
    assert result.net_minor == income - expenses


def test_current_period_and_cutoff() -> None:
    repository = make_repository()

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, 34, 56, 123456, tzinfo=UTC),
    )

    assert result.from_date.isoformat() == "2026-11-01"
    assert result.to_date.isoformat() == "2026-11-10"
    assert result.computed_at == datetime(2026, 11, 10, 12, 34, 56, 123000, tzinfo=UTC)

    repository.query_period.assert_called_once_with(
        from_ms=int(datetime(2026, 10, 31, 22, tzinfo=UTC).timestamp() * 1000),
        to_ms=int(result.computed_at.timestamp() * 1000),
    )


@pytest.mark.parametrize(
    ("instant", "expected_start"),
    [
        (
            datetime(2026, 3, 29, 1, 30, tzinfo=UTC),
            datetime(2026, 2, 28, 22, tzinfo=UTC),
        ),
        (
            datetime(2026, 10, 25, 1, 30, tzinfo=UTC),
            datetime(2026, 9, 30, 21, tzinfo=UTC),
        ),
    ],
)
def test_current_month_respects_dst(
    instant: datetime,
    expected_start: datetime,
) -> None:
    repository = make_repository()

    calculate_at(repository, instant)

    assert repository.query_period.call_args.kwargs["from_ms"] == int(
        expected_start.timestamp() * 1000
    )


def test_first_millisecond_of_new_month() -> None:
    repository = make_repository()

    result = calculate_at(
        repository,
        datetime(2026, 11, 30, 22, 0, 0, 999, tzinfo=UTC),
    )

    assert result.from_date.isoformat() == "2026-12-01"
    assert result.to_date.isoformat() == "2026-12-01"
    assert result.income_minor == 0
    assert result.expense_minor == 0

    repository.query_period.assert_not_called()


def test_monthly_empty_period() -> None:
    repository = make_repository()

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        monthly=True,
    )

    assert len(result.months) == 12
    assert result.months[0].month == "2025-12"
    assert result.months[-1].month == "2026-11"
    assert all(
        month.income_minor == 0 and month.expense_minor == 0 for month in result.months
    )


def test_monthly_totals_and_empty_months() -> None:
    repository = make_repository(
        [
            make_transaction(
                5000,
                datetime(2025, 12, 15, 12, tzinfo=UTC),
            ),
            make_transaction(
                -2000,
                datetime(2026, 1, 15, 12, tzinfo=UTC),
            ),
            make_transaction(
                3000,
                datetime(2026, 10, 31, 22, 30, tzinfo=UTC),
            ),
            make_transaction(
                -1000,
                datetime(2026, 11, 10, 10, tzinfo=UTC),
            ),
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        monthly=True,
    )

    months = {item.month: item for item in result.months}

    assert months["2025-12"].income_minor == 5000
    assert months["2026-01"].expense_minor == 2000
    assert months["2026-02"].income_minor == 0
    assert months["2026-02"].expense_minor == 0

    # October 31 at 22:30 UTC is November 1 in Kyiv.
    assert months["2026-11"].income_minor == 3000
    assert months["2026-11"].expense_minor == 1000


def test_monthly_period_and_cutoff() -> None:
    repository = make_repository()

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, 34, 56, 123456, tzinfo=UTC),
        monthly=True,
    )

    assert result.from_date.isoformat() == "2025-12-01"
    assert result.to_date.isoformat() == "2026-11-10"
    assert result.computed_at == datetime(2026, 11, 10, 12, 34, 56, 123000, tzinfo=UTC)

    repository.query_period.assert_called_once_with(
        from_ms=int(datetime(2025, 11, 30, 22, tzinfo=UTC).timestamp() * 1000),
        to_ms=int(result.computed_at.timestamp() * 1000),
    )


def test_monthly_year_transition() -> None:
    repository = make_repository()

    result = calculate_at(
        repository,
        datetime(2027, 1, 15, 12, tzinfo=UTC),
        monthly=True,
    )

    assert result.months[0].month == "2026-02"
    assert result.months[-1].month == "2027-01"
    assert len(result.months) == 12


@pytest.mark.parametrize("monthly", [False, True])
def test_repository_failure_propagates(monthly: bool) -> None:
    repository = make_repository()
    repository.query_period.side_effect = ClientError(
        {
            "Error": {
                "Code": "ProvisionedThroughputExceededException",
                "Message": "Throughput exceeded",
            }
        },
        "Query",
    )

    with pytest.raises(ClientError):
        calculate_at(
            repository,
            datetime(2026, 11, 10, 12, tzinfo=UTC),
            monthly=monthly,
        )

    repository.query_period.assert_called_once()
