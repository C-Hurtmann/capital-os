from hashlib import sha256

import pytest
from itsdangerous import URLSafeSerializer

from app.core.transaction_cursor import InvalidCursorError, TransactionCursorCodec
from app.schemas.transactions import CursorPayload

SECRET = "test-secret-" + "x" * 32
ACCOUNT_ID = "monobank-main"
FILTERS_KEY = "from=2026-11-01&direction=expense&limit=20"


@pytest.fixture
def codec() -> TransactionCursorCodec:
    return TransactionCursorCodec(
        secret=SECRET,
        account_id=ACCOUNT_ID,
    )


@pytest.fixture
def payload() -> CursorPayload:
    return CursorPayload(
        cutoff_ms=1_000,
        position="opaque-repository-position",
        filters_key=FILTERS_KEY,
    )


def test_round_trip(
    codec: TransactionCursorCodec,
    payload: CursorPayload,
) -> None:
    token = codec.encode(payload)

    decoded = codec.decode(
        token,
        filters_key=FILTERS_KEY,
        now_ms=2_000,
    )

    assert decoded == payload


def test_rejects_modified_token(
    codec: TransactionCursorCodec,
    payload: CursorPayload,
) -> None:
    token = codec.encode(payload)
    data, signature = token.rsplit(".", 1)

    replacement = "A" if signature[0] != "A" else "B"
    modified_token = f"{data}.{replacement}{signature[1:]}"

    with pytest.raises(InvalidCursorError):
        codec.decode(
            modified_token,
            filters_key=FILTERS_KEY,
            now_ms=2_000,
        )


def test_rejects_different_filters(
    codec: TransactionCursorCodec,
    payload: CursorPayload,
) -> None:
    token = codec.encode(payload)

    with pytest.raises(InvalidCursorError):
        codec.decode(
            token,
            filters_key="direction=income&limit=20",
            now_ms=2_000,
        )


def test_rejects_different_account(
    codec: TransactionCursorCodec,
    payload: CursorPayload,
) -> None:
    token = codec.encode(payload)

    other_codec = TransactionCursorCodec(
        secret=SECRET,
        account_id="another-account",
    )

    with pytest.raises(InvalidCursorError):
        other_codec.decode(
            token,
            filters_key=FILTERS_KEY,
            now_ms=2_000,
        )


def test_rejects_future_cutoff(
    codec: TransactionCursorCodec,
    payload: CursorPayload,
) -> None:
    token = codec.encode(payload)

    with pytest.raises(InvalidCursorError):
        codec.decode(
            token,
            filters_key=FILTERS_KEY,
            now_ms=999,
        )


@pytest.mark.parametrize(
    "token",
    ["", "invalid-token", "x" * 4097],
)
def test_rejects_invalid_tokens(
    codec: TransactionCursorCodec,
    token: str,
) -> None:
    with pytest.raises(InvalidCursorError):
        codec.decode(
            token,
            filters_key=FILTERS_KEY,
            now_ms=2_000,
        )


def test_rejects_invalid_signed_payload(
    codec: TransactionCursorCodec,
) -> None:
    serializer = URLSafeSerializer(
        secret_key=SECRET,
        salt=f"transactions:{ACCOUNT_ID}",
        signer_kwargs={"digest_method": sha256},
    )

    token = serializer.dumps(
        {
            "cutoff_ms": "not-an-integer",
            "position": "opaque-position",
            "filters_key": FILTERS_KEY,
        }
    )

    with pytest.raises(InvalidCursorError):
        codec.decode(
            token,
            filters_key=FILTERS_KEY,
            now_ms=2_000,
        )


def test_rejects_short_secret() -> None:
    with pytest.raises(ValueError):
        TransactionCursorCodec(
            secret="short",
            account_id=ACCOUNT_ID,
        )
