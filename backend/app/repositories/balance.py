from datetime import UTC, datetime

from app.models.balance_snapshot import BalanceSnapshot
from app.repositories.base import BaseRepository


class BalanceRepository(BaseRepository):
    def get_latest(self, account_id: str) -> BalanceSnapshot | None:
        response = self.client.get_item(
            TableName=self.table_name,
            Key={
                "PK": {"S": f"ACCOUNT#{account_id}"},
                "SK": {"S": "BALANCE_SNAPSHOT"},
            },
            ConsistentRead=True,
        )

        item = response.get("Item")
        if item is None:
            return None

        return BalanceSnapshot(
            account_id=account_id,
            bank_balance_minor=int(item["bankBalanceMinor"]["N"]),
            fetched_at=datetime.fromtimestamp(
                int(item["fetchedAtMs"]["N"]) / 1000,
                tz=UTC,
            ),
        )
