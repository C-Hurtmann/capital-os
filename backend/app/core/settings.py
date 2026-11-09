from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # AWS
    aws_region: str
    dynamodb_table_name: str
    dynamodb_endpoint_url: str | None = None
    # Temp
    monobank_api_token: SecretStr
    monobank_account_id: str

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8"
    )
