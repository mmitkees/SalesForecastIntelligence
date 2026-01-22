---
trigger: always_on
---

# Testing Data Cleanup

**Rule:** All test data created during automated testing MUST be cleaned up after the test completes.

1.  **Trigger:**
    *   Whenever you create test data (e.g., test users, test sales reps, test workloads) for verification purposes.

2.  **Action:**
    *   After the test is complete (pass or fail), immediately delete all test records created during the test.
    *   Use descriptive names for test data (e.g., "Test Bot", "Automation Test") to make identification easy.

3.  **Verification:**
    *   Confirm the deletion was successful before completing the task.
    *   Never leave orphaned test data in the database.

**Critical:** Test data pollutes the production database and can cause confusion. Always clean up.
