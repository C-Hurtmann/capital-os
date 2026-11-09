import httpx
import pytest
from pydantic import ValidationError

from app.integrations.monobank.client import MonobankClient
from app.integrations.monobank.models import MonobankStatementItem

FROM = 1_762_000_000
TO = FROM + 3600


def test_get_statement_success() -> None:
    payload = [
        {
            "id": "transaction-123",
            "time": FROM + 100,
            "description": "Test purchase",
            "amount": -15_000,
            "operationAmount": -15_000,
            "currencyCode": 980,
            "mcc": 5411,
            "balance": 1_000_000,
            "commissionRate": 0,
        }
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == (f"/personal/statement/account-123/{FROM}/{TO}")
        assert request.headers["X-Token"] == "test-token"
        return httpx.Response(200, json=payload)

    with httpx.Client(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        client = MonobankClient("test-token", http_client)
        result = client.get_statement("account-123", FROM, TO)

    assert len(result) == 1
    assert isinstance(result[0], MonobankStatementItem)
    assert result[0].id == "transaction-123"
    assert result[0].amount == -15_000
    assert result[0].operation_amount == -15_000
    assert result[0].currency_code == 980


def test_get_statement_empty() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=[]))

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        assert client.get_statement("account-123", FROM, TO) == []


@pytest.mark.parametrize("status_code", [401, 429, 500])
def test_get_statement_http_error(status_code: int) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(status_code))

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            client.get_statement("account-123", FROM, TO)

    assert exc_info.value.response.status_code == status_code


@pytest.mark.parametrize(
    "account_id,start,end",
    [
        ("account-123", -1, TO),
        ("account-123", FROM, FROM),
        ("account-123", TO, FROM),
        ("account-123", FROM, FROM + 2_682_001),
    ],
)
def test_get_statement_invalid_parameters(
    account_id: str,
    start: int,
    end: int,
) -> None:
    transport = httpx.MockTransport(
        lambda request: pytest.fail("Unexpected HTTP request")
    )

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(ValueError):
            client.get_statement(account_id, start, end)


def test_get_statement_invalid_response_shape() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"items": []})
    )

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(TypeError):
            client.get_statement("account-123", FROM, TO)


def test_get_statement_invalid_transaction() -> None:
    payload = [
        {
            "id": "transaction-123",
            "time": FROM,
            "description": "Test purchase",
            "amount": "-15000",
            "operationAmount": -15_000,
            "currencyCode": 980,
        }
    ]

    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(ValidationError):
            client.get_statement("account-123", FROM, TO)
