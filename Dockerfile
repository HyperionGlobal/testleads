FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=build_ca if [ -f /run/secrets/build_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci; else npm ci; fi
COPY --chown=node:node . .
RUN npm run db:generate && npm run build
RUN chown -R node:node /app/.next
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["npm","start"]
