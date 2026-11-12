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
from app.services.balance_history import (
    BalanceHistoryPoint,
    BalanceHistoryPreset,
    BalanceHistoryResult,
    BalanceHistoryService,
)

ENDPOINT = "/api/v1/balance-history"
COMPUTED_AT = datetime(2026, 11, 10, 12, 30, tzinfo=UTC)


def make_result() -> BalanceHistoryResult:
    return BalanceHistoryResult(
        from_date=date(2026, 11, 8),
        to_date=date(2026, 11, 10),
        computed_at=COMPUTED_AT,
        points=(
            BalanceHistoryPoint(date(2026, 11, 8), 10000),
            BalanceHistoryPoint(date(2026, 11, 9), 10000),
            BalanceHistoryPoint(date(2026, 11, 10), 8000),
        ),
    )


def request_with_service(
    service: Mock,
    endpoint: str = ENDPOINT,
) -> Response:
    app.dependency_overrides[BalanceHistoryService] = lambda: service

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            return client.get(endpoint)
    finally:
        app.dependency_overrides.pop(BalanceHistoryService, None)


def assert_problem_response(
    response: Response,
    status: int,
    title: str,
) -> None:
    assert response.status_code == status
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert set(body) == {
        "type",
        "title",
        "status",
        "detail",
        "requestId",
    }
    assert body["type"] == "about:blank"
    assert body["title"] == title
    assert body["status"] == status

    UUID(body["requestId"])


def test_get_balance_history() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = make_result()

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json() == {
        "from": "2026-11-08",
        "to": "2026-11-10",
        "computedAt": "2026-11-10T12:30:00Z",
        "timeZone": "Europe/Kyiv",
        "currency": "UAH",
        "points": [
            {"date": "2026-11-08", "balanceMinor": 10000},
            {"date": "2026-11-09", "balanceMinor": 10000},
            {"date": "2026-11-10", "balanceMinor": 8000},
        ],
    }

    service.get_history.assert_called_once_with(BalanceHistoryPreset.THREE_MONTHS)


@pytest.mark.parametrize(
    ("preset", "expected"),
    [
        ("1M", BalanceHistoryPreset.ONE_MONTH),
        ("3M", BalanceHistoryPreset.THREE_MONTHS),
        ("6M", BalanceHistoryPreset.SIX_MONTHS),
        ("12M", BalanceHistoryPreset.TWELVE_MONTHS),
        ("All", BalanceHistoryPreset.ALL),
    ],
)
def test_valid_presets(
    preset: str,
    expected: BalanceHistoryPreset,
) -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = make_result()

    response = request_with_service(
        service,
        f"{ENDPOINT}?preset={preset}",
    )

    assert response.status_code == 200
    service.get_history.assert_called_once_with(expected)


@pytest.mark.parametrize(
    "preset",
    ["invalid", "all", "ALL", "1m", "2M", ""],
)
def test_invalid_preset_returns_422(preset: str) -> None:
    service = Mock(spec=BalanceHistoryService)

    response = request_with_service(
        service,
        f"{ENDPOINT}?preset={preset}",
    )

    assert_problem_response(
        response,
        422,
        "Unprocessable Content",
    )
    assert response.json()["detail"] == "Request validation failed"

    service.get_history.assert_not_called()


def test_empty_all() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = replace(
        make_result(),
        from_date=None,
        points=(),
    )

    response = request_with_service(
        service,
        f"{ENDPOINT}?preset=All",
    )

    assert response.status_code == 200

    body = response.json()
    assert body["from"] is None
    assert body["to"] == "2026-11-10"
    assert body["points"] == []

    service.get_history.assert_called_once_with(BalanceHistoryPreset.ALL)


def test_empty_fixed_period() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = replace(
        make_result(),
        from_date=date(2026, 11, 1),
        points=(),
    )

    response = request_with_service(
        service,
        f"{ENDPOINT}?preset=1M",
    )

    assert response.status_code == 200
    assert response.json()["from"] == "2026-11-01"
    assert response.json()["points"] == []


def test_leading_null_is_preserved() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = replace(
        make_result(),
        from_date=date(2026, 11, 1),
        points=(
            BalanceHistoryPoint(date(2026, 11, 1), None),
            *make_result().points,
        ),
    )

    response = request_with_service(service)

    assert response.status_code == 200
    assert response.json()["points"][0] == {
        "date": "2026-11-01",
        "balanceMinor": None,
    }


@pytest.mark.parametrize("balance", [0, -100, MAX_SAFE_INTEGER])
def test_signed_balances(balance: int) -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = replace(
        make_result(),
        points=(
            BalanceHistoryPoint(date(2026, 11, 8), balance),
            BalanceHistoryPoint(date(2026, 11, 9), balance),
            BalanceHistoryPoint(date(2026, 11, 10), balance),
        ),
    )

    response = request_with_service(service)

    assert response.status_code == 200
    assert all(point["balanceMinor"] == balance for point in response.json()["points"])


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
    service = Mock(spec=BalanceHistoryService)
    service.get_history.side_effect = error

    response = request_with_service(service)

    assert_problem_response(response, 503, "Service Unavailable")

    assert response.json()["detail"] == (
        "Balance history storage is temporarily unavailable"
    )
    assert "Throughput exceeded" not in response.text


def test_unsafe_balance_returns_500() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = replace(
        make_result(),
        points=(
            BalanceHistoryPoint(
                date(2026, 11, 8),
                MAX_SAFE_INTEGER + 1,
            ),
            *make_result().points[1:],
        ),
    )

    response = request_with_service(service)

    assert_problem_response(response, 500, "Internal Server Error")
    assert response.json()["detail"] == "An unexpected error occurred"


def test_invalid_series_returns_500() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.return_value = replace(
        make_result(),
        points=(
            BalanceHistoryPoint(date(2026, 11, 8), 10000),
            BalanceHistoryPoint(date(2026, 11, 10), 8000),
        ),
    )

    response = request_with_service(service)

    assert_problem_response(response, 500, "Internal Server Error")


def test_unexpected_error_returns_500() -> None:
    service = Mock(spec=BalanceHistoryService)
    service.get_history.side_effect = RuntimeError(
        "Internal database connection details"
    )

    response = request_with_service(service)

    assert_problem_response(response, 500, "Internal Server Error")
    assert "Internal database connection details" not in response.text


def test_fastapi_dependency_injection() -> None:
    repository = Mock(spec=TransactionRepository)
    repository.query_period.return_value = []
    repository.get_latest_before.return_value = None

    app.dependency_overrides[TransactionRepository.get_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get(ENDPOINT)

        assert response.status_code == 200

        body = response.json()
        assert body["points"] == []
        assert body["from"] is not None
        assert body["timeZone"] == "Europe/Kyiv"

        repository.get_latest_before.assert_called_once()
        repository.query_period.assert_called_once()

    finally:
        app.dependency_overrides.pop(
            TransactionRepository.get_repository,
            None,
        )
