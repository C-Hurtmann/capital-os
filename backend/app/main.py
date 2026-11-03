import uvicorn
from fastapi import FastAPI

from app.api.credit_limit import router as credit_limit_router
from app.api.health import router as health_router

app = FastAPI(
    title="Capital OS API",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(credit_limit_router)


if __name__ == "__main__":
    uvicorn.run(app, port=8001)
