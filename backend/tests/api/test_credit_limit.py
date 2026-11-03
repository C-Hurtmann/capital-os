from datetime import UTC, datetime
from unittest.mock import Mock, patch
from uuid import UUID

import pytest
from botocore.exceptions import ClientError
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


def test_post_credit_limit_with_explicit_date() -> None:
    credit_limit = CreditLimit(
        account_id="monobank-main",
        credit_limit_minor=5_000_000,
        effective_from=datetime(2026, 10, 15, 9, 0, tzinfo=UTC),
    )

    repository = Mock(spec=CreditLimitRepository)
    repository.set_current.return_value = credit_limit

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/credit-limit",
                json={
                    "amountMinor": 5_000_000,
                    "effectiveFrom": "2026-10-15T12:00:00+03:00",
                },
            )

        assert response.status_code == 200
        assert response.json() == {
            "amountMinor": 5_000_000,
            "effectiveFrom": "2026-10-15T09:00:00Z",
        }
        repository.set_current.assert_called_once_with(credit_limit)
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_post_credit_limit_uses_server_time_when_date_omitted() -> None:
    repository = Mock(spec=CreditLimitRepository)
    repository.set_current.side_effect = lambda credit_limit: credit_limit

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            before = datetime.now(UTC)

            response = client.post(
                "/api/v1/credit-limit",
                json={"amountMinor": 5_000_000},
            )

            after = datetime.now(UTC)

        assert response.status_code == 200

        repository.set_current.assert_called_once()
        saved = repository.set_current.call_args.args[0]

        assert isinstance(saved, CreditLimit)
        assert saved.credit_limit_minor == 5_000_000
        assert saved.account_id == "monobank-main"
        assert before <= saved.effective_from <= after

        body = response.json()
        assert body["amountMinor"] == 5_000_000
        assert datetime.fromisoformat(body["effectiveFrom"]) == saved.effective_from

    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_repeated_post_without_date_updates_effective_from() -> None:
    repository = Mock(spec=CreditLimitRepository)
    repository.set_current.side_effect = lambda credit_limit: credit_limit

    first_time = datetime(2026, 11, 3, 10, 0, tzinfo=UTC)
    second_time = datetime(2026, 11, 3, 10, 1, tzinfo=UTC)

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with patch("app.api.credit_limit.datetime") as mocked_datetime:
            mocked_datetime.now.side_effect = [first_time, second_time]

            with TestClient(app) as client:
                first_response = client.post(
                    "/api/v1/credit-limit",
                    json={"amountMinor": 5_000_000},
                )
                second_response = client.post(
                    "/api/v1/credit-limit",
                    json={"amountMinor": 5_000_000},
                )

        assert first_response.status_code == 200
        assert second_response.status_code == 200

        assert repository.set_current.call_count == 2

        first_saved = repository.set_current.call_args_list[0].args[0]
        second_saved = repository.set_current.call_args_list[1].args[0]

        assert first_saved.credit_limit_minor == second_saved.credit_limit_minor
        assert first_saved.effective_from == first_time
        assert second_saved.effective_from == second_time

        assert (
            datetime.fromisoformat(first_response.json()["effectiveFrom"]) == first_time
        )
        assert (
            datetime.fromisoformat(second_response.json()["effectiveFrom"])
            == second_time
        )

    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"amountMinor": -1},
        {"amountMinor": 2**53},
        {"amountMinor": "5000000"},
        {"amountMinor": 5.5},
        {"amountMinor": True},
        {"amountMinor": None},
        {"amountMinor": 5_000_000, "effectiveFrom": None},
        {"amountMinor": 5_000_000, "effectiveFrom": "invalid"},
        {"amountMinor": 5_000_000, "accountId": "monobank-main"},
    ],
)
def test_post_credit_limit_rejects_invalid_payload(
    payload: dict[str, object],
) -> None:
    repository = Mock(spec=CreditLimitRepository)
    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/credit-limit",
                json=payload,
            )

        assert response.status_code == 422
        repository.set_current.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_post_credit_limit_validation_error_returns_problem_details() -> None:
    repository = Mock(spec=CreditLimitRepository)
    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/credit-limit",
                json={"amountMinor": -1},
            )

        assert response.status_code == 422
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
        assert body["title"] == "Unprocessable Content"
        assert body["status"] == 422
        assert body["detail"] == "Request validation failed"

        UUID(body["requestId"])

        repository.set_current.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_post_credit_limit_malformed_json_returns_problem_details() -> None:
    repository = Mock(spec=CreditLimitRepository)
    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/credit-limit",
                content='{"amountMinor":',
                headers={"Content-Type": "application/json"},
            )

        assert response.status_code == 400
        assert response.headers["content-type"] == "application/problem+json"

        body = response.json()

        assert body["type"] == "about:blank"
        assert body["title"] == "Bad Request"
        assert body["status"] == 400
        assert body["detail"] == "Malformed JSON request body"
        UUID(body["requestId"])

        repository.set_current.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_post_credit_limit_rejects_unsupported_content_type() -> None:
    repository = Mock(spec=CreditLimitRepository)
    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/v1/credit-limit",
                content='{"amountMinor": 5000000}',
                headers={"Content-Type": "text/plain"},
            )

        assert response.status_code == 415
        assert response.headers["content-type"] == "application/problem+json"

        body = response.json()

        assert body["type"] == "about:blank"
        assert body["title"] == "Unsupported Media Type"
        assert body["status"] == 415
        assert body["detail"] == "Content-Type must be application/json"
        UUID(body["requestId"])

        repository.set_current.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_post_credit_limit_dynamodb_unavailable_returns_503() -> None:
    repository = Mock(spec=CreditLimitRepository)
    repository.set_current.side_effect = ClientError(
        {
            "Error": {
                "Code": "ProvisionedThroughputExceededException",
                "Message": "Throughput exceeded",
            }
        },
        "UpdateItem",
    )

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/api/v1/credit-limit",
                json={"amountMinor": 5_000_000},
            )

        assert response.status_code == 503
        assert response.headers["content-type"] == "application/problem+json"

        body = response.json()

        assert body["type"] == "about:blank"
        assert body["title"] == "Service Unavailable"
        assert body["status"] == 503
        assert body["detail"] == "Credit limit storage is temporarily unavailable"
        UUID(body["requestId"])

        repository.set_current.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)


def test_post_credit_limit_unexpected_error_returns_500() -> None:
    repository = Mock(spec=CreditLimitRepository)
    repository.set_current.side_effect = RuntimeError(
        "Internal database connection details"
    )

    app.dependency_overrides[get_credit_limit_repository] = lambda: repository

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/api/v1/credit-limit",
                json={"amountMinor": 5_000_000},
            )

        assert response.status_code == 500
        assert response.headers["content-type"] == "application/problem+json"

        body = response.json()

        assert body["type"] == "about:blank"
        assert body["title"] == "Internal Server Error"
        assert body["status"] == 500
        assert body["detail"] == "An unexpected error occurred"
        UUID(body["requestId"])

        assert "Internal database connection details" not in response.text
        repository.set_current.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_credit_limit_repository, None)
