FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      curl \
      ffmpeg \
      libreoffice \
      poppler-utils \
      tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      "fastapi>=0.115,<1" \
      "uvicorn[standard]>=0.32,<1" \
      "raganything[all]" \
      "mineru[all]"

COPY docker/raganything-miner-server.py /app/server.py

ENV RAGANYTHING_HOST=0.0.0.0
ENV RAGANYTHING_PORT=8010
ENV RAGANYTHING_WORK_DIR=/data/raganything
ENV MINERU_MODEL_SOURCE=local

VOLUME ["/data"]
EXPOSE 8010

CMD ["python", "/app/server.py"]
