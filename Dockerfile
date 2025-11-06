FROM node:25-alpine3.22
LABEL API="pembayaran API"
ENV APP_HOST=0.0.0.0
ENV APP_PORT=8089
WORKDIR /adameds-payment
COPY . .
RUN npm install
EXPOSE $APP_PORT/tcp
CMD ["npm", "run", "start"]