from datetime import UTC, datetime

from app.core.settings import Settings
from app.helpers import ACCOUNT_ID_PLACEHOLDER
from app.integrations.monobank import MonobankClient
from app.models.balance_snapshot import BalanceSnapshot
from app.repositories.balance import BalanceRepository

UAH_CURRENCY_CODE = 980


class BankSyncService:
    def __init__(
        self,
        settings: Settings,
        monobank_client: MonobankClient,
        balance_repository: BalanceRepository,
    ) -> None:
        self._settings = settings
        self._monobank_client = monobank_client
        self._balance_repository = balance_repository

    def sync_balance(self) -> BalanceSnapshot:
        client_info = self._monobank_client.get_client_info()
        account = client_info.get_account(self._settings.monobank_account_id)

        if account is None:
            raise LookupError("Configured Monobank account was not found")

        if account.currency_code != UAH_CURRENCY_CODE:
            raise ValueError("Configured Monobank account must be UAH")

        snapshot = BalanceSnapshot(
            account_id=ACCOUNT_ID_PLACEHOLDER,
            bank_balance_minor=account.balance,
            fetched_at=datetime.now(UTC),
        )

        self._balance_repository.save_snapshot(snapshot)
        return snapshot
