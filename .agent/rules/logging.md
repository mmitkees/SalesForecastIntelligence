
# Standardized Logging

**Rule:** Implement comprehensive and structured logging for all automated tasks, background jobs, and scripts.

1.  **Location:** All logs **MUST** be stored in the `logs/` directory at the project root.
2.  **Separation:** Use distinct log files for different activities to prevent clutter (e.g., `logs/weekly_export.log`, `logs/backup.log`, `logs/app.log`).
3.  **Format:**
    *   Logs must include **timestamp**, **log level** (INFO, WARNING, ERROR), and a clear **message**.
    *   Example: `2026-01-20 10:00:00 - INFO - Starting weekly export job`
4.  **Error Handling:** Always log full stack traces for exceptions (`exc_info=True` in Python) to aid debugging.
5.  **Implementation:**
    *   Ensure the `logs/` directory exists before writing (`os.makedirs`).
    *   Do not hardcode paths; use relative paths from the project root.