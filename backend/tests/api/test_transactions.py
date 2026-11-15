from dataclasses import replace
from datetime import UTC, date, datetime
from unittest.mock import Mock
from uuid import UUID

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi.testclient import TestClient
from httpx import Response

from app.core.transaction_cursor import (
    InvalidCursorError,
    TransactionCursorCodec,
)
from app.main import app
from app.models.transaction import Transaction
from app.repositories.transactions import TransactionRepository
from app.services.transactions import TransactionsResult, TransactionsService

ENDPOINT = "/api/v1/transactions"
COMPUTED_AT = datetime(2026, 11, 15, 10, tzinfo=UTC)


def make_transaction(
    bank_id: str,
    hour: int,
    amount_minor: int,
) -> Transaction:
    return Transaction(
        bank_id=bank_id,
        occurred_at=datetime(2026, 11, 14, hour, tzinfo=UTC),
        amount_minor=amount_minor,
        operation_amount_minor=amount_minor,
        operation_currency_code=980,
        balance_minor=100_000,
        mcc=5411,
        commission_minor=0,
    )


def make_result() -> TransactionsResult:
    return TransactionsResult(
        computed_at=COMPUTED_AT,
        items=(
            make_transaction("z", 12, -1000),
            make_transaction("y", 11, 500),
        ),
        next_cursor=None,
    )


def request_with_service(
    service: Mock,
    endpoint: str = ENDPOINT,
) -> Response:
    app.dependency_overrides[TransactionsService] = lambda: service

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            return client.get(endpoint)
    finally:
        app.dependency_overrides.pop(TransactionsService, None)


def assert_problem_response(
    response: Response,
    status: int,
    title: str,
) -> None:
    assert response.status_code == status
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["type"] == "about:blank"
    assert body["title"] == title
    assert body["status"] == status

    UUID(body["requestId"])


def test_get_transactions() -> None:
    service = Mock(spec=TransactionsService)
    service.get_transactions.return_value = make_result()

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json() == {
        "computedAt": "2026-11-15T10:00:00Z",
        "timeZone": "Europe/Kyiv",
        "currency": "UAH",
        "items": [
            {
                "bankId": "z",
                "occurredAt": "2026-11-14T12:00:00Z",
                "amountMinor": -1000,
                "operationAmountMinor": -1000,
                "operationCurrencyCode": 980,
                "balanceMinor": 100000,
                "mcc": 5411,
                "commissionMinor": 0,
                "categoryId": "groceries",
            },
            {
                "bankId": "y",
                "occurredAt": "2026-11-14T11:00:00Z",
                "amountMinor": 500,
                "operationAmountMinor": 500,
                "operationCurrencyCode": 980,
                "balanceMinor": 100000,
                "mcc": 5411,
                "commissionMinor": 0,
                "categoryId": None,
            },
        ],
        "nextCursor": None,
    }


def test_query_parameters() -> None:
    service = Mock(spec=TransactionsService)
    service.get_transactions.return_value = make_result()

    response = request_with_service(
        service,
        (
            f"{ENDPOINT}?"
            "from=2026-11-01&"
            "to=2026-11-15&"
            "direction=expense&"
            "limit=5&"
            "cursor=example"
        ),
    )

    assert response.status_code == 200

    query = service.get_transactions.call_args.args[0]

    assert query.from_date == date(2026, 11, 1)
    assert query.to_date == date(2026, 11, 15)
    assert query.direction == "expense"
    assert query.limit == 5
    assert query.cursor == "example"


def test_empty_page_with_continuation() -> None:
    service = Mock(spec=TransactionsService)
    service.get_transactions.return_value = replace(
        make_result(),
        items=(),
        next_cursor="signed-cursor",
    )

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["nextCursor"] == "signed-cursor"


@pytest.mark.parametrize(
    "parameters",
    [
        "direction=transfer",
        "direction=",
        "limit=0",
        "limit=51",
        "limit=-1",
        "limit=1.5",
        "from=2026-02-30",
        "from=2026-11-15&to=2026-11-14",
        "categoryId=groceries",
        "minAmountMinor=100",
        "sort=asc",
        "cursor=",
    ],
)
def test_invalid_query_returns_422(parameters: str) -> None:
    service = Mock(spec=TransactionsService)

    response = request_with_service(
        service,
        f"{ENDPOINT}?{parameters}",
    )

    assert_problem_response(response, 422, "Unprocessable Content")
    service.get_transactions.assert_not_called()


def test_duplicate_parameter_returns_422() -> None:
    service = Mock(spec=TransactionsService)

    response = request_with_service(
        service,
        f"{ENDPOINT}?limit=5&limit=10",
    )

    assert_problem_response(response, 422, "Unprocessable Content")


@pytest.mark.parametrize(
    "error",
    [
        InvalidCursorError("Invalid cursor"),
        ValueError("Date cannot be after cutoff"),
    ],
)
def test_service_validation_returns_422(error: ValueError) -> None:
    service = Mock(spec=TransactionsService)
    service.get_transactions.side_effect = error

    response = request_with_service(service)

    assert_problem_response(response, 422, "Unprocessable Content")
    assert str(error) not in response.text


@pytest.mark.parametrize(
    "error",
    [
        ClientError(
            {
                "Error": {
                    "Code": "ProvisionedThroughputExceededException",
                    "Message": "Throughput exceeded",
                }
            },
            "Query",
        ),
        EndpointConnectionError(
            endpoint_url="http://localhost:8000",
        ),
    ],
)
def test_storage_failure_returns_503(error: Exception) -> None:
    service = Mock(spec=TransactionsService)
    service.get_transactions.side_effect = error

    response = request_with_service(service)

    assert_problem_response(response, 503, "Service Unavailable")
    assert response.json()["detail"] == (
        "Transactions storage is temporarily unavailable"
    )
    assert "Throughput exceeded" not in response.text


def test_invalid_response_returns_500() -> None:
    service = Mock(spec=TransactionsService)

    result = make_result()
    service.get_transactions.return_value = replace(
        result,
        items=tuple(reversed(result.items)),
    )

    response = request_with_service(service)

    assert_problem_response(response, 500, "Internal Server Error")
    assert response.json()["detail"] == ("An unexpected error occurred")


def test_fastapi_dependency_injection() -> None:
    repository = Mock(spec=TransactionRepository)
    repository.query_cursor_batch.return_value = ([], None)

    codec = TransactionCursorCodec(
        secret="x" * 32,
        account_id="monobank-main",
    )

    app.dependency_overrides[TransactionRepository.get_repository] = lambda: repository
    app.dependency_overrides[TransactionCursorCodec.get_codec] = lambda: codec

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(ENDPOINT)

        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.json()["nextCursor"] is None

        repository.query_cursor_batch.assert_called_once()

    finally:
        app.dependency_overrides.pop(
            TransactionRepository.get_repository,
            None,
        )
        app.dependency_overrides.pop(
            TransactionCursorCodec.get_codec,
            None,
        )
