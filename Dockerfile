# --- COOLIFY OPTIMIZED MULTI-STAGE DOCKERFILE ---

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors first to take advantage of layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for the build)
RUN npm ci

# Copy all application source files
COPY . .

# Run the build script to compile the frontend and bundle the server
RUN npm run build

# Stage 2: Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors for production install
COPY package*.json ./

# Install ONLY production dependencies to keep the image extremely lightweight
RUN npm ci --omit=dev

# Copy compiled assets and server bundle from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db.json ./db.json

# Copy firebase config if it exists (using wildcard to prevent build failure if missing)
COPY --from=builder /app/firebase-applet-config.json* ./

# Create default data directory and expose port
RUN mkdir -p /app/data
EXPOSE 3000

# Start the bundled high-performance server
CMD ["node", "dist/server.cjs"]
