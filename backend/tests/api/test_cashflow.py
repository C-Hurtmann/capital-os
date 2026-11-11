from datetime import UTC, date, datetime
from unittest.mock import Mock
from uuid import UUID

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi.testclient import TestClient

from app.constants import MAX_SAFE_INTEGER
from app.main import app
from app.repositories.transactions import TransactionRepository
from app.services.cashflow import CashflowResult, CashflowService

ENDPOINT = "/api/v1/cashflow/current"


def make_result(
    income: int = 0,
    expenses: int = 0,
) -> CashflowResult:
    return CashflowResult(
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 10),
        income_minor=income,
        expense_minor=expenses,
        computed_at=datetime(2026, 11, 10, 12, 30, tzinfo=UTC),
    )


def request_with_service(service: Mock) -> None:
    app.dependency_overrides[CashflowService] = lambda: service

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            return client.get(ENDPOINT)
    finally:
        app.dependency_overrides.pop(CashflowService, None)


def test_get_current_cashflow() -> None:
    service = Mock(spec=CashflowService)
    service.get_current.return_value = make_result(
        income=6_200_000,
        expenses=4_000_000,
    )

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json() == {
        "from": "2026-11-01",
        "to": "2026-11-10",
        "timeZone": "Europe/Kyiv",
        "currency": "UAH",
        "incomeMinor": 6_200_000,
        "expenseMinor": 4_000_000,
        "netMinor": 2_200_000,
        "computedAt": "2026-11-10T12:30:00Z",
    }

    service.get_current.assert_called_once_with()


def test_empty_cashflow_returns_zero_totals() -> None:
    service = Mock(spec=CashflowService)
    service.get_current.return_value = make_result()

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json()["incomeMinor"] == 0
    assert response.json()["expenseMinor"] == 0
    assert response.json()["netMinor"] == 0


@pytest.mark.parametrize(
    ("income", "expenses", "expected_net"),
    [
        (MAX_SAFE_INTEGER, 0, MAX_SAFE_INTEGER),
        (0, MAX_SAFE_INTEGER, -MAX_SAFE_INTEGER),
    ],
)
def test_safe_integer_boundaries(
    income: int,
    expenses: int,
    expected_net: int,
) -> None:
    service = Mock(spec=CashflowService)
    service.get_current.return_value = make_result(
        income=income,
        expenses=expenses,
    )

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json()["netMinor"] == expected_net


@pytest.mark.parametrize(
    ("income", "expenses"),
    [
        (MAX_SAFE_INTEGER + 1, 0),
        (0, MAX_SAFE_INTEGER + 1),
    ],
)
def test_unsafe_integer_returns_500(
    income: int,
    expenses: int,
) -> None:
    service = Mock(spec=CashflowService)
    service.get_current.return_value = make_result(
        income=income,
        expenses=expenses,
    )

    response = request_with_service(service)

    assert response.status_code == 500
    assert response.headers["content-type"] == ("application/problem+json")
    assert response.json()["title"] == "Internal Server Error"


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
        EndpointConnectionError(endpoint_url="http://localhost:8000"),
    ],
)
def test_storage_failure_returns_503(
    error: Exception,
) -> None:
    service = Mock(spec=CashflowService)
    service.get_current.side_effect = error

    response = request_with_service(service)

    assert response.status_code == 503
    assert response.headers["content-type"] == ("application/problem+json")

    body = response.json()

    assert set(body) == {
        "type",
        "title",
        "status",
        "detail",
        "requestId",
    }
    assert body["status"] == 503
    assert body["title"] == "Service Unavailable"
    assert body["detail"] == ("Cashflow storage is temporarily unavailable")

    UUID(body["requestId"])


def test_fastapi_dependency_injection() -> None:
    repository = Mock(spec=TransactionRepository)
    repository.query_period_page.return_value = ([], None)

    app.dependency_overrides[TransactionRepository.get_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get(ENDPOINT)

        assert response.status_code == 200
        assert response.json()["netMinor"] == 0
        repository.query_period_page.assert_called_once()

    finally:
        app.dependency_overrides.pop(
            TransactionRepository.get_repository,
            None,
        )
