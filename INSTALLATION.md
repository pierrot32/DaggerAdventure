# Installation

This guide covers local development and the self-hosted Docker Compose deployment. For the codebase map and normal development commands, see [README.md](README.md).

## Prerequisites

For local development:

- Git
- Docker Engine and Docker Compose
- Rust and Cargo
- Node.js and npm

For the public deployment, also prepare:

- A Linux server with `sudo` access
- A registered domain
- DNS access for the application, Jenkins, and Argo CD domains
- Router or firewall access for ports 80 and 443
- A container registry that Jenkins can push to

## Local installation

### 1. Clone and configure Compose

```bash
git clone <repository-url>
cd DaggerAdventure
cp .env.example .env
```

Set `POSTGRES_PASSWORD` in `.env`. The other root variables are used by the public deployment and can remain placeholders for local-only development.

### 2. Start PostgreSQL

```bash
docker compose up -d postgres
```

The Compose PostgreSQL service listens on `127.0.0.1:5432` and creates the `dagger_adventure` database and user.

### 3. Configure the backend

Create `backend/.env`:

```dotenv
DATABASE_URL=postgres://dagger_adventure:<POSTGRES_PASSWORD>@127.0.0.1:5432/dagger_adventure
JWT_SECRET=replace_with_a_long_local_secret
COOKIE_SECURE=false
PORT=8080
OPENAI_API_KEY=replace_with_your_openai_key
OPENAI_MODEL=gpt-5.6-luna
```

Use the same password as `POSTGRES_PASSWORD` in the root `.env`. Do not commit `backend/.env`.
The OpenAI key stays in this backend-only file. Do not put it in frontend environment variables,
browser code, a Dockerfile, or a committed manifest.

To create the administrator locally, register the account through the frontend
with the desired name, email, and password. Then start the backend with the
email passed directly in the shell command:

```bash
ADMIN_EMAIL='your-admin-email@example.com' cargo run
```

The backend promotes the matching account after migrations run. The account
name, password, and email do not need to be added to the repository.

### 4. Run the applications

Start the backend in one terminal:

```bash
cd backend
cargo run
```

Start the frontend in another:

```bash
cd frontend
npm ci
npm run dev
```

The API normally runs at `http://localhost:8080` and Vite normally runs at `http://localhost:5173`.

The API applies all pending migrations when it starts. Check that it is alive with:

```bash
curl http://localhost:8080/healthz
```

## Local tests

Backend formatting, compilation, and unit tests:

```bash
cd backend
cargo fmt -- --check
cargo check
cargo test
```

The default command runs the unit tests. The authentication integration tests require PostgreSQL and are marked `#[ignore]`. Run them with the same database URL configured in `backend/.env`:

```bash
DATABASE_URL="postgres://dagger_adventure:<POSTGRES_PASSWORD>@127.0.0.1:5432/dagger_adventure" \
  cargo test --test auth_tests -- --ignored --test-threads=1
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

The repository does not currently include a frontend unit-test runner. Linting and the production build are the available automated frontend checks.

To reproduce the Docker checks used by Jenkins:

```bash
cd ..
docker build --target checks -t dagger-backend-check:local ./backend
docker build --target checks -t dagger-frontend-check:local ./frontend
```

## Public deployment

The public deployment runs these services from [docker-compose.yml](docker-compose.yml):

- `nginx` terminates TLS and routes traffic.
- `certbot` issues and renews Let's Encrypt certificates.
- `jenkins` runs the CI pipeline.
- `docker` provides the Docker-in-Docker daemon used by Jenkins.
- `k3s` provides the Kubernetes cluster.
- `argocd` installs and bootstraps Argo CD in k3s.
- `postgres` provides the local Compose database service.

The application itself runs in Kubernetes from the manifests in `k8s/`.

### 1. Configure domains and deployment variables

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Set values similar to these:

```dotenv
DOMAIN=example.com
JENKINS_DOMAIN=jenkins.example.com
ARGOCD_DOMAIN=argocd.example.com
APP_DOMAIN=app.example.com
EMAIL=you@example.com
DDNS_PASSWORD=your_ddns_password
POSTGRES_PASSWORD=use_a_strong_password
```

`DDNS_PASSWORD` is only needed when using the Namecheap DDNS service. If the server has a static public IP or another DNS provider is used, configure DNS manually and disable or adjust that service.

### 2. Configure DNS and networking

Create A records pointing to the server's public IP:

- `APP_DOMAIN` for the application
- `JENKINS_DOMAIN` for Jenkins
- `ARGOCD_DOMAIN` for Argo CD

Allow and forward ports 80 and 443 to the server:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

If the server is behind a home router, reserve its LAN address and forward external ports 80 and 443 to it. If the domains cannot be reached from inside the LAN, enable NAT loopback or add local DNS/hosts-file entries for the server's LAN address.

### 3. Fill deployment placeholders

Before starting Argo CD, update these repository-specific values:

- `argo/app-dagger-adventure.yaml`: set `repoURL` to this Git repository.
- `k8s/backend/deployment.yaml` and `k8s/frontend/deployment.yaml`: set image repository paths that Jenkins can publish to.
- `Jenkinsfile`: confirm the GitHub remote used by the production promotion stage.

Create the backend and PostgreSQL secrets out of band through the k3s container. They are intentionally not committed to Git:

```bash
KUBECTL="docker compose exec -T k3s kubectl --kubeconfig /k3s-config/kubeconfig.yaml"
$KUBECTL create namespace dagger-adventure
$KUBECTL -n dagger-adventure create secret generic backend-secrets \
  --from-literal=database-url='postgres://<user>:<password>@<host>:5432/<database>' \
  --from-literal=jwt-secret='replace_with_a_long_secret' \
  --from-literal=openai-api-key='paste_the_key_without_committing_it'
