from pydantic import AwareDatetime, BaseModel, Field, model_validator


class BalanceResponse(BaseModel):
    bank_balance_minor: int = Field(serialization_alias="bankBalanceMinor")
    own_funds_minor: int | None = Field(ge=0, serialization_alias="ownFundsMinor")
    credit_used_minor: int | None = Field(ge=0, serialization_alias="creditUsedMinor")
    fetched_at: AwareDatetime = Field(serialization_alias="fetchedAt")

    @model_validator(mode="after")
    def validate_breakdown(self) -> BalanceResponse:
        if (self.own_funds_minor is None) != (self.credit_used_minor is None):
            raise ValueError("Balance breakdown must be both null or non-null")
        return self
