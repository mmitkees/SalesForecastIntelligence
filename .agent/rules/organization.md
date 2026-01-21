---
trigger: always_on
---

# Strict File Organization

**Rule:** Enforce a strict separation of concerns by placing files in their designated directories based on type and purpose.

1.  **Backend (`backend/`):**
    *   All Python source code (e.g., `.py` models, routes, scripts, utilities).
    *   Exceptions: `wsgi.py` or entry points specifically required at root (if any).
2.  **Frontend (`static/`):**
    *   **JavaScript:** `static/js/` (Controllers in `static/js/controllers/`, Utils in `static/js/`).
    *   **CSS:** `static/css/`.
    *   **HTML Views:** `static/views/`.
    *   **Main Entry:** `static/index.html`.
3.  **Scripts & Cron (`cronjobs/`):**
    *   Shell scripts (`.sh`) related to scheduled tasks.
    *   Crontab definitions.
    *   Wrapper scripts.
4.  **Deployment (`deployment/`):**
    *   Deployment scripts (`deploy.sh`).
    *   Configuration files (`requirements.txt`, `Procfile`).
5.  **Root Directory:**
    *   Only configuration files (`.env`, `.gitignore`, `README.md`, `PROJECT_STRUCTURE.md`) and the main database file (`.db`).
    *   **NO** loose code files or scripts in the root.

**Enforcement:** If you create a file in the wrong place, move it immediately and fix all pathes .
