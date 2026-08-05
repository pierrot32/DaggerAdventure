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
        stage('Skip GitOps commit-back builds') {
            steps {
                script {
                    // the 'Update GitOps manifests' stage below pushes back to this same
                    // branch, which would otherwise retrigger this pipeline forever
                    def msg = sh(script: 'git log -1 --pretty=%B', returnStdout: true).trim()
                    if (msg.contains('[skip ci]')) {
                        currentBuild.result = 'NOT_BUILT'
                        error('Skipping build: automated GitOps manifest commit')
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
                      -e JWT_SECRET=ci-only-secret \
                                            ${BACKEND_IMAGE}:${IMAGE_TAG}

                    docker run --rm --network dagger-ci-network curlimages/curl:8.12.1 \
                        --fail --retry 10 --retry-delay 1 --retry-connrefused \
                        http://dagger-backend-ci:8080/healthz
                    docker run --rm --network dagger-ci-network curlimages/curl:8.12.1 \
                        sh -eu -c '
                            curl --fail --retry 10 --retry-delay 1 --retry-connrefused \
                                -c /tmp/ci-cookies \
                                -H "content-type: application/json" \
                                --data "{\"email\":\"ci@example.com\",\"name\":\"CI User\",\"password\":\"ci-password\"}" \
                                http://dagger-backend-ci:8080/api/auth/register >/dev/null
                            curl --fail --retry 10 --retry-delay 1 --retry-connrefused \
                                -b /tmp/ci-cookies \
                                http://dagger-backend-ci:8080/api/hello
                        '

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