FROM nginx:alpine
COPY index.html admin.html vendedor.html app.js style.css sw.js manifest.json /usr/share/nginx/html/
EXPOSE 80
