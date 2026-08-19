# Repository Agent Safety

## Deployment and Test Isolation

- Never access, test against, or mutate a deployed or shared database. This includes production, staging, Kubernetes-managed PostgreSQL, cloud databases, and any database reached through a deployed backend.
- Never use a deployed backend or frontend as a test target. Do not send requests to deployment URLs, ingress hosts, public domains, port-forwarded services, or Kubernetes services and pods.
- Do not use Kubernetes, kubectl, Helm, Argo CD, or cluster exec/port-forward commands for application testing or debugging. Do not start or exercise the deployed Compose/Kubernetes application stack as part of validation.
- Do not run the backend application's normal startup path for tests when its environment could load deployment credentials or run migrations against an existing database.
- Prefer database-free validation: unit tests, pure validation tests, formatters, linters, type checks, builds, and integration-test compilation with database execution disabled.
- If database-backed testing is necessary, create or use only a disposable, isolated test database provisioned specifically for that test run. It must use test-only credentials, an isolated database/volume/network, and explicit cleanup. A local PostgreSQL container is acceptable only when it is demonstrably isolated from deployed and shared data.
- If HTTP or browser testing is necessary, start only a local test backend/frontend with test-only configuration and local URLs. Never substitute a deployed URL when local services are unavailable; report the check as blocked instead.
- Before running a command, inspect its environment and target. Do not inherit `DATABASE_URL`, API base URLs, Kubernetes contexts, deployment credentials, or `.env` files that could direct the command to shared infrastructure. Scope test-only variables to the command and avoid printing secrets.
- Never run ignored database integration tests unless the disposable test database has been explicitly provisioned and its isolation verified. Otherwise compile them only or add a database-free unit test.
- If a requested validation would violate these rules, stop that validation, explain the isolation requirement, and choose the narrowest safe alternative. Report exactly which checks were not run.

## Command Hygiene

- Prefer short, conventional, readable commands. Avoid long or unusual one-liners, deeply nested shell quoting, opaque pipelines, and unrelated commands chained together.
- Run separate commands for separate actions, and use an explicit working directory when needed instead of relying on a stale terminal directory.
- Prefer repository tools or focused commands over improvised shell scripts. If a command must be complex, explain its purpose, keep it reviewable, and split it into smaller steps when practical.

## Reporting

Every implementation or review report must state whether deployed services, Kubernetes, or a shared database were accessed. It must identify database-backed checks as either database-free, run against a disposable isolated test database, or not run.
