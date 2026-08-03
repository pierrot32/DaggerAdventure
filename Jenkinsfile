pipeline {
    agent any

    stages {
        stage('Frontend lint and build') {
            steps {
                sh 'docker build --target checks -t dagger-frontend-check:ci ./frontend'
            }
        }

        stage('Backend checks') {
            steps {
                sh 'docker build --target checks -t dagger-backend-check:ci ./backend'
            }
        }

        stage('Build application images') {
            steps {
                sh 'docker build -t dagger-backend:ci ./backend'
                sh 'docker build -t dagger-frontend:ci ./frontend'
            }
        }

        stage('Integration smoke test') {
            steps {
                sh '''
                    docker run -d --rm \
                      --name dagger-backend-ci \
                      -p 18080:8080 \
                      dagger-backend:ci

                                        curl --fail --retry 10 --retry-delay 1 --retry-connrefused \
                                            http://host.docker.internal:18080/healthz
                                        curl --fail --retry 10 --retry-delay 1 --retry-connrefused \
                                            http://host.docker.internal:18080/api/hello

                    docker stop dagger-backend-ci
                '''
            }
        }
    }

    post {
        always {
            sh 'docker rm -f dagger-backend-ci 2>/dev/null || true'
        }
    }
}