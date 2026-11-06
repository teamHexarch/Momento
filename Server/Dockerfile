# The Momento API as a container (run on the AWS Lightsail server by deploy/docker-compose.yml).
# Build: docker build -t momento-server .   Run: docker run -p 8080:8080 --env-file .env momento-server
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# Dependencies first, so they're cached between builds when only the code changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

# Photos go to S3 on AWS; this folder is only used if S3_BUCKET is left empty
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.js"]
