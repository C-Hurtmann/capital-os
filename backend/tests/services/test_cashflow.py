from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.repositories.transactions import TransactionRepository
from app.services.cashflow import CashflowResult, CashflowService


def make_repository(amounts: list[int]) -> Mock:
    repository = Mock(spec=TransactionRepository)
    transactions = [SimpleNamespace(amount_minor=amount) for amount in amounts]
    repository.query_period_page.return_value = (
        transactions,
        None,
    )
    return repository


def calculate_at(
    repository: Mock,
    instant: datetime,
) -> CashflowResult:
    with patch(
        "app.services.cashflow.datetime",
        wraps=datetime,
    ) as mocked_datetime:
        mocked_datetime.now.return_value = instant

        result = CashflowService(repository).get_current()

        mocked_datetime.now.assert_called_once_with(UTC)

    return result


@pytest.mark.parametrize(
    ("amounts", "expected_income", "expected_expense"),
    [
        ([], 0, 0),
        ([5000], 5000, 0),
        ([-3000], 0, 3000),
        ([5000, -5000], 5000, 5000),
        ([10000, -4000, 1000], 11000, 4000),
        ([-8000, -2000], 0, 10000),
    ],
)
def test_cashflow_totals(
    amounts: list[int],
    expected_income: int,
    expected_expense: int,
) -> None:
    repository = make_repository(amounts)

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
    )

    assert result.income_minor == expected_income
    assert result.expense_minor == expected_expense
    assert result.net_minor == (expected_income - expected_expense)


def test_current_month_period_and_cutoff() -> None:
    repository = make_repository([1000])

    result = calculate_at(
        repository,
        datetime(
            2026,
            11,
            10,
            12,
            34,
            56,
            123456,
            tzinfo=UTC,
        ),
    )

    assert result.from_date.isoformat() == "2026-11-01"
    assert result.to_date.isoformat() == "2026-11-10"

    assert result.computed_at == datetime(
        2026,
        11,
        10,
        12,
        34,
        56,
        123000,
        tzinfo=UTC,
    )

    repository.query_period_page.assert_called_once_with(
        from_ms=int(datetime(2026, 10, 31, 22, tzinfo=UTC).timestamp() * 1000),
        to_ms=int(result.computed_at.timestamp() * 1000),
        exclusive_start_key=None,
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
def test_month_boundaries_respect_kyiv_dst(
    instant: datetime,
    expected_start: datetime,
) -> None:
    repository = make_repository([])

    calculate_at(repository, instant)

    assert repository.query_period_page.call_args.kwargs["from_ms"] == int(
        expected_start.timestamp() * 1000
    )


def test_first_millisecond_of_new_month() -> None:
    repository = make_repository([])

    result = calculate_at(
        repository,
        datetime(
            2026,
            11,
            30,
            22,
            0,
            0,
            999,
            tzinfo=UTC,
        ),
    )

    assert result.from_date.isoformat() == "2026-12-01"
    assert result.to_date.isoformat() == "2026-12-01"
    assert result.income_minor == 0
    assert result.expense_minor == 0

    repository.query_period_page.assert_not_called()


def test_reads_all_dynamodb_pages() -> None:
    repository = make_repository([])

    next_key = {
        "PK": {"S": "ACCOUNT#test"},
        "SK": {"S": "TX#123"},
    }

    repository.query_period_page.side_effect = [
        ([SimpleNamespace(amount_minor=5000)], next_key),
        ([SimpleNamespace(amount_minor=-2000)], None),
    ]

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
    )

    assert result.income_minor == 5000
    assert result.expense_minor == 2000
    assert result.net_minor == 3000

    first_call, second_call = repository.query_period_page.call_args_list

    assert first_call.kwargs["exclusive_start_key"] is None
    assert second_call.kwargs["exclusive_start_key"] == next_key

    assert repository.query_period_page.call_count == 2


def test_second_page_failure_propagates() -> None:
    repository = make_repository([])

    next_key = {"SK": {"S": "TX#123"}}
    error = ClientError(
        {
            "Error": {
                "Code": "ProvisionedThroughputExceededException",
                "Message": "Throughput exceeded",
            }
        },
        "Query",
    )

    repository.query_period_page.side_effect = [
        ([SimpleNamespace(amount_minor=5000)], next_key),
        error,
    ]

    with pytest.raises(ClientError):
        calculate_at(
            repository,
            datetime(2026, 11, 10, 12, tzinfo=UTC),
        )

    assert repository.query_period_page.call_count == 2
