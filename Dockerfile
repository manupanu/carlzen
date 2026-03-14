# Build stage
FROM node:20-slim AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Final stage
FROM node:20-slim

WORKDIR /app

# Install production dependencies for the server
COPY package*.json ./
RUN npm install --omit=dev

# Copy server source and built frontend
COPY server ./server
COPY --from=build /app/dist ./dist

# We need ts-node to run the server in the container, 
# or we could transpile it. Let's transpile for better performance.
RUN npm install -g typescript
RUN tsc server/index.ts --outDir dist-server --module esnext --target esnext --moduleResolution node --esModuleInterop

# Environment variables
ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80

CMD ["node", "dist-server/index.js"]
