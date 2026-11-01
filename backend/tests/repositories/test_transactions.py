from datetime import UTC, datetime
from unittest.mock import Mock

from app.models.transaction import Transaction
from app.repositories.transactions import TransactionRepository


def test_query_period_page_maps_transactions() -> None:
    item = {
        "bankId": {"S": "tx-123"},
        "occurredAtMs": {"N": "1750000000000"},
        "amountMinor": {"N": "-12500"},
        "operationAmountMinor": {"N": "-12500"},
        "operationCurrencyCode": {"N": "980"},
        "balanceMinor": {"N": "150000"},
        "mcc": {"N": "5411"},
        "commissionMinor": {"N": "0"},
    }

    next_key = {
        "PK": {"S": "ACCOUNT#monobank-main"},
        "SK": {"S": "TX#1750000000000#tx-123"},
    }

    client = Mock()
    client.query.return_value = {
        "Items": [item],
        "LastEvaluatedKey": next_key,
    }

    repository = TransactionRepository(
        client=client,
        table_name="capital-os-local",
    )

    transactions, cursor = repository.query_period_page(
        from_ms=1700000000000,
        to_ms=1800000000000,
    )

    assert transactions == [
        Transaction(
            bank_id="tx-123",
            occurred_at=datetime(2025, 6, 15, 15, 6, 40, tzinfo=UTC),
            amount_minor=-12500,
            operation_amount_minor=-12500,
            operation_currency_code=980,
            balance_minor=150000,
            mcc=5411,
            commission_minor=0,
        )
    ]

    assert cursor == next_key
    client.query.assert_called_once()


def test_query_period_page_returns_empty_result() -> None:
    client = Mock()
    client.query.return_value = {"Items": []}

    repository = TransactionRepository(
        client=client,
        table_name="capital-os-local",
    )

    transactions, cursor = repository.query_period_page(
        from_ms=1700000000000,
        to_ms=1800000000000,
    )

    assert transactions == []
    assert cursor is None
    client.query.assert_called_once()
