import httpx

from app.integrations.monobank.models import (
    MonobankClientInfoResponse,
    MonobankStatementItem,
)


class MonobankClient:
    BASE_URL = "https://api.monobank.ua"
    TIMEOUT = 10.0

    def __init__(
        self,
        token: str,
        http_client: httpx.Client,
    ) -> None:
        if not token.strip():
            raise ValueError("Monobank token is required")

        self._http_client = http_client
        self._headers = {"X-Token": token}

    def get_client_info(self) -> MonobankClientInfoResponse:
        response = self._http_client.get(
            f"{self.BASE_URL}/personal/client-info",
            headers=self._headers,
            timeout=self.TIMEOUT,
        )
        response.raise_for_status()

        return MonobankClientInfoResponse.model_validate(response.json())

    def get_statement(
        self, account_id: str, from_timestamp: int, to_timestamp: int
    ) -> list[MonobankStatementItem]:
        if from_timestamp < 0 or to_timestamp <= from_timestamp:
            raise ValueError("Invalid statement time range")

        if to_timestamp - from_timestamp > 2_682_000:
            raise ValueError("Statement range exceeds API limit")

        response = self._http_client.get(
            (
                f"{self.BASE_URL}/personal/statement/"
                f"{account_id}/{from_timestamp}/{to_timestamp}"
            ),
            headers=self._headers,
            timeout=self.TIMEOUT,
        )
        response.raise_for_status()

        data = response.json()

        if not isinstance(data, list):
            raise TypeError("Invalid Monobank statement response")

        return [MonobankStatementItem.model_validate(item) for item in data]
