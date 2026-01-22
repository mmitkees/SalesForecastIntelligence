---
trigger: always_on
---

# Remote Deployment Protocol

**Rule:** All remote server operations MUST go through the sanctioned deployment process. Never bypass the standard workflow.

## Mandatory Procedures

1.  **Branch Discipline:**
    *   The production server (`129.151.159.172`) MUST always run the `prod` branch.
    *   Never manually switch the remote server to `dev`, `beta`, or any other branch.

2.  **Deployment Method:**
    *   **ALWAYS** use `./deployment/remote_deploy.sh` to deploy code to the remote server.
    *   **NEVER** manually `git pull`, `git reset`, or push code directly to the remote via SSH commands.
    *   **NEVER** use `scp` to copy Python files directly to the remote server (exception: one-off scripts for data operations that are immediately deleted).

3.  **Code Flow:**
    *   Develop on `dev` or any other feature branches.
    *   Merge to `prod` before deploying.
    *   Run `remote_deploy.sh` to sync the remote server.

## Rationale

This ensures:
*   Consistency between the repository and the live server.
*   Auditability of all production changes via git history.
*   Prevention of branch misalignment issues that led to BUG-001 deployment failures.

**Violation of this rule is considered a Critical Error.**
