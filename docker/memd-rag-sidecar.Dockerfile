FROM rust:1.94-trixie AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates

RUN cargo build --release -p memd-sidecar

FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/memd-rag
COPY --from=builder /app/target/release/memd-sidecar /usr/local/bin/rag-sidecar

ENV MEMD_RAG_STATE_FILE=/data/rag-sidecar.json
ENV MEMD_RAG_MODEL_CACHE=/data/models

VOLUME ["/data"]
EXPOSE 9000

CMD ["rag-sidecar", "--host", "0.0.0.0", "--port", "9000", "--state-file", "/data/rag-sidecar.json", "--embedding-cache-dir", "/data/models"]
