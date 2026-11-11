from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends

from app.constants import KYIV_TZ
from app.repositories.transactions import TransactionRepository


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


@dataclass(frozen=True)
class MonthlyCashflowMonth:
    month: str
    income_minor: int
    expense_minor: int


@dataclass(frozen=True)
class MonthlyCashflowResult:
    from_date: date
    to_date: date
    months: tuple[MonthlyCashflowMonth, ...]
    computed_at: datetime


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
        )

        from_ms = int(month_start.timestamp()) * 1000
        to_ms = int(cutoff.timestamp()) * 1000 + cutoff.microsecond // 1000

        transactions = (
            self._transaction_repository.query_period(
                from_ms=from_ms,
                to_ms=to_ms,
            )
            if from_ms < to_ms
            else []
        )

        income = sum(
            transaction.amount_minor
            for transaction in transactions
            if transaction.amount_minor > 0
        )

        expenses = -sum(
            transaction.amount_minor
            for transaction in transactions
            if transaction.amount_minor < 0
        )

        return CashflowResult(
            from_date=month_start.date(),
            to_date=local_date,
            income_minor=income,
            expense_minor=expenses,
            computed_at=cutoff,
        )

    def get_monthly_trend(self) -> MonthlyCashflowResult:
        cutoff = datetime.now(UTC)
        cutoff = cutoff.replace(microsecond=(cutoff.microsecond // 1000) * 1000)
        local_date = cutoff.astimezone(KYIV_TZ).date()

        # First month of the 12-month period.
        first_month = local_date.year * 12 + local_date.month - 12
        year, month = divmod(first_month, 12)
        period_start = datetime(year, month + 1, 1, tzinfo=KYIV_TZ)

        # Initialize all 12 months, including those without transactions.
        totals: dict[str, list[int]] = {}

        for offset in range(12):
            year, month = divmod(first_month + offset, 12)
            totals[f"{year:04d}-{month + 1:02d}"] = [0, 0]

        transactions = self._transaction_repository.query_period(
            from_ms=int(period_start.timestamp()) * 1000,
            to_ms=int(cutoff.timestamp()) * 1000 + cutoff.microsecond // 1000,
        )

        for transaction in transactions:
            month = transaction.occurred_at.astimezone(KYIV_TZ).strftime("%Y-%m")
            amount = transaction.amount_minor

            if amount > 0:
                totals[month][0] += amount
            elif amount < 0:
                totals[month][1] -= amount

        return MonthlyCashflowResult(
            from_date=period_start.date(),
            to_date=local_date,
            months=tuple(
                MonthlyCashflowMonth(
                    month=month,
                    income_minor=income,
                    expense_minor=expense,
                )
                for month, (income, expense) in totals.items()
            ),
            computed_at=cutoff,
        )
