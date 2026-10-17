# Next.js standalone build for Cloud Run.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# The standalone server does not include static assets; copy them next to it.
RUN cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
# The image optimiser writes .next/cache at run time; the copy above is root's, so node got EACCES (10-17).
RUN mkdir -p .next/cache && chown -R node:node .next
USER node
EXPOSE 8080
CMD ["node", "server.js"]
