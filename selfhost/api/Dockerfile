FROM node:20-bookworm-slim

WORKDIR /app
COPY selfhost/api/package.json ./package.json
COPY selfhost/api/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts

COPY functionsEMAS/unionOp ./functionsEMAS/unionOp
COPY selfhost/api/src ./src

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
