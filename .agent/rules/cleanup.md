---
trigger: always_on
---

# Dead Code & Unused File Cleanup

**Rule:** Proactively identify dead code and unused files to maintain codebase hygiene, but **NEVER** delete without explicit user permission.

1.  **Identification:**
    *   Watch for files that are never imported or referenced.
    *   Identify functions, classes, or variables that are defined but never used (excluding public APIs).
    *   Spot commented-out blocks of code that are obsolete.

2.  **Notification:**
    *   If you find dead code or unused files, **ask the user** for permission to remove them.
    *   Provide a list of the specific items to be deleted.

3.  **Action (Only after approval):**
    *   Delete the unused files or code blocks.
    *   Update `PROJECT_STRUCTURE.md` if files were removed.
    *   Ensure no breaking changes are introduced (e.g., dynamic imports).

**Critical:** Do not "auto-fix" unused code by deleting it silently. Always confirm.
