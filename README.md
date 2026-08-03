# DaggerAdventure
A fully DaggerHeart application to create and manage an adventure.

Personnal project to get training in React and Rust in a full CI/CD deployement flow.

# Domain
Buy a domain name (here I will use namecheap with daggeradventure domain)

# Allows your router to forward port 80 and 443 to your server
1. Allow firewall rule on server
```
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```
2. Configure your modem to forward port 80 and 443 to your specific server ip adress (use a static ip adress to be sure it does not change over time)

# Get a certs for Jenkin
1. Comment following in nginx/templates/default.conf.template
```
server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Jenkins sends large build logs/artifacts and long-polling requests
    client_max_body_size 100m;
    proxy_read_timeout 90s;

    location / {
        proxy_pass http://jenkins:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect http:// https://;
    }
}
```
2. Launch script to get the certificate
```
sudo env DOMAIN=jenkins.domain.com \
  EMAIL=email\
  ./nginx/init-letsencrypt.sh
```
3. Uncomment and restart docker containers

# CI/CD
## Jenkins
Build and start Jenkins using docker containers to simulate cloud environment 
1. sudo docker compose up -d --build
2. Go to http://localhost:8081/
3. Find Jenkins admin password in docker container
```
# Build and launch docker container
sudo docker compose up -d --build

# Open web page using url http://localhost:8081/

# Find Jenkins admin password
# Go inside docker container
docker exec -it daggeradventure-jenkins-1 /bin/bash

# Get the password
cat /var/jenkins_home/secrets/initialAdminPassword
```
4. Create your user in Jenkins and complete installation
5. Link your domain to Jenkins
- In namecheap website, go to Domain list and select manage with your domain
- Go to Advenced DNS and add a new record
- 
