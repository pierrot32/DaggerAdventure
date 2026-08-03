pipeline {
    agent any

    stages {
        stage('Frontend lint and build') {
            steps {
                sh '''
                    docker run --rm \
                      -v "$PWD/frontend:/app" \
                      -w /app \
                      node:22-alpine \
                      sh -c "npm install && npm run lint && npm run build"
                '''
            }
        }

        stage('Backend checks') {
            steps {
                sh '''
                    docker run --rm \
                      -v "$PWD/backend:/app" \
                      -w /app \
                      rust:1.85 \
                      sh -c "cargo fmt -- --check && cargo check && cargo test"
                '''
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

                    sleep 3
                    curl --fail http://localhost:18080/healthz
                    curl --fail http://localhost:18080/api/hello

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