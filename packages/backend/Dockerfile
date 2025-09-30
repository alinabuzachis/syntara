FROM node:22-alpine

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy workspace package files
COPY packages/backend/package*.json ./packages/backend/

# Install all dependencies (tsx is in devDependencies but needed for runtime)
RUN npm ci

# Copy source code
COPY packages/backend ./packages/backend

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=packages/backend"]
