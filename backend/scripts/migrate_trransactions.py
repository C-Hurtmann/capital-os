"""One-time, insert-only migration of legacy PostgreSQL transaction CSV to DynamoDB Local.

Expected CSV headers:
    bank_id,unix_time,mcc,amount,operation_amount,currency_code,commission_rate,balance

Default mode validates the file without writing. --apply inserts only missing items
and verifies all imported source fields. --verify checks a previous import.
"""

import argparse
import csv
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import ClientError

DEFAULT_CSV_PATH = Path("/tmp/capital-os-transactions.csv")
TABLE_NAME = "capital-os-local"
ACCOUNT_ID = "monobank-main"
ENDPOINT_URL = "http://127.0.0.1:8000"
REQUIRED_COLUMNS = {
    "bank_id",
    "unix_time",
    "mcc",
    "amount",
    "operation_amount",
    "currency_code",
    "commission_rate",
    "balance",
}


def to_item(row: dict[str, str]) -> dict[str, Any]:
    bank_id = row["bank_id"].strip()
    if not bank_id:
        raise ValueError("Empty bank_id")

    unix_time = int(row["unix_time"])
    if unix_time < 0:
        raise ValueError("Negative unix_time")
    timestamp_ms = unix_time * 1000

    return {
        "PK": f"ACCOUNT#{ACCOUNT_ID}",
        "SK": f"TX#{timestamp_ms:013d}#{bank_id}",
        "bankId": bank_id,
        "occurredAtMs": timestamp_ms,
        "amountMinor": int(row["amount"]),
        "operationAmountMinor": int(row["operation_amount"]),
        "operationCurrencyCode": int(row["currency_code"]),
        "balanceMinor": int(row["balance"]),
        "mcc": int(row["mcc"]),
        "commissionMinor": int(row["commission_rate"]),
    }


def load_items(csv_path: Path) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    with csv_path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing CSV columns: {', '.join(sorted(missing))}")

        for line_number, row in enumerate(reader, start=2):
            try:
                item = to_item(row)
            except (ValueError, TypeError, KeyError, AttributeError) as exc:
                raise ValueError(
                    f"Invalid CSV row at line {line_number}: {exc}"
                ) from exc

            if item["bankId"] in seen_ids:
                raise ValueError(
                    f"Duplicate bankId at line {line_number}: {item['bankId']}"
                )

            seen_ids.add(item["bankId"])
            items.append(item)

    if not items:
        raise ValueError("The CSV contains no transactions")

    return items


def get_table() -> Any:
    dynamodb = boto3.resource(
        "dynamodb",
        endpoint_url=ENDPOINT_URL,
        region_name="eu-central-1",
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )
    return dynamodb.Table(TABLE_NAME)


def assert_source_fields_match(
    actual: dict[str, Any],
    expected: dict[str, Any],
) -> None:
    # Existing transactions may have app-owned attributes (e.g., category overrides).
    # Compare only source fields; do not overwrite or reject additional attributes.
    differences = [
        field
        for field, expected_value in expected.items()
        if actual.get(field) != expected_value
    ]
    if differences:
        raise ValueError(
            f"Existing transaction differs: {expected['SK']}; "
            f"fields: {', '.join(differences)}"
        )


def import_items(items: list[dict[str, Any]], table: Any) -> None:
    imported = 0
    skipped = 0

    for item in items:
        try:
            table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(PK)",
            )
            imported += 1
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != (
                "ConditionalCheckFailedException"
            ):
                raise

            existing = table.get_item(
                Key={"PK": item["PK"], "SK": item["SK"]},
                ConsistentRead=True,
            ).get("Item")

            if existing is None:
                raise RuntimeError(
                    f"Transaction disappeared during import: {item['SK']}"
                ) from exc

            assert_source_fields_match(existing, item)
            skipped += 1

    print(f"Imported: {imported}, already present: {skipped}")


def verify_items(items: list[dict[str, Any]], table: Any) -> None:
    verified = 0

    # Do not scan the shared table:
    # it also contains BALANCE_SNAPSHOT and other records.
    for item in items:
        actual = table.get_item(
            Key={"PK": item["PK"], "SK": item["SK"]},
            ConsistentRead=True,
        ).get("Item")

        if actual is None:
            raise ValueError(f"Missing transaction: {item['SK']}")

        assert_source_fields_match(actual, item)
        verified += 1

    print(f"Verified: {verified} transactions")
    print("All source fields match the CSV. Other DynamoDB items were not modified.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)

    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--apply", action="store_true")
    actions.add_argument("--verify", action="store_true")

    args = parser.parse_args()

    items = load_items(args.csv)
    print(f"Validated transactions: {len(items)}")
    print(f"Example item: {items[0]}")

    if not (args.apply or args.verify):
        print("Dry-run successful. No data written.")
        return

    table = get_table()

    if args.apply:
        import_items(items, table)

    verify_items(items, table)


if __name__ == "__main__":
    main()
