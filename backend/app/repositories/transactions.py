from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from botocore.exceptions import ClientError

from app.constants import ACCOUNT_ID_PLACEHOLDER
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

    def query_period(self, from_ms: int, to_ms: int) -> list[Transaction]:
        transactions = []
        last_key = None

        while True:
            page, last_key = self.query_period_page(
                from_ms=from_ms,
                to_ms=to_ms,
                exclusive_start_key=last_key,
            )
            transactions.extend(page)

            if not last_key:
                return transactions

    def insert_if_not_exists(self, transaction: Transaction) -> bool:
        occurred_at_ms = int(transaction.occurred_at.timestamp() * 1000)

        try:
            self.client.put_item(
                TableName=self.table_name,
                Item={
                    "PK": {
                        "S": f"ACCOUNT#{ACCOUNT_ID_PLACEHOLDER}",
                    },
                    "SK": {
                        "S": f"TX#{occurred_at_ms:013d}#{transaction.bank_id}",
                    },
                    "bankId": {"S": transaction.bank_id},
                    "occurredAtMs": {"N": str(occurred_at_ms)},
                    "amountMinor": {
                        "N": str(transaction.amount_minor),
                    },
                    "operationAmountMinor": {
                        "N": str(transaction.operation_amount_minor),
                    },
                    "operationCurrencyCode": {
                        "N": str(transaction.operation_currency_code),
                    },
                    "balanceMinor": {
                        "N": str(transaction.balance_minor),
                    },
                    "mcc": {"N": str(transaction.mcc)},
                    "commissionMinor": {
                        "N": str(transaction.commission_minor),
                    },
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as exc:
            if (
                exc.response.get("Error", {}).get("Code")
                == "ConditionalCheckFailedException"
            ):
                return False
            raise

        return True
