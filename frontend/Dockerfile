FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN node -e "const fs = require('fs'); const html = fs.readFileSync('dist/index.html', 'utf8'); const assets = [...html.matchAll(/(?:src|href)=\\\"(\\/assets\\/[^\\\"]+)\\\"/g)].map(([, asset]) => asset.slice(1)); for (const asset of assets) { if (!fs.existsSync('dist/' + asset)) throw new Error('Missing build asset: ' + asset); }"

FROM builder AS checks
RUN npm run lint

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]