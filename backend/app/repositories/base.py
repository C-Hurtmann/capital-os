from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any, Self

from fastapi import Depends

from app.core.dynamodb import get_dynamodb_client
from app.core.settings import Settings

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.client import DynamoDBClient


class BaseRepository:
    def __init__(
        self,
        client: DynamoDBClient,
        table_name: str,
    ) -> None:
        self.client = client
        self.table_name = table_name

    @classmethod
    def get_repository(
        cls,
        settings: Annotated[
            Settings,
            Depends(Settings.settings_cached),
        ],
        client: Annotated[
            Any,
            Depends(get_dynamodb_client),
        ],
    ) -> Self:
        return cls(
            client=client,
            table_name=settings.dynamodb_table_name,
        )
