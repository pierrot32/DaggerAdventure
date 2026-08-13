pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 20, unit: 'MINUTES')
    }

    triggers {
        githubPush()
    }

    stages {
        stage('Skip automated promotion builds') {
            steps {
                script {
                    // Promotion branch pushes must not start another image build.
                    def msg = sh(script: 'git log -1 --pretty=%B', returnStdout: true).trim()
                    if (msg.contains('[skip ci]')) {
                        currentBuild.result = 'NOT_BUILT'
                        error('Skipping build: automated GitOps manifest commit')
                    }
                }
            }
        }

        stage('Skip non-main builds') {
            steps {
                script {
                    def sourceBranch = sh(
                        script: '''
                            branch="${BRANCH_NAME:-${GIT_BRANCH:-}}"
                            branch="${branch#origin/}"
                            if [ -z "$branch" ]; then
                                branch="$(git branch --show-current)"
                            fi
                            printf '%s' "$branch"
                        ''',
                        returnStdout: true
                    ).trim()

                    if (sourceBranch != 'main') {
                        currentBuild.result = 'NOT_BUILT'
                        error("Skipping non-main build for branch '${sourceBranch ?: 'unknown'}'")
                    }
                }
            }
        }

        stage('Prepare image references') {
            steps {
                script {
                    if (!env.DOCKER_REGISTRY?.trim() || !env.DOCKER_IMAGE_NAMESPACE?.trim()) {
                        error('Set DOCKER_REGISTRY and DOCKER_IMAGE_NAMESPACE in the Jenkins job configuration')
                    }

                    env.IMAGE_TAG = "${env.BUILD_NUMBER}-${sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()}"
                    env.BACKEND_IMAGE = "${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE_NAMESPACE}/daggeradventure_backend"
                    env.FRONTEND_IMAGE = "${env.DOCKER_REGISTRY}/${env.DOCKER_IMAGE_NAMESPACE}/daggeradventure_frontend"
                }
            }
        }

        stage('Checks') {
            parallel {
                stage('Frontend lint') {
                    steps {
                        sh 'docker build --target checks -t dagger-frontend-check:ci ./frontend'
                    }
                }

                stage('Backend checks') {
                    steps {
                        sh 'docker build --target checks -t dagger-backend-check:ci ./backend'
                    }
                }
            }
        }

        stage('Backend database integration tests') {
            steps {
                sh '''
                    set -eu
                    test_network="dagger-db-tests-${BUILD_TAG:-$$}"
                    postgres_name="dagger-postgres-tests-${BUILD_TAG:-$$}"
                    test_image="dagger-backend-integration-tests:${BUILD_TAG:-$$}"
                    cleanup() {
                        docker rm -f "$postgres_name" >/dev/null 2>&1 || true
                        docker network rm "$test_network" >/dev/null 2>&1 || true
                        docker image rm "$test_image" >/dev/null 2>&1 || true
                    }
                    trap cleanup EXIT

                    docker network create "$test_network"
                    docker run -d --rm \
                      --name "$postgres_name" \
                      --network "$test_network" \
                      -e POSTGRES_DB=dagger_adventure \
                      -e POSTGRES_USER=dagger_adventure \
                      -e POSTGRES_PASSWORD=ci-password \
                      postgres:16-alpine

                    until docker run --rm --network "$test_network" postgres:16-alpine \
                        pg_isready -h "$postgres_name" -U dagger_adventure -d dagger_adventure; do
                        sleep 1
                    done

                                        docker build \
                                            -f backend/Dockerfile.integration \
                                            -t "$test_image" \
                                            .

                                        docker run --rm \
                                            --network "$test_network" \
                                            -e DATABASE_URL=postgres://dagger_adventure:ci-password@${postgres_name}:5432/dagger_adventure \
                                            "$test_image"
                '''
            }
        }

        stage('Build application images') {
            steps {
                sh '''
                    docker build -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend
                    docker build -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./frontend
                '''
            }
        }

        stage('Integration smoke test') {
            steps {
                sh '''
                    set -eu
                    docker network create dagger-ci-network
                    cleanup() {
                        docker rm -f dagger-backend-ci dagger-postgres-ci >/dev/null 2>&1 || true
                        docker network rm dagger-ci-network >/dev/null 2>&1 || true
                    }
                    trap cleanup EXIT

                    docker run -d --rm \
                      --name dagger-postgres-ci \
                      --network dagger-ci-network \
                      -e POSTGRES_DB=dagger_adventure \
                      -e POSTGRES_USER=dagger_adventure \
                      -e POSTGRES_PASSWORD=ci-password \
                      postgres:16-alpine

                    until docker run --rm --network dagger-ci-network postgres:16-alpine \
                        pg_isready -h dagger-postgres-ci -U dagger_adventure -d dagger_adventure; do
                        sleep 1
                    done

                    docker run -d --rm \
                      --name dagger-backend-ci \
                      --network dagger-ci-network \
                      -e DATABASE_URL=postgres://dagger_adventure:ci-password@dagger-postgres-ci:5432/dagger_adventure \
                      -e JWT_SECRET=ci-only-secret-change-this-to-a-32-byte-value \
                                            -e COOKIE_SECURE=false \
                                            ${BACKEND_IMAGE}:${IMAGE_TAG}

                    docker run --rm --network dagger-ci-network curlimages/curl:8.12.1 \
                        --fail --retry 10 --retry-delay 1 --retry-connrefused \
                        http://dagger-backend-ci:8080/healthz
                    docker run --rm --network dagger-ci-network curlimages/curl:8.12.1 \
                        --fail --retry 10 --retry-delay 1 --retry-connrefused \
                        -c /tmp/ci-cookies \
                        -H 'content-type: application/json' \
                        --data '{"email":"ci@example.com","name":"CI User","password":"ci-password"}' \
                        -o /dev/null \
                        http://dagger-backend-ci:8080/api/auth/register \
                        --next \
                        --fail --retry 10 --retry-delay 1 --retry-connrefused \
                        -b /tmp/ci-cookies \
                        http://dagger-backend-ci:8080/api/hello

                    docker stop dagger-backend-ci || true
                    docker network rm dagger-ci-network || true
                '''
            }
        }
 
        stage('Publish images') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker-registry',
                    usernameVariable: 'DOCKER_USERNAME',
                    passwordVariable: 'DOCKER_PASSWORD'
                )]) {
                    sh '''
                        set -eu
                        echo "$DOCKER_PASSWORD" | docker login "$DOCKER_REGISTRY" \
                            --username "$DOCKER_USERNAME" --password-stdin
                        docker push "${BACKEND_IMAGE}:${IMAGE_TAG}"
                        docker push "${FRONTEND_IMAGE}:${IMAGE_TAG}"


                        docker tag "${BACKEND_IMAGE}:${IMAGE_TAG}" "${BACKEND_IMAGE}:latest"
                        docker tag "${FRONTEND_IMAGE}:${IMAGE_TAG}" "${FRONTEND_IMAGE}:latest"
                        docker push "${BACKEND_IMAGE}:latest"
                        docker push "${FRONTEND_IMAGE}:latest"

                    '''
                }
            }
        }

        stage('Promote to production PR') {
            steps {
                script {
                    def sourceBranch = sh(
                        script: '''
                            branch="${BRANCH_NAME:-${GIT_BRANCH:-}}"
                            branch="${branch#origin/}"
                            if [ -z "$branch" ]; then
                                branch="$(git branch --show-current)"
                            fi
                            printf '%s' "$branch"
                        ''',
                        returnStdout: true
                    ).trim()

                    if (sourceBranch != 'main') {
                        echo "Skipping production promotion for branch '${sourceBranch ?: 'unknown'}'"
                        return
                    }

                    withCredentials([usernamePassword(
                        credentialsId: 'github-credentials',
                        usernameVariable: 'GITHUB_USERNAME',
                        passwordVariable: 'GITHUB_TOKEN'
                    )]) {
                        sh '''
                            set -eu

                            promotion_branch='jenkins/production-promotion'
                            production_branch='production'
                            source_commit="$(git rev-parse HEAD)"

                            git fetch origin main production
                            git checkout -B "$promotion_branch" "$source_commit"
                            git merge --no-edit "origin/$production_branch"

                            replace_image() {
                                file="$1"
                                image="$2"

                                if [ "$(grep -Ec '^[[:space:]]+image: ' "$file")" -ne 1 ]; then
                                    echo "Expected exactly one container image in $file" >&2
                                    exit 1
                                fi

                                sed -i -E "s|^([[:space:]]+image: ).*$|\\1${image}|" "$file"
                            }

                            replace_image k8s/backend/deployment.yaml "${BACKEND_IMAGE}:${IMAGE_TAG}"
                            replace_image k8s/frontend/deployment.yaml "${FRONTEND_IMAGE}:${IMAGE_TAG}"

                            if git diff --quiet -- k8s/backend/deployment.yaml k8s/frontend/deployment.yaml; then
                                echo 'Image references did not change; refusing to create an empty promotion PR' >&2
                                exit 1
                            fi

                            git config user.name 'jenkins-production-bot'
                            git config user.email 'jenkins-production-bot@users.noreply.github.com'
                            git add k8s/backend/deployment.yaml k8s/frontend/deployment.yaml
                            git commit -m "Promote ${IMAGE_TAG} to production [skip ci]"

                            askpass_file="$(mktemp)"
                            cleanup() {
                                rm -f "$askpass_file"
                            }
                            trap cleanup EXIT
                            cat > "$askpass_file" <<'EOF'
#!/bin/sh
case "$1" in
    *Username*) printf '%s\n' "$GITHUB_USERNAME" ;;
    *Password*) printf '%s\n' "$GITHUB_TOKEN" ;;
esac
EOF
                            chmod 700 "$askpass_file"
                            export GIT_ASKPASS="$askpass_file"
                            export GIT_TERMINAL_PROMPT=0
                            git push --force origin "$promotion_branch"

                            remote_url="$(git config --get remote.origin.url)"
                            case "$remote_url" in
                                https://github.com/*) repository="${remote_url#https://github.com/}" ;;
                                git@github.com:*) repository="${remote_url#git@github.com:}" ;;
                                *) echo "Unsupported GitHub remote: $remote_url" >&2; exit 1 ;;
                            esac
                            repository="${repository%.git}"
                            owner="${repository%%/*}"
                            api_url="${GITHUB_API_URL:-https://api.github.com}"
                            api_base="$api_url/repos/$repository"
                            pr_title="Promote ${IMAGE_TAG} to production"
                            pr_body="Promotes source commit ${source_commit} with backend image ${BACKEND_IMAGE}:${IMAGE_TAG} and frontend image ${FRONTEND_IMAGE}:${IMAGE_TAG}. Merge this PR to deploy the tested build through Argo CD."
                            pr_payload="$(jq -n \
                                --arg title "$pr_title" \
                                --arg head "$owner:$promotion_branch" \
                                --arg base "$production_branch" \
                                --arg body "$pr_body" \
                                '{title: $title, head: $head, base: $base, body: $body}')"

                            open_prs="$(curl -fsS \
                                -u "$GITHUB_USERNAME:$GITHUB_TOKEN" \
                                -H 'Accept: application/vnd.github+json' \
                                "$api_base/pulls?state=open&head=$owner:$promotion_branch&base=$production_branch")"
                            pr_number="$(printf '%s' "$open_prs" | jq -r '.[0].number // empty')"

                            if [ -n "$pr_number" ]; then
                                curl -fsS -X PATCH \
                                    -u "$GITHUB_USERNAME:$GITHUB_TOKEN" \
                                    -H 'Accept: application/vnd.github+json' \
                                    -H 'Content-Type: application/json' \
                                    "$api_base/pulls/$pr_number" \
                                    --data "$pr_payload" >/dev/null
                                echo "Updated production PR #$pr_number"
                            else
                                curl -fsS -X POST \
                                    -u "$GITHUB_USERNAME:$GITHUB_TOKEN" \
                                    -H 'Accept: application/vnd.github+json' \
                                    -H 'Content-Type: application/json' \
                                    "$api_base/pulls" \
                                    --data "$pr_payload" >/dev/null
                                echo 'Created production promotion PR'
                            fi
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            sh '''
                docker rm -f dagger-backend-ci 2>/dev/null || true
                docker network rm dagger-ci-network 2>/dev/null || true
                docker image rm "${BACKEND_IMAGE}:${IMAGE_TAG}" "${FRONTEND_IMAGE}:${IMAGE_TAG}" \
                    "${BACKEND_IMAGE}:latest" "${FRONTEND_IMAGE}:latest" 2>/dev/null || true
                docker logout "${DOCKER_REGISTRY:-}" 2>/dev/null || true
            '''
        }
    }
}