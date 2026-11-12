from datetime import UTC, date, datetime
from typing import Any

import pytest
from pydantic import ValidationError

from app.constants import MAX_SAFE_INTEGER
from app.schemas.balance_history import BalanceHistoryResponse
from app.services.balance_history import (
    BalanceHistoryPoint,
    BalanceHistoryResult,
)

NOW = datetime(2026, 11, 10, 12, tzinfo=UTC)
TODAY = date(2026, 11, 10)


def make_result(
    from_date: date | None,
    points: tuple[BalanceHistoryPoint, ...] = (),
    to_date: date = TODAY,
    computed_at: datetime = NOW,
) -> BalanceHistoryResult:
    return BalanceHistoryResult(
        from_date=from_date,
        to_date=to_date,
        computed_at=computed_at,
        points=points,
    )


def point(
    day: int,
    balance: int | None,
) -> BalanceHistoryPoint:
    return BalanceHistoryPoint(
        date=date(2026, 11, day),
        balance_minor=balance,
    )


def validate(result: BalanceHistoryResult) -> BalanceHistoryResponse:
    return BalanceHistoryResponse.model_validate(result)


def test_serialization_contract() -> None:
    result = make_result(
        from_date=date(2026, 11, 8),
        points=(
            point(8, 10000),
            point(9, 10000),
            point(10, 8000),
        ),
    )

    response = validate(result)
    payload = response.model_dump(
        mode="json",
        by_alias=True,
    )

    assert payload == {
        "from": "2026-11-08",
        "to": "2026-11-10",
        "computedAt": "2026-11-10T12:00:00Z",
        "timeZone": "Europe/Kyiv",
        "currency": "UAH",
        "points": [
            {"date": "2026-11-08", "balanceMinor": 10000},
            {"date": "2026-11-09", "balanceMinor": 10000},
            {"date": "2026-11-10", "balanceMinor": 8000},
        ],
    }


def test_empty_all_is_valid() -> None:
    response = validate(make_result(from_date=None))

    payload = response.model_dump(
        mode="json",
        by_alias=True,
    )

    assert payload["from"] is None
    assert payload["to"] == "2026-11-10"
    assert payload["points"] == []


def test_empty_fixed_period_is_valid() -> None:
    response = validate(make_result(from_date=date(2026, 11, 1)))

    assert response.from_date == date(2026, 11, 1)
    assert response.points == ()


def test_single_day_is_valid() -> None:
    response = validate(
        make_result(
            from_date=TODAY,
            points=(point(10, 5000),),
        )
    )

    assert len(response.points) == 1
    assert response.points[0].balance_minor == 5000


def test_leading_null_is_valid() -> None:
    response = validate(
        make_result(
            from_date=date(2026, 11, 1),
            points=(
                point(1, None),
                point(8, 10000),
                point(9, 10000),
                point(10, 9000),
            ),
        )
    )

    assert response.points[0].balance_minor is None
    assert response.points[1].date == date(2026, 11, 8)


@pytest.mark.parametrize(
    "balance",
    [
        0,
        -100,
        100,
        MAX_SAFE_INTEGER,
        -MAX_SAFE_INTEGER,
    ],
)
def test_valid_balance_values(balance: int) -> None:
    response = validate(
        make_result(
            from_date=TODAY,
            points=(point(10, balance),),
        )
    )

    assert response.points[0].balance_minor == balance


@pytest.mark.parametrize(
    "balance",
    [
        MAX_SAFE_INTEGER + 1,
        -MAX_SAFE_INTEGER - 1,
    ],
)
def test_unsafe_balance_is_rejected(balance: int) -> None:
    with pytest.raises(ValidationError):
        validate(
            make_result(
                from_date=TODAY,
                points=(point(10, balance),),
            )
        )


def test_null_from_requires_empty_points() -> None:
    with pytest.raises(
        ValidationError,
        match="points must be empty when from is null",
    ):
        validate(
            make_result(
                from_date=None,
                points=(point(10, 10000),),
            )
        )


def test_from_must_not_exceed_to() -> None:
    with pytest.raises(
        ValidationError,
        match="from must not be later than to",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 11),
            )
        )


def test_first_point_must_match_from() -> None:
    with pytest.raises(
        ValidationError,
        match="First point must match from",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 1),
                points=(
                    point(8, 10000),
                    point(9, 10000),
                    point(10, 10000),
                ),
            )
        )


def test_lone_null_is_rejected() -> None:
    with pytest.raises(
        ValidationError,
        match="Leading null requires known points",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 1),
                points=(point(1, None),),
            )
        )


def test_known_point_must_follow_leading_null() -> None:
    with pytest.raises(
        ValidationError,
        match="Known points must follow leading null",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 1),
                points=(
                    point(1, None),
                    point(1, 10000),
                ),
            )
        )


def test_internal_null_is_rejected() -> None:
    with pytest.raises(
        ValidationError,
        match="Null is only allowed at the beginning",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 8),
                points=(
                    point(8, 10000),
                    point(9, None),
                    point(10, 8000),
                ),
            )
        )


def test_missing_day_is_rejected() -> None:
    with pytest.raises(
        ValidationError,
        match="Known dates must be consecutive",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 8),
                points=(
                    point(8, 10000),
                    point(10, 8000),
                ),
            )
        )


def test_duplicate_date_is_rejected() -> None:
    with pytest.raises(
        ValidationError,
        match="Known dates must be consecutive",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 8),
                points=(
                    point(8, 10000),
                    point(8, 9000),
                    point(10, 8000),
                ),
            )
        )


def test_last_point_must_match_to() -> None:
    with pytest.raises(
        ValidationError,
        match="Last point must match to",
    ):
        validate(
            make_result(
                from_date=date(2026, 11, 8),
                points=(
                    point(8, 10000),
                    point(9, 9000),
                ),
            )
        )


def test_to_must_match_computed_at_kyiv_date() -> None:
    with pytest.raises(
        ValidationError,
        match="to must match computedAt local date",
    ):
        validate(
            make_result(
                from_date=date(2026, 10, 1),
                to_date=date(2026, 10, 31),
                computed_at=datetime(2026, 10, 31, 22, 30, tzinfo=UTC),
            )
        )


def test_kyiv_date_from_utc_cutoff() -> None:
    response = validate(
        make_result(
            from_date=date(2026, 11, 1),
            to_date=date(2026, 11, 1),
            computed_at=datetime(2026, 10, 31, 22, 30, tzinfo=UTC),
            points=(
                BalanceHistoryPoint(
                    date=date(2026, 11, 1),
                    balance_minor=10000,
                ),
            ),
        )
    )

    assert response.to_date == date(2026, 11, 1)


def test_naive_computed_at_is_rejected() -> None:
    with pytest.raises(ValidationError):
        validate(
            make_result(
                from_date=TODAY,
                computed_at=datetime(2026, 11, 10, 12),
            )
        )


def test_balance_must_be_integer() -> None:
    invalid_point = {
        "date": TODAY,
        "balance_minor": "10000",
    }

    result: dict[str, Any] = {
        "from_date": TODAY,
        "to_date": TODAY,
        "computed_at": NOW,
        "points": [invalid_point],
    }

    with pytest.raises(ValidationError):
        BalanceHistoryResponse.model_validate(result)
