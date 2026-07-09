# LMS

Django + PostgreSQL project skeleton with a custom user-management app.

## Stack

- **Django 5.2** (LTS)
- **PostgreSQL** via `psycopg` 3
- **django-environ** for 12-factor configuration
- Custom email-based `User` model (`authentication.User`)
- **JWT auth** (djangorestframework-simplejwt) + **CORS** (django-cors-headers) for a decoupled frontend

## Project layout

```
lms/
├── config/            # project package (settings, urls, wsgi/asgi)
├── authentication/    # user-management app + custom User model + JWT auth API
├── templates/         # login / signup / profile templates
├── requirements.txt
├── .env.example       # copy to .env
└── manage.py
```

## Getting started

### 1. Create a virtual environment and install dependencies

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env      # then edit values
```

Generate a real secret key:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 3. Create the PostgreSQL database

Using an existing local PostgreSQL server, create the database. The defaults
in `.env.example` connect as the `postgres` superuser to a database named `lms`:

```bash
psql -U postgres -c "CREATE DATABASE lms;"
```

Or point `DATABASE_URL` in `.env` at any credentials/database you already have.

### 4. Run migrations and create an admin user

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

### 5. Run the development server

```bash
python manage.py runserver
```

## Key routes

| Path                    | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `/admin/`               | Django admin                                  |
| `/api/auth/login/`      | JWT login (email + password) → access/refresh |
| `/api/auth/refresh/`    | Refresh an access token                       |
| `/api/auth/logout/`     | Blacklist a refresh token                     |
| `/api/users/`           | User-management CRUD API (JWT, permissioned)  |
| `/accounts/login/`      | Log in (built-in auth views)                  |
| `/users/signup/`        | Register a new account                        |
| `/users/profile/`       | Signed-in user's profile (login required)     |

The React frontend (in `../frontend`) consumes the `/api/*` endpoints. Its
allowed origin is configured via `CORS_ALLOWED_ORIGINS` (see `.env.example`).

## Tests

```bash
python manage.py test
```
