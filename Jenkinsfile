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
                    docker build -t dagger-backend:${BUILD_NUMBER} ./backend
                    docker build -t dagger-frontend:${BUILD_NUMBER} ./frontend
                '''
            }
        }

        stage('Integration smoke test') {
            steps {
                sh '''
                    set -eu
                    docker network create dagger-ci-network
                    docker run -d --rm \
                      --name dagger-backend-ci \
                      --network dagger-ci-network \
                      dagger-backend:${BUILD_NUMBER}

                    docker run --rm --network dagger-ci-network curlimages/curl:8.12.1 \
                        --fail --retry 10 --retry-delay 1 --retry-connrefused \
                        http://dagger-backend-ci:8080/healthz
                    docker run --rm --network dagger-ci-network curlimages/curl:8.12.1 \
                        --fail --retry 10 --retry-delay 1 --retry-connrefused \
                        http://dagger-backend-ci:8080/api/hello

                    docker stop dagger-backend-ci || true
                    docker network rm dagger-ci-network || true
                '''
            }
        }
    }

    post {
        always {
            sh '''
                docker rm -f dagger-backend-ci 2>/dev/null || true
                docker network rm dagger-ci-network 2>/dev/null || true
                docker image rm dagger-backend:${BUILD_NUMBER} dagger-frontend:${BUILD_NUMBER} 2>/dev/null || true
            '''
        }
    }
}