from unittest.mock import Mock

from app.core.dynamodb import _create_dynamodb_client


def test_dynamodb_client_is_cached(monkeypatch):
    client = Mock()
    boto3_client = Mock(return_value=client)

    monkeypatch.setattr(
        "app.core.dynamodb.boto3.client",
        boto3_client,
    )

    _create_dynamodb_client.cache_clear()

    try:
        first = _create_dynamodb_client(
            "eu-central-1",
            "http://localhost:8000",
        )
        second = _create_dynamodb_client(
            "eu-central-1",
            "http://localhost:8000",
        )

        assert first is second
        boto3_client.assert_called_once()
    finally:
        _create_dynamodb_client.cache_clear()
