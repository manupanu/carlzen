# Build stage
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Compile server TypeScript in build stage where @types/* packages are available
RUN npx tsc --project tsconfig.server.json

# Final stage
FROM node:24-bookworm-slim

WORKDIR /app

# Install production dependencies for the server
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled server and built frontend from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
