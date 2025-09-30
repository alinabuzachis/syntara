FROM node:22-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/backend/package*.json ./packages/backend/

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY packages/backend ./packages/backend

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=packages/backend"]
