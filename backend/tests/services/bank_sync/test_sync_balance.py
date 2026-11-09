from datetime import UTC, datetime
from unittest.mock import Mock

import httpx
import pytest

from app.core.settings import Settings
from app.integrations.monobank.client import MonobankClient
from app.integrations.monobank.models import MonobankClientInfoResponse
from app.repositories.balance import BalanceRepository
from app.repositories.transactions import TransactionRepository
from app.services.bank_sync import BankSyncService


def build_service(
    account_id: str = "target-uah",
) -> tuple[BankSyncService, Mock, Mock]:
    settings = Settings.model_construct(
        monobank_account_id=account_id,
    )

    monobank_client = Mock(spec=MonobankClient)
    monobank_client.get_client_info.return_value = (
        MonobankClientInfoResponse.model_validate(
            {
                "clientId": "client-123",
                "name": "Test User",
                "accounts": [
                    {
                        "id": "other-uah",
                        "balance": 1_000_000,
                        "creditLimit": 0,
                        "currencyCode": 980,
                    },
                    {
                        "id": "target-uah",
                        "balance": 7_000_000,
                        "creditLimit": 5_000_000,
                        "currencyCode": 980,
                    },
                    {
                        "id": "usd-account",
                        "balance": 50_000,
                        "creditLimit": 0,
                        "currencyCode": 840,
                    },
                ],
            }
        )
    )

    balance_repository = Mock(spec=BalanceRepository)
    transaction_repository = Mock(spec=TransactionRepository)

    service = BankSyncService(
        settings=settings,
        monobank_client=monobank_client,
        balance_repository=balance_repository,
        transaction_repository=transaction_repository,
    )

    return service, monobank_client, balance_repository


def test_sync_balance_success() -> None:
    service, client, repository = build_service()

    before = datetime.now(UTC)
    snapshot = service.sync_balance()
    after = datetime.now(UTC)

    assert snapshot.account_id == "monobank-main"
    assert snapshot.bank_balance_minor == 7_000_000
    assert before <= snapshot.fetched_at <= after

    client.get_client_info.assert_called_once_with()
    repository.save_snapshot.assert_called_once_with(snapshot)


def test_sync_balance_account_not_found() -> None:
    service, _, repository = build_service("unknown-account")

    with pytest.raises(LookupError):
        service.sync_balance()

    repository.save_snapshot.assert_not_called()


def test_sync_balance_wrong_currency() -> None:
    service, _, repository = build_service("usd-account")

    with pytest.raises(ValueError, match="must be UAH"):
        service.sync_balance()

    repository.save_snapshot.assert_not_called()


def test_sync_balance_monobank_failure() -> None:
    service, client, repository = build_service()
    client.get_client_info.side_effect = httpx.ReadTimeout("Monobank unavailable")

    with pytest.raises(httpx.ReadTimeout):
        service.sync_balance()

    repository.save_snapshot.assert_not_called()


def test_sync_balance_repository_failure() -> None:
    service, _, repository = build_service()
    repository.save_snapshot.side_effect = RuntimeError("DynamoDB write failed")

    with pytest.raises(RuntimeError, match="DynamoDB write failed"):
        service.sync_balance()

    repository.save_snapshot.assert_called_once()


def test_sync_balance_negative_balance() -> None:
    service, client, repository = build_service()
    client.get_client_info.return_value.accounts[1].balance = -50_000

    snapshot = service.sync_balance()

    assert snapshot.bank_balance_minor == -50_000
    repository.save_snapshot.assert_called_once_with(snapshot)
