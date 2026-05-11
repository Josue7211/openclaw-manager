FROM node:22-alpine

WORKDIR /app

COPY deploy/agentshell/agent-shell-adapter.js /app/agent-shell-adapter.js

ENV AGENTSHELL_HOST=0.0.0.0
ENV AGENTSHELL_PORT=8077

EXPOSE 8077

CMD ["node", "/app/agent-shell-adapter.js"]
