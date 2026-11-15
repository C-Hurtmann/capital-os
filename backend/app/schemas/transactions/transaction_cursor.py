from pydantic import BaseModel, ConfigDict, Field


class CursorPayload(BaseModel):
    model_config = ConfigDict(frozen=True, strict=True, extra="forbid")

    cutoff_ms: int = Field(ge=0)
    position: str = Field(min_length=1)
    filters_key: str = Field(min_length=1)
