FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src ./src
COPY data/indian-recipes.json ./data/indian-recipes.json
EXPOSE 5000
CMD ["npm", "start"]
