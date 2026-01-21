---
trigger: always_on
---

# Dynamic Test Case Updates (Error => Test Case)

**Rule:** Every discovered error or bug must be converted into a formal test case to prevent regression.

1.  **Trigger:**
    *   Whenever you encounter a runtime error, logic bug, or UI issue during development or testing.
    *   Whenever the user reports a specific bug.

2.  **Action:**
    *   After identifying the root cause, create a new test case in `TEST_CASES.md`.
    *   **Format:**
        *   **ID:** Generate a new unique ID (e.g., `BUG-001`).
        *   **Description:** Briefly describe the error scenario (e.g., "Export fails when cluster has no data").
        *   **Steps to Reproduce:** Clear steps to trigger the issue.
        *   **Expected Result:** The correct behavior (after your fix).
    *   **Placement:** Add it to a "Regression Tests" or "Bug Fix Validation" section in `TEST_CASES.md`.

3.  **Verification:**
    *   Ensure the new test case passes after applying your fix.

**Goal:** Grow the regression test suite organically with every squashed bug.
