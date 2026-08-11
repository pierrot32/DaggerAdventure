static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn migrations_can_run_up_down_to_zero_and_up_again(pool: sqlx::PgPool) {
    MIGRATOR
        .undo(&pool, 0)
        .await
        .expect("all migrations should be reversible");

    let source_books_after_down: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('public.source_books')::text")
            .fetch_one(&pool)
            .await
            .expect("schema health query should succeed after rollback");
    assert!(source_books_after_down.is_none());

    MIGRATOR
        .run(&pool)
        .await
        .expect("all migrations should apply again");

    let source_books_after_up: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('public.source_books')::text")
            .fetch_one(&pool)
            .await
            .expect("schema health query should succeed after reapply");
    assert_eq!(source_books_after_up.as_deref(), Some("source_books"));
}
