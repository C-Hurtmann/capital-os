from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.integrations.monobank.models import MonobankClientInfoResponse


@pytest.fixture
def valid_payload() -> dict:
    return {
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


@pytest.mark.parametrize(
    "field",
    ["clientId", "name", "accounts"],
)
def test_missing_required_client_field(
    valid_payload: dict,
    field: str,
) -> None:
    payload = deepcopy(valid_payload)
    del payload[field]

    with pytest.raises(ValidationError):
        MonobankClientInfoResponse.model_validate(payload)


@pytest.mark.parametrize(
    "field,value",
    [
        ("id", ""),
        ("balance", "7000000"),
        ("balance", None),
        ("creditLimit", "5000000"),
        ("currencyCode", "980"),
        ("currencyCode", True),
    ],
)
def test_invalid_account_data(
    valid_payload: dict,
    field: str,
    value: object,
) -> None:
    payload = deepcopy(valid_payload)
    payload["accounts"][0][field] = value

    with pytest.raises(ValidationError):
        MonobankClientInfoResponse.model_validate(payload)


def test_empty_accounts_is_valid(valid_payload: dict) -> None:
    valid_payload["accounts"] = []

    result = MonobankClientInfoResponse.model_validate(valid_payload)

    assert result.accounts == []


def test_unknown_fields_are_ignored(valid_payload: dict) -> None:
    valid_payload["newBankField"] = "some-value"
    valid_payload["accounts"][0]["newAccountField"] = 123

    result = MonobankClientInfoResponse.model_validate(valid_payload)

    assert result.accounts[0].balance == 7_000_000
    assert not hasattr(result, "new_bank_field")


def test_negative_balance_is_valid(valid_payload: dict) -> None:
    valid_payload["accounts"][0]["balance"] = -100_000

    result = MonobankClientInfoResponse.model_validate(valid_payload)

    assert result.accounts[0].balance == -100_000
