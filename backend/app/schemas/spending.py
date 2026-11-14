from datetime import date, timedelta
from typing import Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from app.categories import CATEGORY_IDS
from app.constants import KYIV_TZ, MAX_SAFE_INTEGER


class SpendingCategoryResponse(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, from_attributes=True)

    id: str
    amount_minor: int = Field(
        ge=1, le=MAX_SAFE_INTEGER, serialization_alias="amountMinor"
    )


class SpendingResponse(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, from_attributes=True)

    from_date: date = Field(serialization_alias="from")
    to_date: date = Field(serialization_alias="to")
    computed_at: AwareDatetime = Field(serialization_alias="computedAt")

    time_zone: Literal["Europe/Kyiv"] = Field(
        default="Europe/Kyiv", serialization_alias="timeZone"
    )
    currency: Literal["UAH"] = "UAH"

    total_minor: int = Field(
        ge=0,
        le=MAX_SAFE_INTEGER,
        serialization_alias="totalMinor",
    )
    categories: tuple[SpendingCategoryResponse, ...]

    @model_validator(mode="after")
    def validate_result(self) -> Self:
        if self.computed_at.utcoffset() != timedelta(0):
            raise ValueError("computedAt must be UTC")

        local_date = self.computed_at.astimezone(KYIV_TZ).date()

        if self.from_date != local_date.replace(day=1) or self.to_date != local_date:
            raise ValueError("Spending period does not match computedAt")

        ids = [category.id for category in self.categories]

        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate spending category IDs")

        if any(category_id not in CATEGORY_IDS for category_id in ids):
            raise ValueError("Unknown spending category ID")

        if self.total_minor != sum(
            category.amount_minor for category in self.categories
        ):
            raise ValueError("Spending total does not match categories")

        expected_order = tuple(
            sorted(
                self.categories,
                key=lambda category: (-category.amount_minor, category.id),
            )
        )

        if self.categories != expected_order:
            raise ValueError("Spending categories are not correctly sorted")

        return self
