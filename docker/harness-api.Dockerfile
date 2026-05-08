FROM node:22-alpine

WORKDIR /app

COPY scripts/harness-api.mjs /app/harness-api.mjs

EXPOSE 3939

CMD ["node", "/app/harness-api.mjs"]
