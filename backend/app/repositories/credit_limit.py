from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.models.credit_limit import CreditLimit

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.client import DynamoDBClient


class CreditLimitRepository:
    def __init__(self, client: DynamoDBClient, table_name: str) -> None:
        self.client = client
        self.table_name = table_name

    def get_current(self, account_id: str) -> CreditLimit | None:
        response = self.client.get_item(
            TableName=self.table_name,
            Key={"PK": {"S": f"ACCOUNT#{account_id}"}, "SK": {"S": "CREDIT_LIMIT"}},
            ConsistentRead=True,
        )

        item = response.get("Item")
        if item is None:
            return None

        return CreditLimit(
            account_id=account_id,
            credit_limit_minor=int(item["creditLimitMinor"]["N"]),
            effective_from=datetime.fromtimestamp(
                int(item["effectiveFromMs"]["N"]) / 1000,
                tz=UTC,
            ),
        )

    def set_current(self, credit_limit: CreditLimit) -> None:
        self.client.put_item(
            TableName=self.table_name,
            Item={
                "PK": {"S": f"ACCOUNT#{credit_limit.account_id}"},
                "SK": {"S": "CREDIT_LIMIT"},
                "creditLimitMinor": {
                    "N": str(credit_limit.credit_limit_minor),
                },
                "effectiveFromMs": {
                    "N": str(int(credit_limit.effective_from.timestamp() * 1000)),
                },
            },
        )
