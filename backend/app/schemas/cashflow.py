from datetime import date
from typing import Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from app.constants import MAX_SAFE_INTEGER


class CashflowResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        from_attributes=True,
    )

    from_date: date = Field(serialization_alias="from")
    to_date: date = Field(serialization_alias="to")

    time_zone: Literal["Europe/Kyiv"] = Field(
        default="Europe/Kyiv",
        serialization_alias="timeZone",
    )
    currency: Literal["UAH"] = "UAH"

    income_minor: int = Field(
        ge=0,
        le=MAX_SAFE_INTEGER,
        serialization_alias="incomeMinor",
    )
    expense_minor: int = Field(
        ge=0,
        le=MAX_SAFE_INTEGER,
        serialization_alias="expenseMinor",
    )
    net_minor: int = Field(
        ge=-MAX_SAFE_INTEGER,
        le=MAX_SAFE_INTEGER,
        serialization_alias="netMinor",
    )

    computed_at: AwareDatetime = Field(
        serialization_alias="computedAt",
    )

    @model_validator(mode="after")
    def validate_totals(self) -> Self:
        if self.net_minor != self.income_minor - self.expense_minor:
            raise ValueError("netMinor must equal incomeMinor minus expenseMinor")

        if self.from_date > self.to_date:
            raise ValueError("from must not be later than to")

        return self
