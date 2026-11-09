from datetime import UTC, datetime

from app.models.balance_snapshot import BalanceSnapshot
from app.repositories.base import BaseRepository


class BalanceRepository(BaseRepository):
    def get_snapshot(self, account_id: str) -> BalanceSnapshot | None:
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

    def save_snapshot(self, snapshot: BalanceSnapshot) -> None:
        timestamp_ms = int(snapshot.fetched_at.timestamp() * 1000)
        self.client.put_item(
            TableName=self.table_name,
            Item={
                "PK": {
                    "S": f"ACCOUNT#{snapshot.account_id}",
                },
                "SK": {
                    "S": "BALANCE_SNAPSHOT",
                },
                "bankBalanceMinor": {
                    "N": str(snapshot.bank_balance_minor),
                },
                "fetchedAtMs": {"N": str(timestamp_ms)},
            },
            ConditionExpression=(
                "attribute_not_exists(PK) OR fetchedAtMs < :new_timestamp"
            ),
            ExpressionAttributeValues={
                ":new_timestamp": {"N": str(timestamp_ms)},
            },
        )
