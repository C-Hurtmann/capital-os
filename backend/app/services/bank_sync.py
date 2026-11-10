import logging
from datetime import UTC, datetime

from app.core.settings import Settings
from app.helpers import ACCOUNT_ID_PLACEHOLDER
from app.integrations.monobank import MonobankClient
from app.models.balance_snapshot import BalanceSnapshot
from app.models.transaction import Transaction
from app.repositories.balance import BalanceRepository
from app.repositories.transactions import TransactionRepository

UAH_CURRENCY_CODE = 980

logger = logging.getLogger(__name__)


class BankSyncService:
    def __init__(
        self,
        settings: Settings,
        monobank_client: MonobankClient,
        balance_repository: BalanceRepository,
        transaction_repository: TransactionRepository,
    ) -> None:
        self._settings = settings
        self._monobank_client = monobank_client
        self._balance_repository = balance_repository
        self._transaction_repository = transaction_repository

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
        logger.info("Saved balance snapshot")
        return snapshot

    def sync_transactions(self, from_timestamp: int, to_timestamp: int) -> int:
        statement = self._monobank_client.get_statement(
            account_id=self._settings.monobank_account_id,
            from_timestamp=from_timestamp,
            to_timestamp=to_timestamp,
        )

        inserted_count = 0

        for item in statement:
            transaction = Transaction(
                bank_id=item.id,
                occurred_at=datetime.fromtimestamp(
                    item.time,
                    tz=UTC,
                ),
                amount_minor=item.amount,
                operation_amount_minor=item.operation_amount,
                operation_currency_code=item.currency_code,
                balance_minor=item.balance,
                mcc=item.mcc,
                commission_minor=item.commission_rate,
            )

            if self._transaction_repository.insert_if_not_exists(transaction):
                inserted_count += 1
        logger.info(f"Inserted {inserted_count} transactions")
        return inserted_count
