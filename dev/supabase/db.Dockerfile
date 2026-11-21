# Stock Postgres plus wal2json, the logical-decoding plugin Supabase Realtime reads changes with.
FROM postgres:15-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-15-wal2json \
 && rm -rf /var/lib/apt/lists/*
