from dataclasses import replace
from datetime import UTC, date, datetime
from unittest.mock import Mock
from uuid import UUID

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi.testclient import TestClient
from httpx import Response

from app.constants import MAX_SAFE_INTEGER
from app.main import app
from app.repositories.transactions import TransactionRepository
from app.services.spending import (
    SpendingCategory,
    SpendingResult,
    SpendingService,
)

ENDPOINT = "/api/v1/spending/categories"


def make_result(
    categories: tuple[SpendingCategory, ...] = (
        SpendingCategory("groceries", 4000),
        SpendingCategory("dining", 2000),
    ),
) -> SpendingResult:
    return SpendingResult(
        from_date=date(2026, 11, 1),
        to_date=date(2026, 11, 10),
        computed_at=datetime(2026, 11, 10, 12, tzinfo=UTC),
        total_minor=sum(item.amount_minor for item in categories),
        categories=categories,
    )


def request_with_service(service: Mock) -> Response:
    app.dependency_overrides[SpendingService] = lambda: service

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            return client.get(ENDPOINT)
    finally:
        app.dependency_overrides.pop(SpendingService, None)


def test_get_spending_categories() -> None:
    service = Mock(spec=SpendingService)
    service.get_current.return_value = make_result()

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json() == {
        "from": "2026-11-01",
        "to": "2026-11-10",
        "computedAt": "2026-11-10T12:00:00Z",
        "timeZone": "Europe/Kyiv",
        "currency": "UAH",
        "totalMinor": 6000,
        "categories": [
            {"id": "groceries", "amountMinor": 4000},
            {"id": "dining", "amountMinor": 2000},
        ],
    }

    service.get_current.assert_called_once_with()


def test_empty_spending() -> None:
    service = Mock(spec=SpendingService)
    service.get_current.return_value = make_result(())

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json()["totalMinor"] == 0
    assert response.json()["categories"] == []


@pytest.mark.parametrize(
    "invalid_result",
    [
        replace(make_result(), total_minor=999),
        replace(
            make_result(),
            categories=(
                SpendingCategory("groceries", 4000),
                SpendingCategory("groceries", 2000),
            ),
        ),
        make_result(
            (
                SpendingCategory("unknown_id", 4000),
                SpendingCategory("dining", 2000),
            )
        ),
        make_result(
            (
                SpendingCategory("groceries", 0),
                SpendingCategory("dining", 2000),
            )
        ),
        make_result(
            (
                SpendingCategory("dining", 2000),
                SpendingCategory("groceries", 4000),
            )
        ),
        replace(make_result(), total_minor=MAX_SAFE_INTEGER + 1),
        replace(make_result(), from_date=date(2026, 10, 1)),
    ],
)
def test_invalid_result_returns_500(
    invalid_result: SpendingResult,
) -> None:
    service = Mock(spec=SpendingService)
    service.get_current.return_value = invalid_result

    response = request_with_service(service)

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"
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
def test_storage_failure_returns_503(error: Exception) -> None:
    service = Mock(spec=SpendingService)
    service.get_current.side_effect = error

    response = request_with_service(service)

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["status"] == 503
    assert body["title"] == "Service Unavailable"
    assert body["detail"] == "Spending storage is temporarily unavailable"

    UUID(body["requestId"])


def test_fastapi_dependency_injection() -> None:
    repository = Mock(spec=TransactionRepository)
    repository.query_period.return_value = []

    app.dependency_overrides[TransactionRepository.get_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get(ENDPOINT)

        assert response.status_code == 200
        assert response.json()["totalMinor"] == 0
        assert response.json()["categories"] == []

        repository.query_period.assert_called_once()
    finally:
        app.dependency_overrides.pop(
            TransactionRepository.get_repository,
            None,
        )
