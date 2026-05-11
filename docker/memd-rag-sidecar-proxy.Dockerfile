FROM python:3.13-slim

WORKDIR /srv/memd-rag
COPY memd_rag_sidecar_proxy.py /srv/memd-rag/memd_rag_sidecar_proxy.py

ENV HOST=0.0.0.0
ENV PORT=9000

EXPOSE 9000

CMD ["python", "/srv/memd-rag/memd_rag_sidecar_proxy.py"]
