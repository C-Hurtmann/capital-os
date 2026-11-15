from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import Depends

from app.constants import KYIV_TZ
from app.core.transaction_cursor import TransactionCursorCodec
from app.models.transaction import Transaction
from app.repositories.transactions import TransactionRepository
from app.schemas.transactions import CursorPayload, TransactionsQuery

MAX_QUERY_CALLS = 10


@dataclass(frozen=True)
class TransactionsResult:
    computed_at: datetime
    items: tuple[Transaction, ...]
    next_cursor: str | None


def _midnight_ms(day: date) -> int:
    midnight = datetime.combine(day, time.min, tzinfo=KYIV_TZ)
    return int(midnight.timestamp()) * 1000


def _matches_filters(transaction: Transaction, query: TransactionsQuery) -> bool:
    return not any(
        (
            query.direction == "income" and transaction.amount_minor <= 0,
            query.direction == "expense" and transaction.amount_minor >= 0,
        )
    )


class TransactionsService:
    def __init__(
        self,
        repository: Annotated[
            TransactionRepository, Depends(TransactionRepository.get_repository)
        ],
        cursor_codec: Annotated[
            TransactionCursorCodec, Depends(TransactionCursorCodec.get_codec)
        ],
    ) -> None:
        self._repository = repository
        self._cursor_codec = cursor_codec

    def get_transactions(self, query: TransactionsQuery) -> TransactionsResult:
        now = datetime.now(UTC)
        now_ms = int(now.timestamp()) * 1000 + now.microsecond // 1000

        filters_key = query.model_dump_json(
            by_alias=True,
            exclude={"cursor"},
        )

        cutoff_ms = now_ms
        position = None

        if query.cursor is not None:
            payload = self._cursor_codec.decode(
                token=query.cursor,
                filters_key=filters_key,
                now_ms=now_ms,
            )
            cutoff_ms = payload.cutoff_ms
            position = payload.position

        cutoff = datetime.fromtimestamp(
            cutoff_ms // 1000,
            tz=UTC,
        ).replace(microsecond=(cutoff_ms % 1000) * 1000)

        cutoff_date = cutoff.astimezone(KYIV_TZ).date()

        if any(
            day is not None and day > cutoff_date
            for day in (query.from_date, query.to_date)
        ):
            raise ValueError("Date cannot be after cutoff")

        from_ms = (
            max(0, _midnight_ms(query.from_date)) if query.from_date is not None else 0
        )

        to_exclusive_ms = cutoff_ms + 1

        if query.to_date is not None:
            to_exclusive_ms = min(
                to_exclusive_ms,
                _midnight_ms(query.to_date + timedelta(days=1)),
            )

        items: list[Transaction] = []
        exhausted = from_ms >= to_exclusive_ms

        if not exhausted:
            for _ in range(MAX_QUERY_CALLS):
                previous_position = position

                batch, next_position = self._repository.query_cursor_batch(
                    from_ms=from_ms,
                    to_exclusive_ms=to_exclusive_ms,
                    position=position,
                )

                for index, (transaction, row_position) in enumerate(batch):
                    position = row_position

                    if not _matches_filters(transaction, query):
                        continue

                    items.append(transaction)

                    if len(items) == query.limit:
                        exhausted = index == len(batch) - 1 and next_position is None
                        break

                if len(items) == query.limit:
                    break

                if next_position is None:
                    exhausted = True
                    break

                if next_position == previous_position:
                    raise RuntimeError("Repository position did not advance")

                position = next_position

        next_cursor = None

        if not exhausted:
            if position is None:
                raise RuntimeError("Missing continuation position")

            next_cursor = self._cursor_codec.encode(
                CursorPayload(
                    cutoff_ms=cutoff_ms,
                    position=position,
                    filters_key=filters_key,
                )
            )

        return TransactionsResult(
            computed_at=cutoff,
            items=tuple(items),
            next_cursor=next_cursor,
        )
