FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run server:types && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3003 HOST=0.0.0.0 MUJU_DB_PATH=/app/data/rooms.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/server ./server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3003
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/muju/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
