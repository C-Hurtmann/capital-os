from datetime import UTC, datetime

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.constants import MAX_SAFE_INTEGER


class CreditLimitResponse(BaseModel):
    amount_minor: int | None = Field(
        ge=0,
        le=MAX_SAFE_INTEGER,
        serialization_alias="amountMinor",
    )
    effective_from: AwareDatetime | None = Field(serialization_alias="effectiveFrom")

    @model_validator(mode="after")
    def validate_fields(self) -> CreditLimitResponse:
        if (self.amount_minor is None) != (self.effective_from is None):
            raise ValueError("Both fields must be null or non-null")
        return self


class PostCreditLimitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_minor: int = Field(
        alias="amountMinor",
        strict=True,
        ge=0,
        le=MAX_SAFE_INTEGER,
    )
    effective_from: AwareDatetime | None = Field(
        default=None,
        alias="effectiveFrom",
    )

    @field_validator("effective_from", mode="before")
    @classmethod
    def validate_effective_from_format(cls, value: object) -> str:
        if not isinstance(value, str) or "T" not in value:
            raise ValueError("effectiveFrom must be an RFC 3339 timestamp string")
        return value

    @field_validator("effective_from")
    @classmethod
    def validate_effective_from(cls, value: datetime | None) -> datetime | None:
        if value is not None and value > datetime.now(UTC):
            raise ValueError("effectiveFrom cannot be in the future")
        return value
