import importlib.util
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(title="ClawControl RAGAnything Miner")


class IngestRequest(BaseModel):
    path: str | None = Field(default=None)
    content: str | None = Field(default=None)
    mime: str | None = Field(default=None)
    source_id: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


@app.get("/healthz")
def healthz():
    work_dir = Path(os.environ.get("RAGANYTHING_WORK_DIR", "/data/raganything"))
    work_dir.mkdir(parents=True, exist_ok=True)
    return {
        "status": "ok",
        "service": "raganything-miner",
        "backend": {
            "raganything": module_available("raganything"),
            "mineru": module_available("mineru"),
            "work_dir": str(work_dir),
        },
    }


@app.post("/v1/ingest")
def ingest(_: IngestRequest):
    raise HTTPException(
        status_code=501,
        detail="RAGAnything/MinerU service is bundled; ingestion adapter wiring is pending in memd rag-sidecar.",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.environ.get("RAGANYTHING_HOST", "0.0.0.0"),
        port=int(os.environ.get("RAGANYTHING_PORT", "8010")),
        reload=False,
    )
