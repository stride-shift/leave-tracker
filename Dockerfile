# ---------- client build ----------
FROM node:20-alpine AS client_builder
WORKDIR /client

COPY client/package*.json ./
RUN npm ci

COPY client/ .

ENV VITE_DOCKERIZED=true
ENV VITE_API_URL=/
ENV VITE_GOOGLE_CLIENT_ID=37696495215-la8vcssapd26ghmsvbf62fba1ivq5dc6.apps.googleusercontent.com

RUN npm run build



# ---------- server runtime ----------
FROM node:20-alpine AS server_runtime
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ .

COPY --from=client_builder /client/dist ./public

# copy prisma schema, generate client at container startup
COPY server/prisma ./prisma


ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && npm start"]
