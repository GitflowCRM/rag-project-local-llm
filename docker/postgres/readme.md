PGPASSWORD=postgres psql \
  -h localhost \
  -p 15432 \
  -U postgres \
  -d rag_db \
  -f create_posthog_events_table.sql


PGPASSWORD=postgres psql \
  -h localhost \
  -p 15432 \
  -U postgres \
  -d rag_db \
  -f posthog_events.sql


  

<!-- to dowload daata from db -->
  docker run --rm \
  -e PGPASSWORD=app_services_secret_password \
  -v $(pwd):/backup \
  postgres:15 \
  pg_dump -h host.docker.internal -p 54322 -U app_services -d app_services \
  -t posthog_events --inserts -f /backup/posthog_events.sql