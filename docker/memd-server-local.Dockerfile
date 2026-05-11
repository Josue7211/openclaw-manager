FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/memd
COPY memd-server /usr/local/bin/memd-server

ENV MEMD_DB_PATH=/data/memd.db
ENV MEMD_BIND_ADDR=0.0.0.0:8787

VOLUME ["/data"]
EXPOSE 8787

CMD ["memd-server"]
