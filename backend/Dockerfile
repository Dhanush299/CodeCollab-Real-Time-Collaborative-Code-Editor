FROM node:22-bookworm-slim

WORKDIR /app

# The code runner invokes `python3` for Python files. Install it in the
# production image rather than relying on a runtime that only exists locally.
RUN apt-get update \
  && apt-get install --no-install-recommends -y python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY server.ts socket.ts ./
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY types ./types
COPY utils ./utils

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=5008
EXPOSE 5008

CMD ["node", "dist/server.js"]
