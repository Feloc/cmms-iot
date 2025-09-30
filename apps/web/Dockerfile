FROM node:20-bookworm-slim
WORKDIR /app

# El build context ES ./apps/web
COPY package*.json ./
RUN npm ci || npm install

# Copiamos el código de la web
COPY . ./

EXPOSE 3000
CMD ["npm", "run", "dev"]
