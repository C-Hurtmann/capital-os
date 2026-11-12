from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.constants import KYIV_TZ, MAX_SAFE_INTEGER
from app.repositories.transactions import TransactionRepository
from app.services.balance_history import (
    BalanceHistoryPreset,
    BalanceHistoryResult,
    BalanceHistoryService,
)


def make_transaction(
    occurred_at: datetime,
    balance_minor: int,
    bank_id: str = "tx-1",
) -> SimpleNamespace:
    return SimpleNamespace(
        occurred_at=occurred_at,
        balance_minor=balance_minor,
        bank_id=bank_id,
    )


def make_repository(
    transactions: list | None = None,
    anchor: SimpleNamespace | None = None,
) -> Mock:
    repository = Mock(spec=TransactionRepository)
    repository.query_period.return_value = transactions or []
    repository.get_latest_before.return_value = anchor
    return repository


def calculate_at(
    repository: Mock,
    instant: datetime,
    preset: BalanceHistoryPreset | None = None,
) -> BalanceHistoryResult:
    with patch(
        "app.services.balance_history.datetime",
        wraps=datetime,
    ) as mocked_datetime:
        mocked_datetime.now.return_value = instant

        service = BalanceHistoryService(repository)
        result = (
            service.get_history() if preset is None else service.get_history(preset)
        )

        mocked_datetime.now.assert_called_once_with(UTC)

    return result


@pytest.mark.parametrize(
    ("preset", "expected_start"),
    [
        (BalanceHistoryPreset.ONE_MONTH, date(2027, 1, 1)),
        (BalanceHistoryPreset.THREE_MONTHS, date(2026, 11, 1)),
        (BalanceHistoryPreset.SIX_MONTHS, date(2026, 8, 1)),
        (BalanceHistoryPreset.TWELVE_MONTHS, date(2026, 2, 1)),
    ],
)
def test_calendar_presets(
    preset: BalanceHistoryPreset,
    expected_start: date,
) -> None:
    repository = make_repository()

    result = calculate_at(
        repository,
        datetime(2027, 1, 15, 12, tzinfo=UTC),
        preset,
    )

    assert result.from_date == expected_start
    assert result.to_date == date(2027, 1, 15)
    assert result.points == ()


def test_default_preset_and_cutoff() -> None:
    repository = make_repository()
    instant = datetime(2026, 11, 10, 12, 34, 56, 123456, tzinfo=UTC)

    result = calculate_at(repository, instant)

    expected_cutoff = instant.replace(microsecond=123000)
    expected_start = datetime(2026, 9, 1, tzinfo=KYIV_TZ)

    assert result.from_date == date(2026, 9, 1)
    assert result.to_date == date(2026, 11, 10)
    assert result.computed_at == expected_cutoff
    assert result.points == ()

    repository.get_latest_before.assert_called_once_with(
        int(expected_start.timestamp() * 1000)
    )
    repository.query_period.assert_called_once_with(
        from_ms=int(expected_start.timestamp() * 1000),
        to_ms=int(expected_cutoff.timestamp() * 1000),
    )


def test_empty_all() -> None:
    repository = make_repository()
    instant = datetime(2026, 11, 10, 12, tzinfo=UTC)

    result = calculate_at(
        repository,
        instant,
        BalanceHistoryPreset.ALL,
    )

    assert result.from_date is None
    assert result.to_date == date(2026, 11, 10)
    assert result.points == ()

    repository.get_latest_before.assert_not_called()
    repository.query_period.assert_called_once_with(
        from_ms=0,
        to_ms=int(instant.timestamp() * 1000),
    )


def test_all_starts_on_first_transaction_date() -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 11, 8, 12, tzinfo=UTC),
                15000,
            )
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert result.from_date == date(2026, 11, 8)
    assert [(point.date, point.balance_minor) for point in result.points] == [
        (date(2026, 11, 8), 15000),
        (date(2026, 11, 9), 15000),
        (date(2026, 11, 10), 15000),
    ]


def test_leading_unknown_interval_has_single_null() -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 11, 8, 12, tzinfo=UTC),
                15000,
            )
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        BalanceHistoryPreset.ONE_MONTH,
    )

    assert [(point.date, point.balance_minor) for point in result.points] == [
        (date(2026, 11, 1), None),
        (date(2026, 11, 8), 15000),
        (date(2026, 11, 9), 15000),
        (date(2026, 11, 10), 15000),
    ]


def test_anchor_without_transactions_in_range() -> None:
    anchor = make_transaction(
        datetime(2026, 10, 28, 12, tzinfo=UTC),
        20000,
    )
    repository = make_repository(anchor=anchor)

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        BalanceHistoryPreset.ONE_MONTH,
    )

    assert len(result.points) == 10
    assert result.points[0].date == date(2026, 11, 1)
    assert result.points[-1].date == date(2026, 11, 10)
    assert all(point.balance_minor == 20000 for point in result.points)


