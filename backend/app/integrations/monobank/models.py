from pydantic import BaseModel, ConfigDict, Field


class MonobankResponseModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")


class MonobankAccount(MonobankResponseModel):
    id: str = Field(min_length=1)
    balance: int
    credit_limit: int = Field(alias="creditLimit")
    currency_code: int = Field(alias="currencyCode")

    send_id: str | None = Field(default=None, alias="sendId")
    type: str | None = None
    cashback_type: str | None = Field(
        default=None,
        alias="cashbackType",
    )
    masked_pan: list[str] = Field(
        default_factory=list,
        alias="maskedPan",
    )
    iban: str | None = None


class MonobankClientInfoResponse(MonobankResponseModel):
    client_id: str = Field(alias="clientId")
    name: str
    accounts: list[MonobankAccount]

    web_hook_url: str | None = Field(
        default=None,
        alias="webHookUrl",
    )

    def get_account(self, account_id: str) -> MonobankAccount | None:
        for account in self.accounts:
            if account.id == account_id:
                return account
        return None
