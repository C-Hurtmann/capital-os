#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/logs"
chmod 700 "$ROOT/logs"

exec >> "$ROOT/logs/bank-sync.log" 2>&1
export TZ=Europe/Kyiv

echo "=== $(date '+%F %T %Z') | START ==="

trap 'status=$?; echo "=== $(date "+%F %T %Z") | EXIT: $status ==="; echo' EXIT

cd "$ROOT"

# Wait for Docker Desktop to become available in WSL.
for attempt in {1..60}; do
    if docker info >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

docker compose up -d dynamodb

"$ROOT/.venv/bin/python" - <<'PY'
import time
from datetime import UTC, datetime

from app.core.dynamodb import get_dynamodb_client
from app.core.settings import Settings
from app.jobs.sync_bank import run_bank_sync

settings = Settings.settings_cached()

if settings.dynamodb_endpoint_url not in (
    "http://127.0.0.1:8000",
    "http://localhost:8000",
):
    raise RuntimeError("Expected DynamoDB Local endpoint")

client = get_dynamodb_client(settings)

for attempt in range(30):
    try:
        client.describe_table(TableName=settings.dynamodb_table_name)
        break
    except Exception:
        if attempt == 29:
            raise
        time.sleep(2)

now = int(datetime.now(UTC).timestamp())

inserted_count = run_bank_sync(
    from_timestamp=now - 2_682_000,
    to_timestamp=now,
)

print(f"SYNC_OK: inserted={inserted_count}", flush=True)
PY
