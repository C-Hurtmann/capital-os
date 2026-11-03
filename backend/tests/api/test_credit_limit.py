from datetime import UTC, datetime
from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.api.credit_limit import get_credit_limit_repository
from app.main import app
from app.models.credit_limit import CreditLimit
from app.repositories.credit_limit import CreditLimitRepository


class FakeCreditLimitRepository:
    @staticmethod
    def get_current(account_id: str) -> None:
        return None


def test_get_credit_limit_when_not_set() -> None:
    app.dependency_overrides[get_credit_limit_repository] = FakeCreditLimitRepository

    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/credit-limit")

        assert response.status_code == 200
        assert response.json() == {
            "amountMinor": None,
            "effectiveFrom": None,
        }
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_get_credit_limit_when_set() -> None:
    repository = Mock(spec=CreditLimitRepository)
    repository.get_current.return_value = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=1_500_000,
        effective_from=datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
    )

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/credit-limit")

        assert response.status_code == 200
        assert response.json() == {
            "amountMinor": 1_500_000,
            "effectiveFrom": "2026-11-03T09:00:00Z",
        }

        repository.get_current.assert_called_once_with("monobank-main")
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_get_credit_limit_when_zero() -> None:
    repository = Mock(spec=CreditLimitRepository)
    repository.get_current.return_value = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=0,
        effective_from=datetime(2026, 11, 3, 9, 0, tzinfo=UTC),
    )

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/credit-limit")

        assert response.status_code == 200
        assert response.json() == {
            "amountMinor": 0,
            "effectiveFrom": "2026-11-03T09:00:00Z",
        }
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)
