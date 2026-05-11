FROM nginx:1.27-alpine

COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY deploy/coaching-public /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80
