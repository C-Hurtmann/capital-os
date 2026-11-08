from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.helpers import ACCOUNT_ID_PLACEHOLDER
from app.models.transaction import Transaction
from app.repositories.base import BaseRepository

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.type_defs import AttributeValueTypeDef, QueryInputTypeDef


class TransactionRepository(BaseRepository):
    @staticmethod
    def _to_transaction(item: dict[str, AttributeValueTypeDef]) -> Transaction:
        return Transaction(
            bank_id=item["bankId"]["S"],
            occurred_at=datetime.fromtimestamp(
                int(item["occurredAtMs"]["N"]) / 1000, tz=UTC
            ),
            amount_minor=int(item["amountMinor"]["N"]),
            operation_amount_minor=int(item["operationAmountMinor"]["N"]),
            operation_currency_code=int(item["operationCurrencyCode"]["N"]),
            balance_minor=int(item["balanceMinor"]["N"]),
            mcc=int(item["mcc"]["N"]),
            commission_minor=int(item["commissionMinor"]["N"]),
        )

    def query_period_page(
        self,
        from_ms: int,
        to_ms: int,
        exclusive_start_key: dict[str, AttributeValueTypeDef] | None = None,
    ) -> tuple[list[Transaction], dict[str, AttributeValueTypeDef] | None]:
        if from_ms >= to_ms:
            raise ValueError("from_ms must be less than to_ms")

        params: QueryInputTypeDef = {
            "TableName": self.table_name,
            "KeyConditionExpression": "PK = :pk AND SK BETWEEN :start AND :end",
            "ExpressionAttributeValues": {
                ":pk": {"S": f"ACCOUNT#{ACCOUNT_ID_PLACEHOLDER}"},
                ":start": {"S": f"TX#{from_ms:013d}"},
                ":end": {"S": f"TX#{to_ms:013d}"},
            },
            "ScanIndexForward": False,
            "Limit": 50,
        }
        if exclusive_start_key:
            params["ExclusiveStartKey"] = exclusive_start_key

        response = self.client.query(**params)
        transactions = [self._to_transaction(item) for item in response["Items"]]
        return transactions, response.get("LastEvaluatedKey")
