FROM alpine/k8s:1.31.0
COPY install-argocd.sh /install-argocd.sh
RUN chmod +x /install-argocd.sh
ENTRYPOINT ["/install-argocd.sh"]
