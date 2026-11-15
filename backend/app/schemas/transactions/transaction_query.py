import re
from datetime import date
from typing import Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class TransactionsQuery(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, extra="forbid")

    from_date: date | None = Field(default=None, alias="from")
    to_date: date | None = Field(default=None, alias="to")
    direction: Literal["income", "expense"] | None = None

    limit: int = Field(default=20, ge=1, le=50)
    cursor: str | None = Field(default=None, min_length=1, max_length=4096)

    @field_validator("from_date", "to_date", mode="before")
    @classmethod
    def parse_date(cls, value: object) -> date | None:
        if value is None:
            return None

        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}",
            value,
        ):
            raise ValueError("Date must use YYYY-MM-DD format")

        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("Invalid calendar date") from exc

    @field_validator("limit", mode="before")
    @classmethod
    def parse_limit(cls, value: object) -> int:
        if type(value) is int:
            return value

        if not isinstance(value, str) or not re.fullmatch(
            r"[1-9][0-9]?",
            value,
        ):
            raise ValueError("Invalid page limit")

        return int(value)

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if (
            self.from_date is not None
            and self.to_date is not None
            and self.from_date > self.to_date
        ):
            raise ValueError("from must not be later than to")

        return self
