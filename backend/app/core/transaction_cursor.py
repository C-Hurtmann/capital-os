from hashlib import sha256

from itsdangerous import BadData, URLSafeSerializer
from pydantic import ValidationError

from app.schemas.transactions import CursorPayload

MAX_CURSOR_LENGTH = 4096


class InvalidCursorError(ValueError):
    pass


class TransactionCursorCodec:
    def __init__(self, secret: str, account_id: str) -> None:
        if len(secret.encode("utf-8")) < 32:
            raise ValueError("Cursor secret is too short")

        if not account_id:
            raise ValueError("Account ID is required")

        self._serializer = URLSafeSerializer(
            secret_key=secret,
            salt=f"transactions:{account_id}",
            signer_kwargs={"digest_method": sha256},
        )

    def encode(self, payload: CursorPayload) -> str:
        token = self._serializer.dumps(payload.model_dump())

        if len(token) > MAX_CURSOR_LENGTH:
            raise ValueError("Cursor is too long")

        return token

    def decode(
        self,
        token: str,
        filters_key: str,
        now_ms: int,
    ) -> CursorPayload:
        if not isinstance(token, str) or not (0 < len(token) <= MAX_CURSOR_LENGTH):
            raise InvalidCursorError("Invalid cursor")

        try:
            data = self._serializer.loads(token)
            payload = CursorPayload.model_validate(data)
        except (BadData, ValidationError) as exc:
            raise InvalidCursorError("Invalid cursor") from exc

        if (payload.filters_key != filters_key) or (payload.cutoff_ms > now_ms):
            raise InvalidCursorError("Invalid cursor")

        return payload
