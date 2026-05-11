FROM node:22-bookworm-slim AS builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./

ARG VITE_API_BASE=https://coaching.aparcedo.org
ARG VITE_SITE_URL=https://coaching.aparcedo.org
ARG VITE_ASSET_BASE=/

ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_ASSET_BASE=${VITE_ASSET_BASE}

RUN npm run build

FROM nginx:1.27-alpine

COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
