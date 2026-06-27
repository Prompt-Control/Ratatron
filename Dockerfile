FROM node:18-bullseye

# Install FFmpeg and other dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN ffmpeg -version | head -n 1 && \
    node --version && \
    npm --version

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-production.json* ./
RUN npm ci --only=production

# Copy application files
COPY server-production.js ./server.js
COPY client-production.html ./public/index.html
COPY .env-production-template ./.env.example

# Create necessary directories
RUN mkdir -p uploads logs temp-chunks public && \
    chmod -R 755 uploads logs temp-chunks

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Run server
CMD ["node", "server.js"]
