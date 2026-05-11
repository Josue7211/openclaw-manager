FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js

ENV BRIDGE_PORT=4100
EXPOSE 4100

CMD ["npm", "start"]
