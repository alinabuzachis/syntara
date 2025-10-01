# Build stage - use native platform for faster builds
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/
RUN npm ci
COPY packages/frontend ./packages/frontend
RUN npm run build --workspace=packages/frontend

# Production stage
FROM --platform=$TARGETPLATFORM nginx:alpine
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY packages/frontend/.htpasswd /etc/nginx/.htpasswd
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
