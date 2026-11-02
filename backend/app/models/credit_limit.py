from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class CreditLimit(BaseModel):
    model_config = ConfigDict(frozen=True)

    account_id: str = Field(min_length=1)
    credit_limit_minor: int = Field(ge=0)
    effective_from: AwareDatetime
