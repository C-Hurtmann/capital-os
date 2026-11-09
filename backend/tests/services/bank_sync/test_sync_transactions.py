from datetime import UTC, datetime
from unittest.mock import Mock

import pytest

from app.core.settings import Settings
from app.integrations.monobank.client import MonobankClient
from app.integrations.monobank.models import MonobankStatementItem
from app.models.transaction import Transaction
from app.repositories.balance import BalanceRepository
from app.repositories.transactions import TransactionRepository
from app.services.bank_sync import BankSyncService

FROM = 1_762_000_000
TO = FROM + 3600


@pytest.fixture
def dependencies() -> tuple[BankSyncService, Mock, Mock]:
    settings = Settings.model_construct(
        monobank_account_id="account-123",
    )
    client = Mock(spec=MonobankClient)
    transaction_repository = Mock(spec=TransactionRepository)

    service = BankSyncService(
        settings=settings,
        monobank_client=client,
        balance_repository=Mock(spec=BalanceRepository),
        transaction_repository=transaction_repository,
    )

    return service, client, transaction_repository


def make_item(
    bank_id: str,
    timestamp: int,
) -> MonobankStatementItem:
    return MonobankStatementItem.model_validate(
        {
            "id": bank_id,
            "time": timestamp,
            "description": "Test purchase",
            "amount": -15_000,
            "operationAmount": -15_000,
            "currencyCode": 980,
            "mcc": 5411,
            "balance": 1_000_000,
            "commissionRate": 0,
        }
    )


def test_sync_transactions_counts_only_new(
    dependencies: tuple[BankSyncService, Mock, Mock],
) -> None:
    service, client, repository = dependencies

    client.get_statement.return_value = [
        make_item("tx-1", FROM + 100),
        make_item("tx-2", FROM + 200),
    ]
    repository.insert_if_not_exists.side_effect = [True, False]

    result = service.sync_transactions(FROM, TO)

    assert result == 1
    client.get_statement.assert_called_once_with(
        account_id="account-123",
        from_timestamp=FROM,
        to_timestamp=TO,
    )
    assert repository.insert_if_not_exists.call_count == 2

    transaction = repository.insert_if_not_exists.call_args_list[0].args[0]

    assert transaction == Transaction(
        bank_id="tx-1",
        occurred_at=datetime.fromtimestamp(FROM + 100, tz=UTC),
        amount_minor=-15_000,
        operation_amount_minor=-15_000,
        operation_currency_code=980,
        balance_minor=1_000_000,
        mcc=5411,
        commission_minor=0,
    )


def test_sync_transactions_empty(
    dependencies: tuple[BankSyncService, Mock, Mock],
) -> None:
    service, client, repository = dependencies
    client.get_statement.return_value = []

    assert service.sync_transactions(FROM, TO) == 0
    repository.insert_if_not_exists.assert_not_called()


def test_sync_transactions_all_duplicates(
    dependencies: tuple[BankSyncService, Mock, Mock],
) -> None:
    service, client, repository = dependencies
    client.get_statement.return_value = [make_item("tx-1", FROM)]
    repository.insert_if_not_exists.return_value = False

    assert service.sync_transactions(FROM, TO) == 0


def test_sync_transactions_monobank_failure(
    dependencies: tuple[BankSyncService, Mock, Mock],
) -> None:
    service, client, repository = dependencies
    client.get_statement.side_effect = RuntimeError("Monobank unavailable")

    with pytest.raises(RuntimeError, match="Monobank unavailable"):
        service.sync_transactions(FROM, TO)

    repository.insert_if_not_exists.assert_not_called()


def test_sync_transactions_repository_failure(
    dependencies: tuple[BankSyncService, Mock, Mock],
) -> None:
    service, client, repository = dependencies
    client.get_statement.return_value = [make_item("tx-1", FROM)]
    repository.insert_if_not_exists.side_effect = RuntimeError("DynamoDB unavailable")

    with pytest.raises(RuntimeError, match="DynamoDB unavailable"):
        service.sync_transactions(FROM, TO)
