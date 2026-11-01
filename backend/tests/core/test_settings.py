from pathlib import Path

from pytest import MonkeyPatch

from app.core.settings import Settings


def test_environment_overrides_dotenv(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AWS_REGION=eu-central-1\nDYNAMODB_TABLE_NAME=capital-os-local\n"
    )

    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.delenv("DYNAMODB_TABLE_NAME", raising=False)

    settings = Settings(_env_file=env_file)

    assert settings.aws_region == "us-east-1"
    assert settings.dynamodb_table_name == "capital-os-local"
