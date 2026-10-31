FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production
ENV PORT=3000
ENV FFMPEG_PATH=/usr/bin/ffmpeg
EXPOSE 3000
CMD ["node", "production-server.mjs"]
