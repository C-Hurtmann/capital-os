from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class BalanceSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True)

    account_id: str = Field(min_length=1)
    bank_balance_minor: int
    fetched_at: AwareDatetime
