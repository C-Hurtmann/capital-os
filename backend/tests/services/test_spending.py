from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.constants import MAX_SAFE_INTEGER
from app.repositories.transactions import TransactionRepository
from app.services.spending import SpendingResult, SpendingService


def make_transaction(amount: int, mcc: int = 100) -> SimpleNamespace:
    return SimpleNamespace(amount_minor=amount, mcc=mcc)


def make_repository(*transactions: SimpleNamespace) -> Mock:
    repository = Mock(spec=TransactionRepository)
    repository.query_period.return_value = list(transactions)
    return repository


def calculate_at(repository: Mock, instant: datetime) -> SpendingResult:
    with patch(
        "app.services.spending.datetime",
        wraps=datetime,
    ) as mocked_datetime:
        mocked_datetime.now.return_value = instant

        result = SpendingService(repository).get_current()

        mocked_datetime.now.assert_called_once_with(UTC)

    return result


def test_aggregates_expenses_and_sorts_categories() -> None:
    repository = make_repository(
        make_transaction(-3000, 100),
        make_transaction(-1000, 100),
        make_transaction(-4000, 200),
        make_transaction(-2000, 300),
        make_transaction(7000, 100),
        make_transaction(0, 200),
    )

    categories = {
        100: "groceries",
        200: "dining",
    }

    with patch(
        "app.services.spending.mcc_to_category_id",
        side_effect=lambda mcc: categories.get(mcc, "other"),
    ) as classify:
        result = calculate_at(
            repository,
            datetime(2026, 11, 10, 12, tzinfo=UTC),
        )

    assert result.total_minor == 10_000

    assert [(category.id, category.amount_minor) for category in result.categories] == [
        ("dining", 4000),
        ("groceries", 4000),
        ("other", 2000),
    ]

    # Positive and zero amounts are not classified.
    assert classify.call_count == 4


@pytest.mark.parametrize(
    "amounts",
    [
        (),
        (5000,),
        (0, 5000),
    ],
)
def test_no_expenses(amounts: tuple[int, ...]) -> None:
    repository = make_repository(*(make_transaction(amount) for amount in amounts))

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
    )

    assert result.total_minor == 0
    assert result.categories == ()


def test_current_month_period_and_cutoff() -> None:
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
def test_month_start_respects_kyiv_dst(
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
    assert result.total_minor == 0

    repository.query_period.assert_not_called()


def test_total_exceeding_safe_integer_fails() -> None:
    repository = make_repository(
        make_transaction(-MAX_SAFE_INTEGER),
        make_transaction(-1),
    )

    with pytest.raises(ValueError, match="safe integer"):
        calculate_at(
            repository,
            datetime(2026, 11, 10, 12, tzinfo=UTC),
        )


def test_repository_failure_propagates() -> None:
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
        )

    repository.query_period.assert_called_once()
