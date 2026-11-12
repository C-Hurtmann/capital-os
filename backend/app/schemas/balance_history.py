from datetime import date, timedelta
from typing import Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from app.constants import KYIV_TZ, MAX_SAFE_INTEGER


class BalanceHistoryPointResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        from_attributes=True,
    )

    date: date
    balance_minor: int | None = Field(
        ge=-MAX_SAFE_INTEGER,
        le=MAX_SAFE_INTEGER,
        serialization_alias="balanceMinor",
    )


class BalanceHistoryResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        from_attributes=True,
    )

    from_date: date | None = Field(serialization_alias="from")
    to_date: date = Field(serialization_alias="to")
    computed_at: AwareDatetime = Field(
        serialization_alias="computedAt",
    )

    time_zone: Literal["Europe/Kyiv"] = Field(
        default="Europe/Kyiv",
        serialization_alias="timeZone",
    )
    currency: Literal["UAH"] = "UAH"

    points: tuple[BalanceHistoryPointResponse, ...]

    @model_validator(mode="after")
    def validate_series(self) -> Self:
        local_date = self.computed_at.astimezone(KYIV_TZ).date()

        if self.to_date != local_date:
            raise ValueError("to must match computedAt local date")

        if self.from_date is None:
            if self.points:
                raise ValueError("points must be empty when from is null")
            return self

        if self.from_date > self.to_date:
            raise ValueError("from must not be later than to")

        if not self.points:
            return self

        if self.points[0].date != self.from_date:
            raise ValueError("First point must match from")

        has_leading_null = self.points[0].balance_minor is None
        known_points = self.points[1:] if has_leading_null else self.points

        if not known_points:
            raise ValueError("Leading null requires known points")

        if has_leading_null and known_points[0].date <= self.from_date:
            raise ValueError("Known points must follow leading null")

        previous_date = None

        for point in known_points:
            if point.balance_minor is None:
                raise ValueError("Null is only allowed at the beginning")

            if previous_date is not None and point.date != previous_date + timedelta(
                days=1
            ):
                raise ValueError("Known dates must be consecutive")

            previous_date = point.date

        if previous_date != self.to_date:
            raise ValueError("Last point must match to")

        return self
