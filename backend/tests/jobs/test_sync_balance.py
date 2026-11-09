from unittest.mock import MagicMock, patch, sentinel

import pytest
from pydantic import SecretStr

from app.core.settings import Settings
from app.jobs.sync_balance import run_balance_sync
from app.repositories.balance import BalanceRepository


def test_run_balance_sync() -> None:
    settings = Settings.model_construct(
        monobank_account_id="account-123",
        monobank_api_token=SecretStr("test-token"),
        dynamodb_table_name="test-table",
    )

    dynamodb_client = MagicMock()
    http_client = MagicMock()

    with (
        patch(
            "app.jobs.sync_balance.Settings.settings_cached",
            return_value=settings,
        ),
        patch(
            "app.jobs.sync_balance.get_dynamodb_client",
            return_value=dynamodb_client,
        ) as get_dynamodb_client,
        patch("app.jobs.sync_balance.httpx.Client") as http_client_class,
        patch("app.jobs.sync_balance.MonobankClient") as monobank_class,
        patch("app.jobs.sync_balance.BankSyncService") as service_class,
    ):
        http_client_class.return_value.__enter__.return_value = http_client
        service_class.return_value.sync_balance.return_value = sentinel.snapshot

        result = run_balance_sync()

        get_dynamodb_client.assert_called_once_with(settings)
        monobank_class.assert_called_once_with(
            token="test-token",
            http_client=http_client,
        )

        kwargs = service_class.call_args.kwargs

        assert kwargs["settings"] is settings
        assert kwargs["monobank_client"] is monobank_class.return_value

        repository = kwargs["balance_repository"]
        assert isinstance(repository, BalanceRepository)
        assert repository.client is dynamodb_client
        assert repository.table_name == "test-table"

        service_class.return_value.sync_balance.assert_called_once_with()
        http_client_class.return_value.__exit__.assert_called_once()
        assert result is sentinel.snapshot


def test_run_balance_sync_requires_token() -> None:
    settings = Settings.model_construct(
        monobank_account_id="account-123",
        monobank_api_token=None,
        dynamodb_table_name="test-table",
    )

    with (
        patch(
            "app.jobs.sync_balance.Settings.settings_cached",
            return_value=settings,
        ),
        patch("app.jobs.sync_balance.get_dynamodb_client") as get_client,
    ):
        with pytest.raises(
            ValueError,
            match="MONOBANK_API_TOKEN is required",
        ):
            run_balance_sync()

        get_client.assert_not_called()
