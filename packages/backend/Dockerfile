# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
RUN npm install
COPY packages/backend ./packages/backend
RUN npm run build --workspace=packages/backend

# Production stage
FROM nginx:alpine
COPY --from=builder /app/packages/backend/dist /home/node/
CMD ["node", "/home/node/main.js"]
