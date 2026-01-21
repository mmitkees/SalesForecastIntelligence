
# Auto-Update Project Structure

**Rule:** Always keep `PROJECT_STRUCTURE.md` in strict synchronization with the actual file system.

1.  **Trigger:** Whenever you create, potentiall move/rename, or delete a file or directory.
2.  **Action:** Immediately update `PROJECT_STRUCTURE.md` to reflect the change.
3.  **Content:**
    *   Add the new file to the tree structure in the appropriate location.
    *   Provide a brief, accurate description of the file's purpose (e.g., `# Weekly workload export script`).
    *   Ensure the directory tree formatting is preserved.
4.  **Verification:** Do not assume the file is updated; verify the `PROJECT_STRUCTURE.md` content matches the new state.