$KUBECTL -n dagger-adventure create secret generic backend-admin-secrets \
  --from-literal=admin-email='admin@example.com'
$KUBECTL -n dagger-adventure create secret generic postgres-secrets \
  --from-literal=POSTGRES_PASSWORD='replace_with_a_strong_password'
```

Use the actual Kubernetes PostgreSQL service hostname and credentials in the backend `database-url` value.

Register the administrator account through the application before creating
`backend-admin-secrets`. The value in the example is only a placeholder: set
the real email from a local shell or password manager, not in a committed
manifest. The backend uses that email to promote the existing account after
startup; it does not create an account or store an administrator password from
Kubernetes configuration.

For an existing deployment, update only the separate admin secret without
touching database credentials. Replace the placeholder email directly in the
command; do not commit the command to Git. Run the complete pipeline below
together. Do not run the final `apply -f -` line by itself because it waits
for YAML input forever:

```bash
docker compose exec -T k3s sh -c \
  "kubectl --kubeconfig /k3s-config/kubeconfig.yaml \
    -n dagger-adventure create secret generic backend-admin-secrets \
    --from-literal=admin-email='your-admin-email@example.com' \
    --dry-run=client -o yaml | \
   kubectl --kubeconfig /k3s-config/kubeconfig.yaml apply -f -"
docker compose exec -T k3s kubectl --kubeconfig /k3s-config/kubeconfig.yaml \
  -n dagger-adventure rollout restart deployment/backend
```

### 4. Start the stack

```bash
docker compose up -d --build
docker compose ps
```

The `argocd` container is a one-shot installer and should exit with status 0 after it completes. The k3s cluster may take several minutes to initialize.

### 5. Issue TLS certificates

Run the certificate bootstrap once for each public domain, after DNS and port forwarding work:

```bash
sudo env DOMAIN=app.example.com EMAIL=you@example.com ./nginx/init-letsencrypt.sh
sudo env DOMAIN=jenkins.example.com EMAIL=you@example.com ./nginx/init-letsencrypt.sh
sudo env DOMAIN=argocd.example.com EMAIL=you@example.com ./nginx/init-letsencrypt.sh
```

Certificates are renewed by the `certbot` service every 12 hours.

### 6. Configure Jenkins

Open `https://jenkins.example.com` or `http://localhost:8081` on the server. Retrieve the initial password with:

```bash
docker compose exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Complete the Jenkins setup, then:

1. Add a registry credential with ID `docker-registry`.
2. Configure `DOCKER_REGISTRY` and `DOCKER_IMAGE_NAMESPACE` in the pipeline job.
3. Configure the GitHub webhook at `https://jenkins.example.com/github-webhook/`.
4. Add a Jenkins Username/Password credential with ID `github-credentials`. Use a GitHub bot username and a PAT with repository contents read/write and pull-request read/write permissions.
5. Ensure the repository has `main` and `production` branches and that the GitHub account can push the `jenkins/production-promotion` branch and create or update pull requests.

The pipeline checks, builds, smoke-tests, and publishes the backend and frontend images. Successful builds from `main` update the reusable `jenkins/production-promotion` branch and create or update a pull request targeting `production`. Jenkins does not merge that pull request. Merge it through the normal review or branch-protection workflow to promote the build.

### 7. Access Argo CD

Open `https://argocd.example.com`. Retrieve the initial admin password with:

```bash
docker compose exec k3s sh -c "kubectl --kubeconfig /k3s-config/kubeconfig.yaml \
  -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
```

Sign in as `admin`, change the password, and verify that the `dagger-adventure` Application is synchronized. Argo CD reads the manifests from `k8s/` on the `production` branch and deploys the application into the `dagger-adventure` namespace.

The Application manifest now targets `production`. For an existing installation, rebuild and rerun the one-shot installer once after the production branch contains this change so the live Argo CD Application is updated:

To rerun the installer after changing [argo/install-argocd.sh](argo/install-argocd.sh):

```bash
docker compose up -d --build argocd
```

## Troubleshooting

### Nginx cannot load a certificate

Nginx cannot start when its configured certificate path does not exist. Check the certificate directories:

```bash
docker compose run --rm --entrypoint "ls /etc/letsencrypt/live/" certbot
```

If Certbot created a suffixed directory such as `example.com-0001`, update the matching file in `nginx/templates/` and restart nginx:

```bash
docker compose restart nginx
```

A normal `docker compose up -d` does not restart an already-running nginx container when only a mounted template changes.

### The certificate is still self-signed

Check the certificate actually served by nginx:

```bash
curl -sv https://app.example.com 2>&1 | grep -E "subject:|issuer:"
```

`issuer=CN=localhost` means nginx is still serving the temporary certificate. Fix DNS, port forwarding, or the certificate path before retrying. Repeated failed Let's Encrypt requests can trigger a rate limit, so wait for the retry time shown by Certbot.

### Argo CD or the application returns 502

Check the cluster nodes, pods, and service endpoints:

```bash
docker compose exec k3s kubectl get nodes -o wide
docker compose exec k3s kubectl get pods -A -o wide
docker compose exec k3s kubectl -n dagger-adventure get endpoints
```

A service without endpoints usually means its pods are not ready or are scheduled on an unavailable node.

### Orphan container warning

Clean up containers from removed or renamed Compose services:

```bash
docker compose up -d --remove-orphans
```
