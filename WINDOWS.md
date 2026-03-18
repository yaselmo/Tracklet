# Tracklet on Native Windows

This repository is Linux-first, but the changes in this tree provide a minimum viable native Windows path for local development and single-host use without Docker, WSL, or virtualization.

## Supported Goal

- Backend boot on native Windows
- Frontend build on native Windows
- PostgreSQL on native Windows
- Background worker on native Windows

## Current Windows Limits

- PDF report rendering is disabled unless you install `weasyprint` manually
- SAML / `xmlsec` support is omitted from the Windows dependency profile
- Gunicorn and supervisor are not used on Windows
- Redis is optional; the default Windows path uses in-memory cache and a single background worker

## Clean Machine Setup

Install these tools first:

1. Python 3.11.x
2. Node.js 20.x
3. Yarn 1.x
4. PostgreSQL 16 or 17
5. Git for Windows

Recommended PowerShell session:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## Setup Commands

Run from the repository root:

```powershell
py -3.11 -m venv env
.\\env\\Scripts\\Activate.ps1
python -m pip install --upgrade pip setuptools invoke
Copy-Item .\\contrib\\windows\\config.windows.yaml .\\config\\config.yaml
python -m invoke install --windows
cd .\\src\\frontend
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install
cd ..\\..
python -m invoke update --skip_backup --no_frontend
python -m invoke superuser
```

If you want the backend-served frontend bundle:

```powershell
cd .\\src\\frontend
yarn run build
cd ..\\..
python -m invoke static
```

## Run Commands

Backend:

```powershell
.\\contrib\\windows\\start-backend.ps1
```

Worker:

```powershell
.\\contrib\\windows\\start-worker.ps1
```

Frontend dev server:

```powershell
.\\contrib\\windows\\start-frontend.ps1
```

## Browser URLs

- Backend UI / compiled frontend: `http://127.0.0.1:8000`
- Frontend dev server: `http://127.0.0.1:5173`

## Production-Like Windows Note

The `invoke gunicorn` task automatically uses Waitress on Windows. For service management on Windows, use NSSM or WinSW to register:

- `env\\Scripts\\python.exe -m invoke gunicorn -a 127.0.0.1:8000`
- `env\\Scripts\\python.exe -m invoke worker`

Use IIS, Caddy for Windows, or Nginx for Windows as the reverse proxy. Keep static and media directories on local NTFS paths and point your proxy there.
