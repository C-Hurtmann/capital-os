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
from app.services.cashflow import (
    CashflowResult,
    CashflowService,
    MonthlyCashflowMonth,
    MonthlyCashflowResult,
)

CURRENT_ENDPOINT = "/api/v1/cashflow/current"
MONTHLY_ENDPOINT = "/api/v1/cashflow/monthly"

MONTH_LABELS = (
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
)


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


def make_monthly_result(
    months: tuple[MonthlyCashflowMonth, ...] | None = None,
) -> MonthlyCashflowResult:
    if months is None:
        months = tuple(
            MonthlyCashflowMonth(
                month=label,
                income_minor=0,
                expense_minor=0,
            )
            for label in MONTH_LABELS
        )

    return MonthlyCashflowResult(
        from_date=date(2025, 12, 1),
        to_date=date(2026, 11, 10),
        months=months,
        computed_at=datetime(2026, 11, 10, 12, 30, tzinfo=UTC),
    )


def request_with_service(
    service: Mock,
    endpoint: str = CURRENT_ENDPOINT,
) -> Response:
    app.dependency_overrides[CashflowService] = lambda: service

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            return client.get(endpoint)
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
    service = Mock(spec=CashflowService)
    service.get_current.side_effect = error

    response = request_with_service(service)

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"

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
    repository.query_period.return_value = []

    app.dependency_overrides[TransactionRepository.get_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get(CURRENT_ENDPOINT)

        assert response.status_code == 200
        assert response.json()["netMinor"] == 0
        repository.query_period.assert_called_once()

    finally:
        app.dependency_overrides.pop(
            TransactionRepository.get_repository,
            None,
        )


def test_get_monthly_cashflow() -> None:
    service = Mock(spec=CashflowService)

    result = make_monthly_result()
    months = list(result.months)

    months[0] = replace(
        months[0],
        income_minor=5_000_000,
        expense_minor=4_000_000,
    )
    months[-1] = replace(
        months[-1],
        income_minor=1_147_253,
        expense_minor=3_873_988,
    )

    service.get_monthly_trend.return_value = replace(
        result,
        months=tuple(months),
    )

    response = request_with_service(service, MONTHLY_ENDPOINT)

    assert response.status_code == 200

    body = response.json()

    assert set(body) == {
        "from",
        "to",
        "timeZone",
        "currency",
        "computedAt",
        "months",
    }

    assert body["from"] == "2025-12-01"
    assert body["to"] == "2026-11-10"
    assert body["timeZone"] == "Europe/Kyiv"
    assert body["currency"] == "UAH"
    assert body["computedAt"] == "2026-11-10T12:30:00Z"

    assert len(body["months"]) == 12
    assert [month["month"] for month in body["months"]] == list(MONTH_LABELS)

    assert body["months"][0] == {
        "month": "2025-12",
        "incomeMinor": 5_000_000,
        "expenseMinor": 4_000_000,
    }

    assert body["months"][-1] == {
        "month": "2026-11",
        "incomeMinor": 1_147_253,
        "expenseMinor": 3_873_988,
    }

    service.get_monthly_trend.assert_called_once_with()


def test_monthly_all_zero_months() -> None:
    service = Mock(spec=CashflowService)
    service.get_monthly_trend.return_value = make_monthly_result()

    response = request_with_service(service, MONTHLY_ENDPOINT)

    assert response.status_code == 200

    months = response.json()["months"]

    assert len(months) == 12
    assert [month["month"] for month in months] == list(MONTH_LABELS)

    assert all(
        month["incomeMinor"] == 0 and month["expenseMinor"] == 0 for month in months
    )


@pytest.mark.parametrize(
    "labels",
    [
        MONTH_LABELS[:-1],
        MONTH_LABELS + ("2026-12",),
        MONTH_LABELS[:-1] + (MONTH_LABELS[-2],),
        tuple(reversed(MONTH_LABELS)),
    ],
)
def test_monthly_invalid_months_return_500(
    labels: tuple[str, ...],
) -> None:
    service = Mock(spec=CashflowService)

    months = tuple(
        MonthlyCashflowMonth(
            month=label,
            income_minor=0,
            expense_minor=0,
        )
        for label in labels
    )

    service.get_monthly_trend.return_value = make_monthly_result(
        months=months,
    )

    response = request_with_service(service, MONTHLY_ENDPOINT)

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["title"] == "Internal Server Error"


@pytest.mark.parametrize(
    ("income", "expenses", "expected_status"),
    [
        (MAX_SAFE_INTEGER, 0, 200),
        (0, MAX_SAFE_INTEGER, 200),
        (MAX_SAFE_INTEGER + 1, 0, 500),
        (0, MAX_SAFE_INTEGER + 1, 500),
    ],
)
def test_monthly_safe_integer_validation(
    income: int,
    expenses: int,
    expected_status: int,
) -> None:
    service = Mock(spec=CashflowService)

    result = make_monthly_result()
    months = list(result.months)
    months[0] = replace(
        months[0],
        income_minor=income,
        expense_minor=expenses,
    )

    service.get_monthly_trend.return_value = replace(
        result,
        months=tuple(months),
    )

    response = request_with_service(service, MONTHLY_ENDPOINT)

    assert response.status_code == expected_status


def test_monthly_invalid_period_returns_500() -> None:
    service = Mock(spec=CashflowService)
    service.get_monthly_trend.return_value = replace(
        make_monthly_result(),
        from_date=date(2025, 11, 1),
    )

    response = request_with_service(service, MONTHLY_ENDPOINT)

    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"


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
def test_monthly_storage_failure_returns_503(
    error: Exception,
) -> None:
    service = Mock(spec=CashflowService)
    service.get_monthly_trend.side_effect = error

    response = request_with_service(service, MONTHLY_ENDPOINT)

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"

    body = response.json()

    assert body["status"] == 503
    assert body["title"] == "Service Unavailable"
    assert body["detail"] == ("Cashflow storage is temporarily unavailable")

    UUID(body["requestId"])


def test_monthly_fastapi_dependency_injection() -> None:
    repository = Mock(spec=TransactionRepository)
    repository.query_period.return_value = []

    app.dependency_overrides[TransactionRepository.get_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get(MONTHLY_ENDPOINT)

        assert response.status_code == 200
        assert len(response.json()["months"]) == 12
        repository.query_period.assert_called_once()

    finally:
        app.dependency_overrides.pop(
            TransactionRepository.get_repository,
            None,
        )
