# Stage 1: Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
# Assuming package.json is in a 'src' directory relative to Dockerfile
COPY src/package*.json ./
RUN npm ci --only=production

# Copy application source code
# Assuming source code is in a 'src' directory relative to Dockerfile
COPY src/. ./

# Compile TypeScript to JavaScript
# Assuming 'build' script is defined in src/package.json
RUN npm run build

# Stage 2: Production Stage
FROM node:20-alpine
WORKDIR /app

# Copy only necessary production dependencies and built code from builder stage
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/package.json ./

# Expose the port the app runs on
EXPOSE 8080

# Set non-root user for security
USER node

# Command to run the application
# Adjust path based on your build output directory inside 'dist'
CMD ["node", "dist/server.js"]