def test_latest_transaction_of_day_wins() -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 11, 8, 15, tzinfo=UTC),
                8000,
                "a",
            ),
            make_transaction(
                datetime(2026, 11, 8, 9, tzinfo=UTC),
                10000,
                "z",
            ),
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 8, 18, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert len(result.points) == 1
    assert result.points[0].balance_minor == 8000


def test_same_timestamp_uses_bank_id_order() -> None:
    timestamp = datetime(2026, 11, 8, 12, tzinfo=UTC)

    repository = make_repository(
        [
            make_transaction(timestamp, 7000, "z"),
            make_transaction(timestamp, 9000, "a"),
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 8, 18, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert len(result.points) == 1
    assert result.points[0].balance_minor == 7000


def test_kyiv_calendar_day_boundary() -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 10, 31, 21, 30, tzinfo=UTC),
                10000,
            ),
            make_transaction(
                datetime(2026, 10, 31, 22, 30, tzinfo=UTC),
                8000,
            ),
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 2, 12, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert [(point.date, point.balance_minor) for point in result.points] == [
        (date(2026, 10, 31), 10000),
        (date(2026, 11, 1), 8000),
        (date(2026, 11, 2), 8000),
    ]


def test_dst_transition() -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 3, 28, 22, 30, tzinfo=UTC),
                10000,
            ),
            make_transaction(
                datetime(2026, 3, 29, 1, 30, tzinfo=UTC),
                9000,
            ),
            make_transaction(
                datetime(2026, 3, 30, 1, tzinfo=UTC),
                8000,
            ),
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 3, 30, 12, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert [(point.date, point.balance_minor) for point in result.points] == [
        (date(2026, 3, 29), 9000),
        (date(2026, 3, 30), 8000),
    ]


def test_all_and_fixed_period_have_same_overlapping_points() -> None:
    anchor = make_transaction(
        datetime(2026, 8, 30, 12, tzinfo=UTC),
        10000,
    )
    september = make_transaction(
        datetime(2026, 9, 5, 12, tzinfo=UTC),
        9000,
    )
    october = make_transaction(
        datetime(2026, 10, 9, 12, tzinfo=UTC),
        8000,
    )

    all_repository = make_repository([anchor, september, october])
    fixed_repository = make_repository(
        [september, october],
        anchor=anchor,
    )

    instant = datetime(2026, 11, 10, 12, tzinfo=UTC)

    all_result = calculate_at(
        all_repository,
        instant,
        BalanceHistoryPreset.ALL,
    )
    fixed_result = calculate_at(
        fixed_repository,
        instant,
        BalanceHistoryPreset.THREE_MONTHS,
    )

    overlapping_points = tuple(
        point for point in all_result.points if point.date >= fixed_result.from_date
    )

    assert fixed_result.points == overlapping_points


def test_zero_and_negative_balances_are_valid() -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 11, 8, 12, tzinfo=UTC),
                -100,
            ),
            make_transaction(
                datetime(2026, 11, 9, 12, tzinfo=UTC),
                0,
            ),
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert [point.balance_minor for point in result.points] == [-100, 0, 0]


@pytest.mark.parametrize(
    "balance",
    [MAX_SAFE_INTEGER + 1, -MAX_SAFE_INTEGER - 1],
)
def test_unsafe_balance_is_rejected(balance: int) -> None:
    repository = make_repository(
        [
            make_transaction(
                datetime(2026, 11, 10, 9, tzinfo=UTC),
                balance,
            )
        ]
    )

    with pytest.raises(ValueError, match="safe integer"):
        calculate_at(
            repository,
            datetime(2026, 11, 10, 12, tzinfo=UTC),
            BalanceHistoryPreset.ALL,
        )


def test_all_has_no_point_cap() -> None:
    first_date = date(2020, 1, 1)
    last_date = date(2026, 11, 10)

    repository = make_repository(
        [
            make_transaction(
                datetime(2020, 1, 1, 12, tzinfo=UTC),
                10000,
            )
        ]
    )

    result = calculate_at(
        repository,
        datetime(2026, 11, 10, 12, tzinfo=UTC),
        BalanceHistoryPreset.ALL,
    )

    assert len(result.points) == (last_date - first_date).days + 1

    assert result.points[0].date == first_date
    assert result.points[-1].date == last_date


def test_repository_query_error_propagates() -> None:
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
            BalanceHistoryPreset.ALL,
        )


def test_anchor_query_error_propagates() -> None:
    repository = make_repository()
    repository.get_latest_before.side_effect = ClientError(
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
            BalanceHistoryPreset.ONE_MONTH,
        )

    repository.query_period.assert_not_called()
