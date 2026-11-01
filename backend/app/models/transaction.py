from pydantic import AwareDatetime, BaseModel, ConfigDict


class Transaction(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True)

    bank_id: str
    occurred_at: AwareDatetime
    amount_minor: int
    operation_amount_minor: int
    operation_currency_code: int
    balance_minor: int
    mcc: int
    commission_minor: int
