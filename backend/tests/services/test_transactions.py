from datetime import UTC, datetime, tzinfo
from unittest.mock import Mock

import pytest

from app.core.transaction_cursor import (
    InvalidCursorError,
    TransactionCursorCodec,
)
from app.models.transaction import Transaction
from app.repositories.transactions import TransactionRepository
from app.schemas.transactions import (
    CursorPayload,
    TransactionsQuery,
    TransactionsResponse,
)
from app.services.transactions import TransactionsService

NOW = datetime(2026, 11, 15, 10, 0, 0, 123456, tzinfo=UTC)
NOW_MS = int(NOW.timestamp()) * 1000 + NOW.microsecond // 1000


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz: tzinfo | None = None) -> datetime:
            if tz is None:
                return NOW.replace(tzinfo=None)
            return NOW.astimezone(tz)

    monkeypatch.setattr(
        "app.services.transactions.datetime",
        FrozenDatetime,
    )


@pytest.fixture
def components() -> tuple[
    TransactionsService,
    Mock,
    TransactionCursorCodec,
]:
    repository = Mock(spec=TransactionRepository)
    codec = TransactionCursorCodec(
        secret="x" * 32,
        account_id="monobank-main",
    )
    service = TransactionsService(repository, codec)
    return service, repository, codec


def transaction(
    bank_id: str,
    amount_minor: int = -1000,
    occurred_at: datetime | None = None,
) -> Transaction:
    return Transaction(
        bank_id=bank_id,
        occurred_at=occurred_at or datetime(2026, 11, 14, 10, tzinfo=UTC),
        amount_minor=amount_minor,
        operation_amount_minor=amount_minor,
        operation_currency_code=980,
        balance_minor=100_000,
        mcc=5411,
        commission_minor=0,
    )


def test_resumes_after_last_examined_item(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, codec = components

    repository.query_cursor_batch.side_effect = [
        (
            [
                (transaction("z"), "position-z"),
                (transaction("y"), "position-y"),
                (transaction("x"), "position-x"),
            ],
            None,
        ),
        (
            [(transaction("x"), "position-x")],
            None,
        ),
    ]

    query = TransactionsQuery(limit=2)
    first = service.get_transactions(query)

    assert [item.bank_id for item in first.items] == ["z", "y"]
    assert first.next_cursor is not None

    payload = codec.decode(
        first.next_cursor,
        filters_key=query.model_dump_json(
            by_alias=True,
            exclude={"cursor"},
        ),
        now_ms=NOW_MS,
    )

    assert payload.position == "position-y"

    second = service.get_transactions(
        TransactionsQuery(
            limit=2,
            cursor=first.next_cursor,
        )
    )

    assert [item.bank_id for item in second.items] == ["x"]
    assert second.next_cursor is None
    assert second.computed_at == first.computed_at

    assert (
        repository.query_cursor_batch.call_args_list[1].kwargs["position"]
        == "position-y"
    )


def test_direction_filters_transactions(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components

    repository.query_cursor_batch.return_value = (
        [
            (transaction("z", amount_minor=500), "position-z"),
            (transaction("y", amount_minor=-100), "position-y"),
            (transaction("x", amount_minor=0), "position-x"),
        ],
        None,
    )

    result = service.get_transactions(TransactionsQuery(direction="expense"))

    assert [item.bank_id for item in result.items] == ["y"]
    assert result.next_cursor is None


def test_empty_batch_can_have_continuation(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components

    repository.query_cursor_batch.side_effect = [
        ([], "position-1"),
        ([(transaction("a"), "position-2")], None),
    ]

    result = service.get_transactions(TransactionsQuery())

    assert [item.bank_id for item in result.items] == ["a"]
    assert result.next_cursor is None
    assert repository.query_cursor_batch.call_count == 2

    assert (
        repository.query_cursor_batch.call_args_list[1].kwargs["position"]
        == "position-1"
    )


def test_read_budget_returns_empty_page_with_cursor(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, codec = components

    repository.query_cursor_batch.side_effect = [
        (
            [(transaction(f"tx-{i}", 100), f"position-{i}")],
            f"position-{i}",
        )
        for i in range(10)
    ]

    query = TransactionsQuery(direction="expense")
    result = service.get_transactions(query)

    assert result.items == ()
    assert result.next_cursor is not None
    assert repository.query_cursor_batch.call_count == 10

    payload = codec.decode(
        result.next_cursor,
        filters_key=query.model_dump_json(
            by_alias=True,
            exclude={"cursor"},
        ),
        now_ms=NOW_MS,
    )

    assert payload.position == "position-9"


def test_exhaustion_without_matching_transactions(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components

    repository.query_cursor_batch.return_value = (
        [(transaction("income", 500), "position-1")],
        None,
    )

    result = service.get_transactions(TransactionsQuery(direction="expense"))

    assert result.items == ()
    assert result.next_cursor is None


def test_kyiv_dst_date_boundaries(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components
    repository.query_cursor_batch.return_value = ([], None)

    query = TransactionsQuery.model_validate(
        {
            "from": "2026-03-29",
            "to": "2026-03-29",
        }
    )

    service.get_transactions(query)

    params = repository.query_cursor_batch.call_args.kwargs

    expected_from = datetime(2026, 3, 28, 22, tzinfo=UTC)
    expected_to = datetime(2026, 3, 29, 21, tzinfo=UTC)

    assert params["from_ms"] == int(expected_from.timestamp() * 1000)
    assert params["to_exclusive_ms"] == int(expected_to.timestamp() * 1000)


def test_rejects_future_date(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components

    query = TransactionsQuery.model_validate({"from": "2026-11-16"})

    with pytest.raises(ValueError, match="Date"):
        service.get_transactions(query)

    repository.query_cursor_batch.assert_not_called()


def test_cursor_rejects_changed_filters(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, codec = components

    original = TransactionsQuery(direction="expense")

    token = codec.encode(
        CursorPayload(
            cutoff_ms=NOW_MS,
            position="opaque-position",
            filters_key=original.model_dump_json(
                by_alias=True,
                exclude={"cursor"},
            ),
        )
    )

    with pytest.raises(InvalidCursorError):
        service.get_transactions(
            TransactionsQuery(
                direction="income",
                cursor=token,
            )
        )

    repository.query_cursor_batch.assert_not_called()


def test_cutoff_is_inclusive(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components

    cutoff = NOW.replace(microsecond=123000)

    repository.query_cursor_batch.return_value = (
        [(transaction("exact", occurred_at=cutoff), "position")],
        None,
    )

    result = service.get_transactions(TransactionsQuery())

    assert result.items[0].occurred_at == cutoff
    assert result.computed_at == cutoff
    assert result.next_cursor is None

    assert (
        repository.query_cursor_batch.call_args.kwargs["to_exclusive_ms"] == NOW_MS + 1
    )


def test_result_can_be_serialized_to_http_response(
    components: tuple[
        TransactionsService,
        Mock,
        TransactionCursorCodec,
    ],
) -> None:
    service, repository, _ = components

    repository.query_cursor_batch.return_value = (
        [
            (transaction("z", -1000), "position-z"),
            (transaction("y", 1000), "position-y"),
        ],
        None,
    )

    result = service.get_transactions(TransactionsQuery())

    response = TransactionsResponse.model_validate(result)
    data = response.model_dump(mode="json", by_alias=True)

    assert data["items"][0]["bankId"] == "z"
    assert data["items"][0]["amountMinor"] == -1000
    assert data["items"][0]["categoryId"] == "groceries"

    assert data["items"][1]["categoryId"] is None
    assert data["nextCursor"] is None
    assert data["currency"] == "UAH"
