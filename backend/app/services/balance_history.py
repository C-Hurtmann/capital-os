from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Annotated

from fastapi import Depends

from app.constants import KYIV_TZ, MAX_SAFE_INTEGER
from app.models.transaction import Transaction
from app.repositories.transactions import TransactionRepository


class BalanceHistoryPreset(StrEnum):
    ONE_MONTH = "1M"
    THREE_MONTHS = "3M"
    SIX_MONTHS = "6M"
    TWELVE_MONTHS = "12M"
    ALL = "All"


@dataclass(frozen=True)
class BalanceHistoryPoint:
    date: date
    balance_minor: int | None


@dataclass(frozen=True)
class BalanceHistoryResult:
    from_date: date | None
    to_date: date
    computed_at: datetime
    points: tuple[BalanceHistoryPoint, ...]


class BalanceHistoryService:
    def __init__(
        self,
        transaction_repository: Annotated[
            TransactionRepository,
            Depends(TransactionRepository.get_repository),
        ],
    ) -> None:
        self._transaction_repository = transaction_repository

    def get_history(
        self,
        preset: BalanceHistoryPreset = BalanceHistoryPreset.THREE_MONTHS,
    ) -> BalanceHistoryResult:
        now = datetime.now(UTC)
        cutoff = now.replace(
            microsecond=(now.microsecond // 1000) * 1000,
        )
        to_date = cutoff.astimezone(KYIV_TZ).date()
        to_ms = int(cutoff.timestamp()) * 1000 + cutoff.microsecond // 1000

        anchor: Transaction | None = None
        from_date: date | None = None

        if preset == BalanceHistoryPreset.ALL:
            from_ms = 0
        else:
            months = {
                BalanceHistoryPreset.ONE_MONTH: 1,
                BalanceHistoryPreset.THREE_MONTHS: 3,
                BalanceHistoryPreset.SIX_MONTHS: 6,
                BalanceHistoryPreset.TWELVE_MONTHS: 12,
            }[preset]

            first_month = to_date.year * 12 + to_date.month - months
            year, month = divmod(first_month, 12)

            period_start = datetime(
                year,
                month + 1,
                1,
                tzinfo=KYIV_TZ,
            )

            from_date = period_start.date()
            from_ms = int(period_start.timestamp()) * 1000

            anchor = self._transaction_repository.get_latest_before(from_ms)

        transactions = (
            self._transaction_repository.query_period(
                from_ms=from_ms,
                to_ms=to_ms,
            )
            if from_ms < to_ms
            else []
        )

        # Select the latest recorded transaction for each Kyiv calendar day.
        # Equal timestamps are resolved deterministically by bank_id.
        latest_by_day: dict[date, Transaction] = {}

        for transaction in transactions:
            day = transaction.occurred_at.astimezone(KYIV_TZ).date()
            previous = latest_by_day.get(day)

            if previous is None or (
                transaction.occurred_at,
                transaction.bank_id,
            ) > (
                previous.occurred_at,
                previous.bank_id,
            ):
                latest_by_day[day] = transaction

        if preset == BalanceHistoryPreset.ALL:
            from_date = min(latest_by_day, default=None)

        if from_date is None or (anchor is None and not latest_by_day):
            return BalanceHistoryResult(
                from_date=from_date,
                to_date=to_date,
                computed_at=cutoff,
                points=(),
            )

        first_known_date = from_date if anchor is not None else min(latest_by_day)

        points: list[BalanceHistoryPoint] = []

        if first_known_date > from_date:
            points.append(
                BalanceHistoryPoint(
                    date=from_date,
                    balance_minor=None,
                )
            )

        balance = anchor.balance_minor if anchor is not None else None
        day = first_known_date

        while day <= to_date:
            transaction = latest_by_day.get(day)

            if transaction is not None:
                balance = transaction.balance_minor

            if balance is None:
                raise ValueError("Missing balance for known history date")

            if not -MAX_SAFE_INTEGER <= balance <= MAX_SAFE_INTEGER:
                raise ValueError("Balance exceeds JSON safe integer range")

            points.append(
                BalanceHistoryPoint(
                    date=day,
                    balance_minor=balance,
                )
            )

            day += timedelta(days=1)

        return BalanceHistoryResult(
            from_date=from_date,
            to_date=to_date,
            computed_at=cutoff,
            points=tuple(points),
        )
