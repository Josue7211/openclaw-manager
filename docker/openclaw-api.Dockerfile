FROM node:22-alpine

WORKDIR /app

COPY scripts/openclaw-api.mjs /app/openclaw-api.mjs

EXPOSE 3939

CMD ["node", "/app/openclaw-api.mjs"]
