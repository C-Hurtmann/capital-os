import httpx

from app.core.dynamodb import get_dynamodb_client
from app.core.settings import Settings
from app.integrations.monobank.client import MonobankClient
from app.models.balance_snapshot import BalanceSnapshot
from app.repositories.balance import BalanceRepository
from app.services.bank_sync import BankSyncService


def run_balance_sync() -> BalanceSnapshot:
    settings = Settings.settings_cached()

    if settings.monobank_api_token is None:
        raise ValueError("MONOBANK_API_TOKEN is required")

    dynamodb_client = get_dynamodb_client(settings)

    balance_repository = BalanceRepository(
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
        )

        return service.sync_balance()
