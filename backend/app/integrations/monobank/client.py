import httpx

from app.integrations.monobank.models import MonobankClientInfoResponse


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
