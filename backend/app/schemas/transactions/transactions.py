from datetime import timedelta
from itertools import pairwise
from typing import Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from app.categories import mcc_to_category_id
from app.constants import MAX_SAFE_INTEGER


class TransactionItemResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        from_attributes=True,
    )

    bank_id: str = Field(min_length=1, serialization_alias="bankId")
    occurred_at: AwareDatetime = Field(serialization_alias="occurredAt")

    amount_minor: int = Field(
        ge=-MAX_SAFE_INTEGER,
        le=MAX_SAFE_INTEGER,
        serialization_alias="amountMinor",
    )
    operation_amount_minor: int = Field(
        ge=-MAX_SAFE_INTEGER,
        le=MAX_SAFE_INTEGER,
        serialization_alias="operationAmountMinor",
    )
    operation_currency_code: int = Field(
        ge=0,
        le=999,
        serialization_alias="operationCurrencyCode",
    )
    balance_minor: int = Field(
        ge=-MAX_SAFE_INTEGER,
        le=MAX_SAFE_INTEGER,
        serialization_alias="balanceMinor",
    )
    mcc: int = Field(ge=0, le=9999)
    commission_minor: int = Field(
        ge=-MAX_SAFE_INTEGER,
        le=MAX_SAFE_INTEGER,
        serialization_alias="commissionMinor",
    )
    category_id: str | None = Field(serialization_alias="categoryId")

    @model_validator(mode="after")
    def validate_transaction(self) -> Self:
        if self.occurred_at.utcoffset() != timedelta(0):
            raise ValueError("occurredAt must be UTC")

        if self.occurred_at.microsecond % 1000:
            raise ValueError("occurredAt must have millisecond precision")

        if self.amount_minor < 0:
            expected_category = mcc_to_category_id(self.mcc)

            if self.category_id != expected_category:
                raise ValueError("Transaction category does not match MCC")
        elif self.category_id is not None:
            raise ValueError("Only expenses can have a categoryId")

        return self


class TransactionsResponse(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        strict=True,
        from_attributes=True,
    )

    computed_at: AwareDatetime = Field(serialization_alias="computedAt")
    time_zone: Literal["Europe/Kyiv"] = Field(
        default="Europe/Kyiv",
        serialization_alias="timeZone",
    )
    currency: Literal["UAH"] = "UAH"

    items: tuple[TransactionItemResponse, ...] = Field(max_length=50)
    next_cursor: str | None = Field(
        min_length=1,
        serialization_alias="nextCursor",
    )

    @model_validator(mode="after")
    def validate_response(self) -> Self:
        if self.computed_at.utcoffset() != timedelta(0):
            raise ValueError("computedAt must be UTC")

        if self.computed_at.microsecond % 1000:
            raise ValueError("computedAt must have millisecond precision")

        bank_ids = [item.bank_id for item in self.items]

        if len(bank_ids) != len(set(bank_ids)):
            raise ValueError("Duplicate bankId in transaction page")

        if any(item.occurred_at > self.computed_at for item in self.items):
            raise ValueError("Transaction occurred after computedAt")

        keys = [(item.occurred_at, item.bank_id.encode("utf-8")) for item in self.items]

        if any(previous <= current for previous, current in pairwise(keys, keys[1:])):
            raise ValueError("Transactions must be sorted newest first")

        return self
