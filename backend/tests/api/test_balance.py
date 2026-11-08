from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.balance import BalanceRepository
from app.repositories.credit_limit import CreditLimitRepository


def test_get_balance_returns_own_and_credit_funds() -> None:
    fetched_at = datetime(2026, 11, 4, 6, tzinfo=UTC)

    balance_repository = Mock()
    balance_repository.get_latest.return_value = SimpleNamespace(
        bank_balance_minor=7_000_000,
        fetched_at=fetched_at,
    )

    credit_repository = Mock()
    credit_repository.get_current.return_value = SimpleNamespace(
        credit_limit_minor=5_000_000,
    )

    app.dependency_overrides[BalanceRepository.get_repository] = lambda: (
        balance_repository
    )
    app.dependency_overrides[CreditLimitRepository.get_repository] = lambda: (
        credit_repository
    )

    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/balance")

        assert response.status_code == 200
        assert response.json() == {
            "bankBalanceMinor": 7_000_000,
            "ownFundsMinor": 2_000_000,
            "creditUsedMinor": 0,
            "fetchedAt": "2026-11-04T06:00:00Z",
        }

        balance_repository.get_latest.assert_called_once_with("monobank-main")
        credit_repository.get_current.assert_called_once_with("monobank-main")
    finally:
        app.dependency_overrides.pop(BalanceRepository.get_repository, None)
        app.dependency_overrides.pop(CreditLimitRepository.get_repository, None)


@pytest.mark.parametrize(
    (
        "bank_balance",
        "credit_limit",
        "expected_own",
        "expected_credit",
    ),
    [
        pytest.param(
            3_000_000,
            5_000_000,
            0,
            2_000_000,
            id="credit-used",
        ),
        pytest.param(
            1_000_000,
            None,
            None,
            None,
            id="credit-limit-not-set",
        ),
        pytest.param(
            1_000_000,
            0,
            1_000_000,
            0,
            id="credit-limit-zero",
        ),
        pytest.param(
            -100_000,
            5_000_000,
            None,
            None,
            id="negative-bank-balance",
        ),
    ],
)
def test_get_balance_breakdown(
    bank_balance: int,
    credit_limit: int | None,
    expected_own: int | None,
    expected_credit: int | None,
) -> None:
    balance_repository = Mock()
    balance_repository.get_latest.return_value = SimpleNamespace(
        bank_balance_minor=bank_balance,
        fetched_at=datetime(2026, 11, 4, 6, tzinfo=UTC),
    )

    credit_repository = Mock()
    credit_repository.get_current.return_value = (
        SimpleNamespace(credit_limit_minor=credit_limit)
        if credit_limit is not None
        else None
    )

    app.dependency_overrides[BalanceRepository.get_repository] = lambda: (
        balance_repository
    )
    app.dependency_overrides[CreditLimitRepository.get_repository] = lambda: (
        credit_repository
    )

    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/balance")

        assert response.status_code == 200
        assert response.json() == {
            "bankBalanceMinor": bank_balance,
            "ownFundsMinor": expected_own,
            "creditUsedMinor": expected_credit,
            "fetchedAt": "2026-11-04T06:00:00Z",
        }
    finally:
        app.dependency_overrides.pop(BalanceRepository.get_repository, None)
        app.dependency_overrides.pop(CreditLimitRepository.get_repository, None)


def test_get_balance_without_snapshot_returns_503() -> None:
    balance_repository = Mock(spec=BalanceRepository)
    balance_repository.get_latest.return_value = None

    credit_repository = Mock(spec=CreditLimitRepository)

    app.dependency_overrides[BalanceRepository.get_repository] = lambda: (
        balance_repository
    )
    app.dependency_overrides[CreditLimitRepository.get_repository] = lambda: (
        credit_repository
    )

    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/balance")

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
        assert body["type"] == "about:blank"
        assert body["title"] == "Service Unavailable"
        assert body["status"] == 503
        assert body["detail"] == ("Bank balance snapshot is unavailable")
        UUID(body["requestId"])

        balance_repository.get_latest.assert_called_once_with("monobank-main")
        credit_repository.get_current.assert_not_called()
    finally:
        app.dependency_overrides.pop(BalanceRepository.get_repository, None)
        app.dependency_overrides.pop(CreditLimitRepository.get_repository, None)


@pytest.mark.parametrize(
    "failed_repository",
    ["balance", "credit"],
)
def test_get_balance_dynamodb_unavailable_returns_503(
    failed_repository: str,
) -> None:
    balance_repository = Mock(spec=BalanceRepository)
    balance_repository.get_latest.return_value = SimpleNamespace(
        bank_balance_minor=7_000_000,
        fetched_at=datetime(2026, 11, 4, 6, tzinfo=UTC),
    )

    credit_repository = Mock(spec=CreditLimitRepository)
    credit_repository.get_current.return_value = SimpleNamespace(
        credit_limit_minor=5_000_000,
    )

    error = ClientError(
        {
            "Error": {
                "Code": "ProvisionedThroughputExceededException",
                "Message": "Throughput exceeded",
            }
        },
        "GetItem",
    )

    if failed_repository == "balance":
        balance_repository.get_latest.side_effect = error
    else:
        credit_repository.get_current.side_effect = error

    app.dependency_overrides[BalanceRepository.get_repository] = lambda: (
        balance_repository
    )
    app.dependency_overrides[CreditLimitRepository.get_repository] = lambda: (
        credit_repository
    )

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/v1/balance")

        assert response.status_code == 503
        assert response.headers["content-type"] == ("application/problem+json")

        body = response.json()
        assert body["title"] == "Service Unavailable"
        assert body["status"] == 503
        assert body["detail"] == ("Balance storage is temporarily unavailable")
        assert "Throughput exceeded" not in response.text
    finally:
        app.dependency_overrides.pop(BalanceRepository.get_repository, None)
        app.dependency_overrides.pop(CreditLimitRepository.get_repository, None)


@pytest.mark.parametrize(
    "failed_repository",
    ["balance", "credit"],
)
def test_get_balance_unexpected_error_returns_500(
    failed_repository: str,
) -> None:
    balance_repository = Mock(spec=BalanceRepository)
    balance_repository.get_latest.return_value = SimpleNamespace(
        bank_balance_minor=7_000_000,
        fetched_at=datetime(2026, 11, 4, 6, tzinfo=UTC),
    )

    credit_repository = Mock(spec=CreditLimitRepository)
    credit_repository.get_current.return_value = SimpleNamespace(
        credit_limit_minor=5_000_000,
    )

    error_message = "Internal database connection details"

    if failed_repository == "balance":
        balance_repository.get_latest.side_effect = RuntimeError(error_message)
    else:
        credit_repository.get_current.side_effect = RuntimeError(error_message)

    app.dependency_overrides[BalanceRepository.get_repository] = lambda: (
        balance_repository
    )
    app.dependency_overrides[CreditLimitRepository.get_repository] = lambda: (
        credit_repository
    )

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/v1/balance")

        assert response.status_code == 500
        assert response.headers["content-type"] == ("application/problem+json")

        body = response.json()

        assert body["type"] == "about:blank"
        assert body["title"] == "Internal Server Error"
        assert body["status"] == 500
        assert body["detail"] == "An unexpected error occurred"
        UUID(body["requestId"])

        assert error_message not in response.text
    finally:
        app.dependency_overrides.pop(BalanceRepository.get_repository, None)
        app.dependency_overrides.pop(CreditLimitRepository.get_repository, None)
