import httpx
import pytest

from app.integrations.monobank import MonobankClient
from app.integrations.monobank.models import MonobankClientInfoResponse


def test_get_client_info_success() -> None:
    payload = {
        "clientId": "client-123",
        "name": "Test User",
        "accounts": [
            {
                "id": "account-123",
                "balance": 7_000_000,
                "creditLimit": 5_000_000,
                "currencyCode": 980,
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == ("https://api.monobank.ua/personal/client-info")
        assert request.headers["X-Token"] == "test-token"
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)
        result = client.get_client_info()

    assert isinstance(result, MonobankClientInfoResponse)
    assert result.client_id == "client-123"
    assert result.accounts[0].id == "account-123"
    assert result.accounts[0].balance == 7_000_000
    assert result.accounts[0].credit_limit == 5_000_000
    assert result.accounts[0].currency_code == 980


@pytest.mark.parametrize("status_code", [401, 429, 500])
def test_get_client_info_http_error(status_code: int) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(status_code))

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            client.get_client_info()

    assert exc_info.value.response.status_code == status_code


def test_get_client_info_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Request timed out", request=request)

    transport = httpx.MockTransport(handler)

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(httpx.ReadTimeout):
            client.get_client_info()


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json=[]),
        httpx.Response(200, json=None),
        httpx.Response(200, text="invalid-json"),
    ],
)
def test_get_client_info_invalid_response(
    response: httpx.Response,
) -> None:
    transport = httpx.MockTransport(lambda request: response)

    with httpx.Client(transport=transport) as http_client:
        client = MonobankClient("test-token", http_client)

        with pytest.raises(ValueError):
            client.get_client_info()


@pytest.mark.parametrize("token", ["", " ", "\t"])
def test_monobank_client_rejects_empty_token(token: str) -> None:
    with (
        httpx.Client() as http_client,
        pytest.raises(
            ValueError,
            match="token is required",
        ),
    ):
        MonobankClient(token, http_client)
