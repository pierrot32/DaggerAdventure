#!/bin/sh
set -e

echo "Waiting for k3s kubeconfig..."
until [ -f /k3s-config/kubeconfig.yaml ]; do sleep 3; done

# Rewrite server URL from loopback to the k3s service hostname
export KUBECONFIG=/tmp/kubeconfig.yaml
sed 's|https://127.0.0.1:6443|https://k3s:6443|g' /k3s-config/kubeconfig.yaml > "$KUBECONFIG"

echo "Waiting for k3s API server..."
until kubectl cluster-info >/dev/null 2>&1; do sleep 3; done

echo "Installing Argo CD..."
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

echo "Waiting for Argo CD server..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=300s

echo "Configuring insecure HTTP mode..."
kubectl -n argocd patch cm argocd-cmd-params-cm --type=merge \
  -p '{"data":{"server.insecure":"true"}}'

echo "Exposing Argo CD UI on NodePort 30080..."
kubectl -n argocd patch svc argocd-server \
  -p '{"spec":{"type":"NodePort","ports":[{"name":"http","port":80,"nodePort":30080,"protocol":"TCP"},{"name":"https","port":443,"nodePort":30443,"protocol":"TCP"}]}}'

echo "Installing ingress-nginx (routes the frontend/backend app inside k3s)..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/baremetal/deploy.yaml
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=300s

echo "Allowing application uploads through ingress-nginx..."
kubectl -n ingress-nginx patch configmap ingress-nginx-controller --type=merge \
  -p '{"data":{"proxy-body-size":"64m","use-forwarded-headers":"true"}}'
kubectl -n ingress-nginx rollout restart deployment/ingress-nginx-controller
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=300s

echo "Exposing ingress-nginx on NodePort 30081..."
kubectl -n ingress-nginx patch svc ingress-nginx-controller \
  -p '{"spec":{"type":"NodePort","ports":[{"name":"http","port":80,"nodePort":30081,"protocol":"TCP"},{"name":"https","port":443,"nodePort":30444,"protocol":"TCP"}]}}'

echo "Registering the dagger-adventure Argo CD Application (deploys k8s/ from git)..."
kubectl apply -f /app-dagger-adventure.yaml

echo "Argo CD is ready. Access it through nginx at https://\${ARGOCD_DOMAIN}"
echo "(run nginx/init-letsencrypt.sh with DOMAIN=\$ARGOCD_DOMAIN once to obtain its certificate)"
echo "Retrieve the admin password with:"
echo "  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
echo "The app itself is reachable through nginx at https://\${APP_DOMAIN} once its ingress is synced"
echo "(run nginx/init-letsencrypt.sh with DOMAIN=\$APP_DOMAIN once to obtain its certificate)"
