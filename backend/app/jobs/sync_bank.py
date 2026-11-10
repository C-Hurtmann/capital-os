from datetime import UTC, datetime

import httpx

from app.core.dynamodb import get_dynamodb_client
from app.core.settings import Settings
from app.integrations.monobank.client import MonobankClient
from app.repositories.balance import BalanceRepository
from app.repositories.transactions import TransactionRepository
from app.services.bank_sync import BankSyncService

MAX_STATEMENT_WINDOW_SECONDS = 2_682_000


def run_scheduled_bank_sync() -> int:
    to_timestamp = int(datetime.now(UTC).timestamp())

    return run_bank_sync(
        from_timestamp=to_timestamp - MAX_STATEMENT_WINDOW_SECONDS,
        to_timestamp=to_timestamp,
    )


def run_bank_sync(from_timestamp: int, to_timestamp: int) -> int:
    settings = Settings.settings_cached()

    if settings.monobank_api_token is None:
        raise ValueError("MONOBANK_API_TOKEN is required")

    dynamodb_client = get_dynamodb_client(settings)

    balance_repository = BalanceRepository(
        client=dynamodb_client,
        table_name=settings.dynamodb_table_name,
    )
    transaction_repository = TransactionRepository(
        client=dynamodb_client,
        table_name=settings.dynamodb_table_name,
    )

    with httpx.Client() as http_client:
        monobank_client = MonobankClient(
            token=settings.monobank_api_token.get_secret_value(),
            http_client=http_client,
        )

        service = BankSyncService(
            settings=settings,
            monobank_client=monobank_client,
            balance_repository=balance_repository,
            transaction_repository=transaction_repository,
        )

        inserted_count = service.sync_transactions(
            from_timestamp=from_timestamp,
            to_timestamp=to_timestamp,
        )
        if inserted_count > 0:
            service.sync_balance()

        return inserted_count
