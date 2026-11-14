from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends

from app.categories import mcc_to_category_id
from app.constants import KYIV_TZ, MAX_SAFE_INTEGER
from app.repositories.transactions import TransactionRepository


@dataclass(frozen=True)
class SpendingCategory:
    id: str
    amount_minor: int


@dataclass(frozen=True)
class SpendingResult:
    from_date: date
    to_date: date
    computed_at: datetime
    total_minor: int
    categories: tuple[SpendingCategory, ...]


class SpendingService:
    def __init__(
        self,
        transaction_repository: Annotated[
            TransactionRepository, Depends(TransactionRepository.get_repository)
        ],
    ) -> None:
        self._transaction_repository = transaction_repository

    def get_current(self) -> SpendingResult:
        now = datetime.now(UTC)
        cutoff = now.replace(
            microsecond=(now.microsecond // 1000) * 1000,
        )

        local_date = cutoff.astimezone(KYIV_TZ).date()
        month_start = datetime(
            local_date.year,
            local_date.month,
            1,
            tzinfo=KYIV_TZ,
        )

        from_ms = int(month_start.timestamp()) * 1000
        to_ms = int(cutoff.timestamp()) * 1000 + cutoff.microsecond // 1000

        transactions = (
            self._transaction_repository.query_period(from_ms=from_ms, to_ms=to_ms)
            if from_ms < to_ms
            else []
        )

        totals: dict[str, int] = {}
        total_minor = 0

        for transaction in transactions:
            if transaction.amount_minor >= 0:
                continue

            amount = -transaction.amount_minor
            category_id = mcc_to_category_id(transaction.mcc)

            totals[category_id] = totals.get(category_id, 0) + amount
            total_minor += amount

            if total_minor > MAX_SAFE_INTEGER:
                raise ValueError("Spending total exceeds JSON safe integer range")

        categories = tuple(
            SpendingCategory(id=category_id, amount_minor=amount)
            for category_id, amount in sorted(
                totals.items(),
                key=lambda item: (-item[1], item[0]),
            )
        )

        return SpendingResult(
            from_date=month_start.date(),
            to_date=local_date,
            computed_at=cutoff,
            total_minor=total_minor,
            categories=categories,
        )
