from unittest.mock import MagicMock, patch

import pytest
from pydantic import SecretStr

from app.core.settings import Settings
from app.jobs.sync_bank import run_bank_sync
from app.repositories.balance import BalanceRepository
from app.repositories.transactions import TransactionRepository

FROM = 1_760_000_000
TO = FROM + 3600


def test_run_bank_sync() -> None:
    settings = Settings.model_construct(
        monobank_account_id="account-123",
        monobank_api_token=SecretStr("test-token"),
        dynamodb_table_name="test-table",
    )

    dynamodb_client = MagicMock()
    http_client = MagicMock()

    with (
        patch(
            "app.jobs.sync_bank.Settings.settings_cached",
            return_value=settings,
        ),
        patch(
            "app.jobs.sync_bank.get_dynamodb_client",
            return_value=dynamodb_client,
        ) as get_dynamodb_client,
        patch("app.jobs.sync_bank.httpx.Client") as http_client_class,
        patch("app.jobs.sync_bank.MonobankClient") as monobank_class,
        patch("app.jobs.sync_bank.BankSyncService") as service_class,
    ):
        http_client_class.return_value.__enter__.return_value = http_client
        service = service_class.return_value
        service.sync_transactions.return_value = 2

        result = run_bank_sync(FROM, TO)

        assert result == 2
        get_dynamodb_client.assert_called_once_with(settings)

        monobank_class.assert_called_once_with(
            token="test-token",
            http_client=http_client,
        )

        service_class.assert_called_once()
        kwargs = service_class.call_args.kwargs

        assert kwargs["settings"] is settings
        assert kwargs["monobank_client"] is monobank_class.return_value

        balance_repository = kwargs["balance_repository"]
        transaction_repository = kwargs["transaction_repository"]

        assert isinstance(balance_repository, BalanceRepository)
        assert isinstance(transaction_repository, TransactionRepository)

        for repository in (balance_repository, transaction_repository):
            assert repository.client is dynamodb_client
            assert repository.table_name == "test-table"

        service.sync_transactions.assert_called_once_with(
            from_timestamp=FROM,
            to_timestamp=TO,
        )
        service.sync_balance.assert_called_once_with()

        http_client_class.return_value.__exit__.assert_called_once()


def test_run_bank_sync_requires_token() -> None:
    settings = Settings.model_construct(
        monobank_account_id="account-123",
        monobank_api_token=None,
        dynamodb_table_name="test-table",
    )

    with (
        patch(
            "app.jobs.sync_bank.Settings.settings_cached",
            return_value=settings,
        ),
        patch("app.jobs.sync_bank.get_dynamodb_client") as get_client,
    ):
        with pytest.raises(
            ValueError,
            match="MONOBANK_API_TOKEN is required",
        ):
            run_bank_sync(FROM, TO)

        get_client.assert_not_called()
