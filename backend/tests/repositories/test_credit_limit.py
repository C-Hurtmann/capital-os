from datetime import UTC, datetime
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError

from app.models.credit_limit import CreditLimit
from app.repositories.credit_limit import CreditLimitRepository


def test_get_current_returns_none_when_missing() -> None:
    client = Mock()
    client.get_item.return_value = {}

    repository = CreditLimitRepository(client, "capital-os-local")

    assert repository.get_current("monobank-main") is None


def test_get_current_maps_zero_limit() -> None:
    effective_from = datetime(2026, 11, 2, 12, tzinfo=UTC)

    client = Mock()
    client.get_item.return_value = {
        "Item": {
            "creditLimitMinor": {"N": "0"},
            "effectiveFromMs": {
                "N": str(int(effective_from.timestamp() * 1000)),
            },
        }
    }

    repository = CreditLimitRepository(client, "capital-os-local")

    result = repository.get_current("monobank-main")

    assert result == CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=0,
        effective_from=effective_from,
    )
    client.get_item.assert_called_once_with(
        TableName="capital-os-local",
        Key={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "CREDIT_LIMIT"},
        },
        ConsistentRead=True,
    )


def test_set_current_creates_credit_limit() -> None:
    effective_from = datetime(2025, 1, 1, tzinfo=UTC)
    effective_from_ms = 1735689600000

    client = Mock()
    client.get_item.return_value = {}
    client.update_item.return_value = {
        "Attributes": {
            "creditLimitMinor": {"N": "1500000"},
            "effectiveFromMs": {"N": str(effective_from_ms)},
        }
    }

    repository = CreditLimitRepository(client, "capital-os-local")
    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=1_500_000,
        effective_from=effective_from,
    )

    result = repository.set_current(credit_limit)

    assert result == credit_limit

    client.update_item.assert_called_once_with(
        TableName="capital-os-local",
        Key={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "CREDIT_LIMIT"},
        },
        UpdateExpression=("SET #amount = :amount, #effective_from = :effective_from"),
        ConditionExpression="attribute_not_exists(PK)",
        ExpressionAttributeNames={
            "#amount": "creditLimitMinor",
            "#effective_from": "effectiveFromMs",
        },
        ExpressionAttributeValues={
            ":amount": {"N": "1500000"},
            ":effective_from": {"N": str(effective_from_ms)},
        },
        ReturnValues="ALL_NEW",
    )


def test_set_current_updates_existing_credit_limit() -> None:
    client = Mock()
    client.get_item.return_value = {
        "Item": {
            "creditLimitMinor": {"N": "1500000"},
            "effectiveFromMs": {"N": "1735689600000"},
        }
    }
    client.update_item.return_value = {
        "Attributes": {
            "creditLimitMinor": {"N": "2000000"},
            "effectiveFromMs": {"N": "1735776000000"},
        }
    }

    repository = CreditLimitRepository(client, "capital-os-local")
    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=2_000_000,
        effective_from=datetime(2025, 1, 2, tzinfo=UTC),
    )

    result = repository.set_current(credit_limit)

    assert result == credit_limit

    client.get_item.assert_called_once_with(
        TableName="capital-os-local",
        Key={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "CREDIT_LIMIT"},
        },
        ConsistentRead=True,
    )

    client.update_item.assert_called_once_with(
        TableName="capital-os-local",
        Key={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "CREDIT_LIMIT"},
        },
        UpdateExpression=("SET #amount = :amount, #effective_from = :effective_from"),
        ConditionExpression=("#amount = :old_amount AND #effective_from = :old_time"),
        ExpressionAttributeNames={
            "#amount": "creditLimitMinor",
            "#effective_from": "effectiveFromMs",
        },
        ExpressionAttributeValues={
            ":amount": {"N": "2000000"},
            ":effective_from": {"N": "1735776000000"},
            ":old_amount": {"N": "1500000"},
            ":old_time": {"N": "1735689600000"},
        },
        ReturnValues="ALL_NEW",
    )


def test_set_current_retries_after_concurrent_update() -> None:
    client = Mock()

    client.get_item.side_effect = [
        {
            "Item": {
                "creditLimitMinor": {"N": "1500000"},
                "effectiveFromMs": {"N": "1735689600000"},
            }
        },
        {
            "Item": {
                "creditLimitMinor": {"N": "1800000"},
                "effectiveFromMs": {"N": "1735776000000"},
            }
        },
    ]

    client.update_item.side_effect = [
        ClientError(
            {
                "Error": {
                    "Code": "ConditionalCheckFailedException",
                    "Message": "Conditional request failed",
                }
            },
            "UpdateItem",
        ),
        {
            "Attributes": {
                "creditLimitMinor": {"N": "2000000"},
                "effectiveFromMs": {"N": "1735862400000"},
            }
        },
    ]

    repository = CreditLimitRepository(client, "capital-os-local")
    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=2_000_000,
        effective_from=datetime(2025, 1, 3, tzinfo=UTC),
    )

    result = repository.set_current(credit_limit)

    assert result == credit_limit
    assert client.get_item.call_count == 2
    assert client.update_item.call_count == 2

    first_call, second_call = client.update_item.call_args_list

    assert first_call.kwargs["ExpressionAttributeValues"][":old_amount"] == {
        "N": "1500000"
    }
    assert second_call.kwargs["ExpressionAttributeValues"][":old_amount"] == {
        "N": "1800000"
    }
    assert second_call.kwargs["ExpressionAttributeValues"][":old_time"] == {
        "N": "1735776000000"
    }


def test_set_current_raises_after_three_conflicts() -> None:
    client = Mock()
    client.get_item.return_value = {
        "Item": {
            "creditLimitMinor": {"N": "1500000"},
            "effectiveFromMs": {"N": "1735689600000"},
        }
    }
    client.update_item.side_effect = ClientError(
        {
            "Error": {
                "Code": "ConditionalCheckFailedException",
                "Message": "Conditional request failed",
            }
        },
        "UpdateItem",
    )

    repository = CreditLimitRepository(client, "capital-os-local")
    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=2_000_000,
        effective_from=datetime(2025, 1, 2, tzinfo=UTC),
    )

    with pytest.raises(ClientError) as exc_info:
        repository.set_current(credit_limit)

    assert exc_info.value.response["Error"]["Code"] == "ConditionalCheckFailedException"
    assert client.get_item.call_count == 3
    assert client.update_item.call_count == 3
