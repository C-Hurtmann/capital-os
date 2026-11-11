from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.repositories.transactions import TransactionRepository

KYIV_TZ = ZoneInfo("Europe/Kyiv")


@dataclass(frozen=True)
class CashflowResult:
    from_date: date
    to_date: date
    income_minor: int
    expense_minor: int
    computed_at: datetime

    @property
    def net_minor(self) -> int:
        return self.income_minor - self.expense_minor


class CashflowService:
    def __init__(
        self,
        transaction_repository: Annotated[
            TransactionRepository, Depends(TransactionRepository.get_repository)
        ],
    ) -> None:
        self._transaction_repository = transaction_repository

    def get_current(self) -> CashflowResult:
        now = datetime.now(UTC)

        # DynamoDB transaction timestamps have millisecond precision.
        cutoff = now.replace(microsecond=(now.microsecond // 1000) * 1000)

        local_date = cutoff.astimezone(KYIV_TZ).date()
        month_start = datetime(
            local_date.year,
            local_date.month,
            1,
            tzinfo=KYIV_TZ,
        ).astimezone(UTC)

        from_ms = int(month_start.timestamp()) * 1000
        to_ms = int(cutoff.timestamp()) * 1000 + cutoff.microsecond // 1000

        income = 0
        expenses = 0

        if from_ms < to_ms:
            last_key = None

            while True:
                transactions, last_key = self._transaction_repository.query_period_page(
                    from_ms=from_ms,
                    to_ms=to_ms,
                    exclusive_start_key=last_key,
                )

                for transaction in transactions:
                    amount = transaction.amount_minor

                    if amount > 0:
                        income += amount
                    elif amount < 0:
                        expenses -= amount

                if not last_key:
                    break

        return CashflowResult(
            from_date=month_start.astimezone(KYIV_TZ).date(),
            to_date=local_date,
            income_minor=income,
            expense_minor=expenses,
            computed_at=cutoff,
        )
