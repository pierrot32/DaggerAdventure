FROM alpine/k8s:1.31.0
COPY install-argocd.sh /install-argocd.sh
COPY app-dagger-adventure.yaml /app-dagger-adventure.yaml
RUN chmod +x /install-argocd.sh
ENTRYPOINT ["/install-argocd.sh"]
