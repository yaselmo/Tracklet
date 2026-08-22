# Tracklet public-demo setup

The Compose project persists PostgreSQL, Redis, static files, media, and local
configuration under the bind-mounted `contrib/container/inventree-data`
directory. PostgreSQL uses the `inventree-db` service and the database named by
`INVENTREE_DB_NAME` in `.env`. The reset below uses Django's project-supported
flush command and does not delete the bind mount, migration history, schema,
source, or assets.

## Clean local database and seed it

Run these commands from `contrib/container`:

```bash
docker compose build inventree-server inventree-worker
docker compose up -d inventree-db inventree-cache
docker compose run --rm inventree-server invoke dev.delete-data --force --migrate
docker compose run --rm -e TRACKLET_DEMO_PASSWORD inventree-server \
  python src/backend/Tracklet/manage.py seed_demo
docker compose run --rm inventree-server \
  python src/backend/Tracklet/manage.py collectstatic --noinput
docker compose up -d
```

Export `TRACKLET_DEMO_PASSWORD` in the shell first, or add it only to the
deployment environment. Do not commit it. The command intentionally fails when
the variable is missing.

`seed_demo` is idempotent: rerunning it updates the same fictional records.
To remove and recreate only seed-owned records, run:

```bash
docker compose run --rm -e TRACKLET_DEMO_PASSWORD inventree-server \
  python src/backend/Tracklet/manage.py seed_demo --reset
```

The public account is `demo`. It is non-staff, non-superuser, and belongs only
to `Tracklet Demo Viewers`, which grants view access to parts, part categories,
stock, stock locations, events, and rentals. It has no add, change, delete,
admin, authentication-management, settings, or plugin-management role.

If a private maintenance administrator is needed, set a private password in the
shell and create it interactively (never publish these credentials):

```bash
docker compose exec inventree-server \
  python src/backend/Tracklet/manage.py createsuperuser
```

Reset that private administrator's password interactively with:

```bash
docker compose exec inventree-server \
  python src/backend/Tracklet/manage.py changepassword <admin-username>
```

The server startup hook runs migrations and `collectstatic` whenever
`INVENTREE_AUTO_UPDATE=True`, preventing a fresh static bind mount from staying
empty.
