from __future__ import annotations

from datetime import UTC, datetime

from botocore.exceptions import ClientError

from app.models.credit_limit import CreditLimit
from app.repositories.base import BaseRepository


class CreditLimitRepository(BaseRepository):
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

    def set_current(self, credit_limit: CreditLimit) -> CreditLimit:
        account_id = credit_limit.account_id
        key = {
            "PK": {"S": f"ACCOUNT#{account_id}"},
            "SK": {"S": "CREDIT_LIMIT"},
        }
        effective_from_ms = int(credit_limit.effective_from.timestamp() * 1000)

        for attempt in range(3):
            current = self.get_current(account_id)

            values = {
                ":amount": {"N": str(credit_limit.credit_limit_minor)},
                ":effective_from": {"N": str(effective_from_ms)},
            }

            if current is None:
                condition = "attribute_not_exists(PK)"
            else:
                condition = "#amount = :old_amount AND #effective_from = :old_time"
                values[":old_amount"] = {"N": str(current.credit_limit_minor)}
                values[":old_time"] = {
                    "N": str(int(current.effective_from.timestamp() * 1000))
                }

            try:
                response = self.client.update_item(
                    TableName=self.table_name,
                    Key=key,
                    UpdateExpression=(
                        "SET #amount = :amount, #effective_from = :effective_from"
                    ),
                    ConditionExpression=condition,
                    ExpressionAttributeNames={
                        "#amount": "creditLimitMinor",
                        "#effective_from": "effectiveFromMs",
                    },
                    ExpressionAttributeValues=values,
                    ReturnValues="ALL_NEW",
                )
            except ClientError as exc:
                if (
                    exc.response["Error"]["Code"] != "ConditionalCheckFailedException"
                    or attempt == 2
                ):
                    raise
                continue

            item = response["Attributes"]
            return CreditLimit(
                account_id=account_id,
                credit_limit_minor=int(item["creditLimitMinor"]["N"]),
                effective_from=datetime.fromtimestamp(
                    int(item["effectiveFromMs"]["N"]) / 1000,
                    tz=UTC,
                ),
            )

        raise RuntimeError("Unreachable credit limit update state")
