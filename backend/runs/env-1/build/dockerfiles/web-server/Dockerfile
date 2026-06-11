FROM nginx:latest
RUN (apt-get update && apt-get install -y nginx) \
 || (apk add --no-cache nginx) \
 || (yum install -y nginx)
EXPOSE 80
RUN mkdir -p /etc/cyblocks && echo 'CVE-2021-44228' >> /etc/cyblocks/vulnerabilities
