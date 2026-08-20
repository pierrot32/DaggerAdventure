FROM rust:1.97 AS checks
WORKDIR /app

RUN rustup component add rustfmt

COPY Cargo.toml Cargo.lock* ./
COPY rustfmt.toml ./
COPY src ./src
COPY migrations ./migrations

RUN cargo fmt -- --check && cargo check && cargo test

FROM rust:1.97 AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/backend /usr/local/bin/backend

EXPOSE 8080
CMD ["backend"]