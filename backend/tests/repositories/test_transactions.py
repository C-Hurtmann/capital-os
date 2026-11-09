from datetime import UTC, datetime
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError

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


@pytest.fixture
def transaction() -> Transaction:
    return Transaction(
        bank_id="tx-123",
        occurred_at=datetime(2025, 6, 15, 15, 6, 40, tzinfo=UTC),
        amount_minor=-12_500,
        operation_amount_minor=-12_500,
        operation_currency_code=980,
        balance_minor=150_000,
        mcc=5411,
        commission_minor=0,
    )


def test_insert_if_not_exists_success(
    transaction: Transaction,
) -> None:
    client = Mock()
    repository = TransactionRepository(client, "test-table")

    result = repository.insert_if_not_exists(transaction)

    assert result is True
    client.put_item.assert_called_once_with(
        TableName="test-table",
        Item={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "TX#1750000000000#tx-123"},
            "bankId": {"S": "tx-123"},
            "occurredAtMs": {"N": "1750000000000"},
            "amountMinor": {"N": "-12500"},
            "operationAmountMinor": {"N": "-12500"},
            "operationCurrencyCode": {"N": "980"},
            "balanceMinor": {"N": "150000"},
            "mcc": {"N": "5411"},
            "commissionMinor": {"N": "0"},
        },
        ConditionExpression="attribute_not_exists(PK)",
    )


def test_insert_if_not_exists_duplicate(
    transaction: Transaction,
) -> None:
    client = Mock()
    client.put_item.side_effect = ClientError(
        {
            "Error": {
                "Code": "ConditionalCheckFailedException",
                "Message": "Item already exists",
            }
        },
        "PutItem",
    )
    repository = TransactionRepository(client, "test-table")

    assert repository.insert_if_not_exists(transaction) is False


def test_insert_if_not_exists_propagates_error(
    transaction: Transaction,
) -> None:
    client = Mock()
    client.put_item.side_effect = ClientError(
        {
            "Error": {
                "Code": "ProvisionedThroughputExceededException",
                "Message": "Throttled",
            }
        },
        "PutItem",
    )
    repository = TransactionRepository(client, "test-table")

    with pytest.raises(ClientError):
        repository.insert_if_not_exists(transaction)


def test_same_timestamp_different_bank_ids(
    transaction: Transaction,
) -> None:
    client = Mock()
    repository = TransactionRepository(client, "test-table")

    another = transaction.model_copy(
        update={"bank_id": "tx-456"},
    )

    assert repository.insert_if_not_exists(transaction) is True
    assert repository.insert_if_not_exists(another) is True

    first_call, second_call = client.put_item.call_args_list

    first_key = first_call.kwargs["Item"]["SK"]["S"]
    second_key = second_call.kwargs["Item"]["SK"]["S"]

    assert first_key == "TX#1750000000000#tx-123"
    assert second_key == "TX#1750000000000#tx-456"
