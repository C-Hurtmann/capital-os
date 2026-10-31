from functools import lru_cache
from typing import TYPE_CHECKING, Annotated

import boto3
from fastapi import Depends

from app.core.settings import Settings

if TYPE_CHECKING:
    from mypy_boto3_dynamodb.client import DynamoDBClient


@lru_cache(maxsize=1)
def _create_dynamodb_client(region: str, endpoint_url: str | None) -> DynamoDBClient:
    kwargs = {"region_name": region}
    if endpoint_url:
        kwargs.update(
            endpoint_url=endpoint_url,
            aws_access_key_id="local",
            aws_secret_access_key="local",
        )

    return boto3.client("dynamodb", **kwargs)


def get_dynamodb_client(
    settings: Annotated[Settings, Depends(Settings.settings_cached)],
) -> DynamoDBClient:
    return _create_dynamodb_client(
        settings.aws_region,
        settings.dynamodb_endpoint_url,
    )
