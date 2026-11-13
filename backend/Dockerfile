FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --only=production

COPY . .

EXPOSE 5000

# Set NODE_ENV to production by default. This is critical for security.
# All production-only safety guards depend on this being correctly set.
ENV NODE_ENV=production

CMD ["npm", "start"]
