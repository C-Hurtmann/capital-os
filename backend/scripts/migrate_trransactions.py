import argparse
import csv
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

CSV_PATH = Path("/tmp/capital-os-transactions.csv")
TABLE_NAME = "capital-os-local"
ACCOUNT_ID = "monobank-main"


def to_item(row: dict[str, str]) -> dict:
    bank_id = row["bank_id"]
    if not bank_id:
        raise ValueError("Empty bank_id")

    timestamp_ms = int(row["unix_time"]) * 1000

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


def load_items() -> list[dict]:
    items = []
    seen_ids = set()

    with CSV_PATH.open(newline="", encoding="utf-8") as file:
        for line_number, row in enumerate(csv.DictReader(file), start=2):
            try:
                item = to_item(row)
            except (ValueError, TypeError, KeyError) as exc:
                raise ValueError(f"Invalid CSV row at line {line_number}") from exc

            if item["bankId"] in seen_ids:
                raise ValueError(f"Duplicate bankId at line {line_number}")

            seen_ids.add(item["bankId"])
            items.append(item)
    return items


def import_items(items: list[dict]) -> None:
    dynamodb = boto3.resource(
        "dynamodb",
        endpoint_url="http://127.0.0.1:8000",
        region_name="eu-central-1",
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )
    table = dynamodb.Table(TABLE_NAME)

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
            if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise

            existing = table.get_item(
                Key={"PK": item["PK"], "SK": item["SK"]},
                ConsistentRead=True,
            )["Item"]

            if existing != item:
                raise ValueError(f"Existing transaction differs: {item['SK']}") from exc

            skipped += 1

    print(f"Imported: {imported}, already present: {skipped}")


def verify_items(items: list[dict]) -> None:
    expected = {(item["PK"], item["SK"]): item for item in items}

    dynamodb = boto3.resource(
        "dynamodb",
        endpoint_url="http://127.0.0.1:8000",
        region_name="eu-central-1",
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )
    table = dynamodb.Table(TABLE_NAME)

    verified = 0
    scan_args = {"ConsistentRead": True}

    while True:
        response = table.scan(**scan_args)

        for actual in response["Items"]:
            key = (actual["PK"], actual["SK"])

            if key not in expected:
                raise ValueError(f"Unexpected item: {key}")

            if actual != expected.pop(key):
                raise ValueError(f"Data mismatch: {key}")

            verified += 1

        if "LastEvaluatedKey" not in response:
            break

        scan_args["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    if expected:
        raise ValueError(f"Missing transactions: {len(expected)}")

    print(f"Verified: {verified} transactions")
    print("All fields match the source CSV.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    items = load_items()

    print(f"Validated transactions: {len(items)}")
    print(f"Example item: {items[0]}")

    if args.verify:
        verify_items(items)
    elif args.apply:
        import_items(items)
    else:
        print("Dry-run successful. No data written.")


if __name__ == "__main__":
    main()
