from datetime import UTC, datetime
from unittest.mock import Mock

import pytest

from app.repositories.balance import BalanceRepository


def test_get_latest_returns_snapshot() -> None:
    client = Mock()
    fetched_at = datetime(2026, 11, 4, 6, tzinfo=UTC)

    client.get_item.return_value = {
        "Item": {
            "bankBalanceMinor": {"N": "7000000"},
            "fetchedAtMs": {"N": str(int(fetched_at.timestamp() * 1000))},
        }
    }

    repository = BalanceRepository(client, "capital-os-local")

    snapshot = repository.get_snapshot("monobank-main")

    assert snapshot is not None
    assert snapshot.account_id == "monobank-main"
    assert snapshot.bank_balance_minor == 7000000
    assert snapshot.fetched_at == fetched_at

    client.get_item.assert_called_once_with(
        TableName="capital-os-local",
        Key={
            "PK": {"S": "ACCOUNT#monobank-main"},
            "SK": {"S": "BALANCE_SNAPSHOT"},
        },
        ConsistentRead=True,
    )


def test_get_latest_returns_none_when_missing() -> None:
    client = Mock()
    client.get_item.return_value = {}

    repository = BalanceRepository(client, "capital-os-local")

    assert repository.get_snapshot("monobank-main") is None


def test_get_latest_raises_on_corrupted_snapshot() -> None:
    client = Mock()
    client.get_item.return_value = {
        "Item": {
            "bankBalanceMinor": {"N": "invalid"},
            "fetchedAtMs": {"N": "1793772000000"},
        }
    }

    repository = BalanceRepository(client, "capital-os-local")

    with pytest.raises(ValueError):
        repository.get_snapshot("monobank-main")
