from datetime import date
from typing import Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from app.constants import KYIV_TZ, MAX_SAFE_INTEGER


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


class MonthlyCashflowMonthResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        from_attributes=True,
    )

    month: str

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


class MonthlyCashflowResponse(BaseModel):
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

    computed_at: AwareDatetime = Field(
        serialization_alias="computedAt",
    )

    months: tuple[MonthlyCashflowMonthResponse, ...] = Field(
        min_length=12,
        max_length=12,
    )

    @model_validator(mode="after")
    def validate_period(self) -> Self:
        local_date = self.computed_at.astimezone(KYIV_TZ).date()

        current_month = local_date.year * 12 + local_date.month - 1
        first_month = current_month - 11

        year, month = divmod(first_month, 12)
        expected_start = date(year, month + 1, 1)

        if self.from_date != expected_start or self.to_date != local_date:
            raise ValueError("Cashflow period does not match computedAt")

        for index, item in enumerate(self.months):
            year, month = divmod(first_month + index, 12)
            expected_month = f"{year:04d}-{month + 1:02d}"

            if item.month != expected_month:
                raise ValueError("Cashflow months must be consecutive and ordered")

        return self
