FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libgtk-3-dev \
    libsoup-3.0-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./src-tauri/
COPY src-tauri/build.rs ./src-tauri/build.rs
COPY src-tauri/capabilities ./src-tauri/capabilities
COPY src-tauri/icons ./src-tauri/icons
COPY src-tauri/tauri.conf.json ./src-tauri/tauri.conf.json
COPY src-tauri/migrations ./src-tauri/migrations
COPY src-tauri/resources ./src-tauri/resources
COPY src-tauri/src ./src-tauri/src
COPY frontend/public ./frontend/public

WORKDIR /app/src-tauri
RUN cargo build --release --bin clawcontrol-backend

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgtk-3-0 \
    libsoup-3.0-0 \
    libwebkit2gtk-4.1-0 \
    libayatana-appindicator3-1 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/clawcontrol

COPY --from=builder /app/src-tauri/target/release/clawcontrol-backend /usr/local/bin/clawcontrol-backend

ENV MC_BIND_HOST=0.0.0.0
ENV MC_BIND_PORT=3000
ENV CLAWCONTROL_DATA_DIR=/var/lib/clawcontrol

VOLUME ["/var/lib/clawcontrol"]

EXPOSE 3000

CMD ["clawcontrol-backend"]
