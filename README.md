# DaggerAdventure

A DaggerHeart companion application for creating and managing adventures.

Personal project used to get hands-on training with React, Rust, and a full self-hosted CI/CD deployment flow (Jenkins + Argo CD on Kubernetes).

## Architecture overview

| Component | Purpose |
|---|---|
| `frontend/` | React + Vite app |
| `backend/` | Rust (Axum) API |
| `jenkins/` | Jenkins image with Docker CLI, runs CI pipeline (`Jenkinsfile`) |
| `docker` service (dind) | Docker-in-Docker daemon used by Jenkins to build/push images |
| `nginx/` | Reverse proxy terminating TLS for both public subdomains |
| `certbot` | Automatic Let's Encrypt certificate issuance/renewal |
| `ddns` | Keeps your DNS A records pointed at your home IP if it isn't static |
| `k3s` | Lightweight Kubernetes cluster (required by Argo CD) |
| `argo/` | One-shot installer that deploys Argo CD into the `k3s` cluster |

Two public subdomains are used:
- `jenkins.<yourdomain>` → Jenkins UI
- `argocd.<yourdomain>` → Argo CD UI

Everything runs via a single [docker-compose.yml](docker-compose.yml).

## Prerequisites

- A Linux server with Docker and the Docker Compose plugin installed.
- A registered domain name (any registrar).
- Admin access to your router (to forward ports 80/443).
- `sudo` access on the server.

## 1. Clone and configure environment variables

```bash
git clone <this-repo-url>
cd DaggerAdventure
cp .env.example .env
```

Edit `.env`:

```dotenv
DOMAIN=jenkins.yourdomain.com
ARGOCD_DOMAIN=argocd.yourdomain.com
EMAIL=you@example.com          # used for Let's Encrypt renewal notices
DDNS_PASSWORD=your_ddns_password  # only needed if using Namecheap DDNS, see below
```

## 2. DNS setup

1. In your registrar's DNS panel, create **A records** for both subdomains pointing at your server's public IP:
   - `jenkins.yourdomain.com` → `<public IP>`
   - `argocd.yourdomain.com` → `<public IP>`
2. If your public IP isn't static, the `ddns` service in `docker-compose.yml` keeps a Namecheap DDNS host record updated every 15 minutes. It's pre-wired for Namecheap's DDNS API — set `DDNS_PASSWORD` in `.env` to the DDNS password shown in your domain's "Advanced DNS" tab. If you use a different DNS provider or have a static IP, adjust or remove the `ddns` service in [docker-compose.yml](docker-compose.yml) accordingly.

## 3. Router and firewall setup

1. Allow the required ports through the server's firewall:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw status
   ```
2. In your router's admin panel, forward external ports **80** and **443** to this server's LAN IP. Give the server a static/reserved LAN IP (via DHCP reservation) so the forwarding rule doesn't break.

### NAT loopback (accessing your own domain from inside the LAN)

Most consumer routers don't support **NAT hairpinning/loopback**: if you open `https://jenkins.yourdomain.com` from a device on the *same* LAN as the server, the request goes out to your public IP and never routes back in, so it hangs or fails. This does **not** affect external visitors — only devices on your home network.

Fixes (try in order):
1. Look for a **"NAT Loopback"** / **"NAT Hairpinning"** setting in your router's admin panel and enable it.
2. If your router doesn't support it, override DNS locally. On each LAN device you want direct access from, add to `/etc/hosts` (Linux/macOS) or `C:\Windows\System32\drivers\etc\hosts` (Windows):
   ```
   192.168.x.x   jenkins.yourdomain.com
   192.168.x.x   argocd.yourdomain.com
   ```
   replacing `192.168.x.x` with the server's LAN IP (find it with `hostname -I` on the server). For multiple LAN devices, run a local DNS resolver (e.g. Pi-hole/dnsmasq) with the same overrides instead of editing every device's hosts file.

## 4. First boot

Build and start everything:

```bash
sudo docker compose up -d --build
```

This starts `docker` (dind), `jenkins`, `nginx`, `certbot`, `ddns`, `k3s`, and `argocd` (the Argo CD installer). Give it a few minutes on first run — `k3s` needs to initialize and the `argocd` service needs to install Argo CD into it.

