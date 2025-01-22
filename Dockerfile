FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install

COPY . .

RUN npx prisma generate
RUN npx tsc

EXPOSE 4000

CMD ["node", "dist/infra/http/server.js"]