from collections.abc import Iterable
from datetime import UTC, datetime
from typing import NamedTuple
from zoneinfo import ZoneInfo

from app.models.transaction import Transaction

KYIV_TZ = ZoneInfo("Europe/Kyiv")


class CashflowTotals(NamedTuple):
    income_minor: int
    expenses_minor: int
    net_minor: int


def month_bounds_utc(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=KYIV_TZ)

    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1

    end = datetime(next_year, next_month, 1, tzinfo=KYIV_TZ)

    return start.astimezone(UTC), end.astimezone(UTC)


def summarize_cashflow(
    transactions: Iterable[Transaction],
) -> CashflowTotals:
    income = 0
    expenses = 0

    for transaction in transactions:
        amount = transaction.amount_minor

        if amount > 0:
            income += amount
        elif amount < 0:
            expenses += amount

    return CashflowTotals(
        income_minor=income,
        expenses_minor=expenses,
        net_minor=income + expenses,
    )


def summarize_monthly_cashflow(
    transactions: Iterable[Transaction],
) -> dict[tuple[int, int], CashflowTotals]:
    by_month: dict[tuple[int, int], list[Transaction]] = {}

    for transaction in transactions:
        local_time = transaction.occurred_at.astimezone(KYIV_TZ)
        month = (local_time.year, local_time.month)

        by_month.setdefault(month, []).append(transaction)

    return {month: summarize_cashflow(items) for month, items in by_month.items()}
