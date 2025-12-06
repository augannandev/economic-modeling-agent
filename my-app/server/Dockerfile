FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/pnpm-lock.yaml ./server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY server ./server

# Build the application
WORKDIR /app/server
RUN pnpm build

# Expose port
EXPOSE 5500

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5500/api/v1/hello', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run the application
CMD ["node", "dist/server.js"]