Check status:
```bash
sudo docker compose ps
```
All services should show `Up` (the `argocd` container will show `Exited (0)` once its one-time install finishes successfully — that's expected, not a failure).

## 5. Get TLS certificates

Nginx needs a real certificate before it can serve HTTPS for each domain. The bootstrap script briefly serves a self-signed placeholder, starts nginx so it can answer the ACME HTTP challenge, then swaps in the real Let's Encrypt certificate. Run it once per domain, **after** DNS (step 2) and port forwarding (step 3) are working:

```bash
sudo env DOMAIN=jenkins.yourdomain.com EMAIL=you@example.com ./nginx/init-letsencrypt.sh
sudo env DOMAIN=argocd.yourdomain.com EMAIL=you@example.com ./nginx/init-letsencrypt.sh
```

Certificates auto-renew via the `certbot` service (checks every 12h). You only need to rerun this script if a domain changes or a certificate is somehow lost.

> If a run fails partway (e.g. DNS/port-forwarding wasn't ready yet), nginx can get stuck crash-looping because its config points at a certificate that no longer exists. See [Troubleshooting](#troubleshooting) below.

## 6. Jenkins setup

1. Open `https://jenkins.yourdomain.com` (or `http://localhost:8081` locally on the server).
2. Get the initial admin password:
   ```bash
   sudo docker exec -it daggeradventure-jenkins-1 cat /var/jenkins_home/secrets/initialAdminPassword
   ```
3. Complete the setup wizard and create your admin user.
4. In **Manage Jenkins → Credentials**, add a username/password credential with ID `docker-registry` for your container registry (used by the `Jenkinsfile` to push images).
5. In the job/pipeline configuration, set the environment variables `DOCKER_REGISTRY` and `DOCKER_IMAGE_NAMESPACE` (required by the `Jenkinsfile`).
6. Add a GitHub webhook to your repository pointing at `https://jenkins.yourdomain.com/github-webhook/` so pushes trigger builds (the `Jenkinsfile` uses `githubPush()`).

The pipeline ([Jenkinsfile](Jenkinsfile)) lints, builds, smoke-tests, and pushes `backend`/`frontend` images, tagging `latest` on the `main` branch.

## 7. Argo CD setup

Argo CD requires a real Kubernetes API, so it's installed into a lightweight [k3s](https://k3s.io/) cluster running inside Docker Compose rather than as standalone containers.

1. Open `https://argocd.yourdomain.com`.
2. Get the initial admin password:
   ```bash
   sudo docker compose exec k3s sh -c "kubectl --kubeconfig /k3s-config/kubeconfig.yaml \
     -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
   ```
3. Log in as `admin` with that password, then change it and connect your application manifests/repos as needed.

To re-run the Argo CD installer (e.g. after upgrading the manifest version in [argo/install-argocd.sh](argo/install-argocd.sh)):
```bash
sudo docker compose up -d --build argocd
```

## Local development (without the full stack)

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
cargo run
```

## Troubleshooting

**nginx is crash-looping / "cannot load certificate ... no such file"**
This means nginx's config references a certificate file that doesn't exist (usually because a certificate request failed after the temporary self-signed cert was already deleted). Recreate a temporary self-signed cert to get nginx stable, then retry the real request:
```bash
D=yourdomain-that-is-broken.com
sudo docker compose run --rm --entrypoint "sh -c \"mkdir -p /etc/letsencrypt/live/$D && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout /etc/letsencrypt/live/$D/privkey.pem -out /etc/letsencrypt/live/$D/fullchain.pem \
  -subj '/CN=localhost'\"" certbot
sudo docker compose up -d nginx
# once nginx shows "Up" and stable:
sudo docker compose run --rm --entrypoint \
  "certbot certonly --webroot -w /var/www/certbot -d $D --email you@example.com --no-eff-email --agree-tos" certbot
sudo docker compose exec nginx nginx -s reload
```

**Browser says the site is "not secure" even though the cert step succeeded**
Check what nginx is actually serving:
```bash
curl -sv https://yourdomain.com 2>&1 | grep -E "subject:|issuer:"
```
`issuer=CN=localhost` means nginx is still serving the temporary self-signed placeholder — the real request either failed or was rate-limited (check the terminal output from step 5) and never replaced it. Also, if a directory for that exact domain already existed (e.g. from the self-signed step), certbot may save the real certificate under a `<domain>-0001` suffix instead of overwriting it. Check with:
```bash
sudo docker compose run --rm --entrypoint "ls /etc/letsencrypt/live/" certbot
```
and update the `ssl_certificate`/`ssl_certificate_key` paths in the matching `nginx/templates/*.conf.template` file to match the real directory name. After editing a template, run `sudo docker compose restart nginx` — `docker compose up -d` will **not** restart an already-running container just because a mounted template file changed.

**Let's Encrypt: "too many failed authorizations ... retry after ..."**
You hit their rate limit after repeated failed attempts (usually because nginx wasn't actually reachable yet). Wait for the time shown in the error, fix the underlying reachability issue (DNS/port-forwarding/nginx crash-loop) first, then retry.

**Can't reach the domain from inside your own network**
See [NAT loopback](#nat-loopback-accessing-your-own-domain-from-inside-the-lan) above.

**"Found orphan containers" warning**
Shown when services were removed/renamed in `docker-compose.yml` since the last `up`. Clean up with:
```bash
sudo docker compose up -d --remove-orphans
```

