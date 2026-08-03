#!/usr/bin/env bash
# One-time bootstrap: obtains the first Let's Encrypt certificate for Jenkins.
# Run this AFTER your domain's DNS points at this machine's public IP and
# router ports 80/443 are forwarded here. Re-run only if you change DOMAIN.
set -euo pipefail

if [ -z "${DOMAIN:-}" ]; then
  echo "Set DOMAIN in a .env file or export it before running this script." >&2
  exit 1
fi

EMAIL="${EMAIL:-}"
RSA_KEY_SIZE=4096
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "### Creating a temporary self-signed certificate for $DOMAIN ..."
docker compose run --rm --entrypoint "\
  mkdir -p $CERT_PATH && \
  openssl req -x509 -nodes -newkey rsa:$RSA_KEY_SIZE -days 1 \
    -keyout '$CERT_PATH/privkey.pem' \
    -out '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Starting nginx ..."
docker compose up -d nginx

echo "### Deleting temporary certificate ..."
docker compose run --rm --entrypoint "rm -rf /etc/letsencrypt/live/$DOMAIN" certbot

echo "### Requesting real certificate for $DOMAIN ..."
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    -d $DOMAIN \
    ${EMAIL:+--email $EMAIL} ${EMAIL:+--no-eff-email} $([ -z \"$EMAIL\" ] && echo --register-unsafely-without-email) \
    --agree-tos --force-renewal" certbot

echo "### Reloading nginx ..."
docker compose exec nginx nginx -s reload

echo "Done. Jenkins should now be reachable at https://$DOMAIN"
