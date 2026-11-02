from datetime import UTC, datetime
from unittest.mock import Mock

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


def test_set_current_writes_credit_limit() -> None:
    client = Mock()
    repository = CreditLimitRepository(client, "capital-os-local")

    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=1_500_000,
        effective_from=datetime(2025, 1, 1, tzinfo=UTC),
    )

    repository.set_current(credit_limit)

    client.put_item.assert_called_once_with(
        TableName="capital-os-local",
        Item={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "CREDIT_LIMIT"},
            "creditLimitMinor": {"N": "1500000"},
            "effectiveFromMs": {"N": "1735689600000"},
        },
    )
