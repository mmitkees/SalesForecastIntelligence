# Sales App - Role-Based Test Cases

This document outlines test cases for validating the application across different user roles. All tests assume the user password is set to `user001` (except `sys` which is `sys`).

**Prerequisites:**
1. App is running.
2. Users exist in the database with the specified roles.

---

## 1. System Administrator
**User:** `sys`
**Role:** `system_admin`
**Credentials:** `sys / sys`

| ID | Description | Expected Result |
| :--- | :--- | :--- |
| **SYS-01** | **Admin Page Access**<br>Navigate to `/admin` | Page loads successfully. "Manage Clusters" and "Manage Sales Reps" sections are visible. |
| **SYS-02** | **Full Data Visibility**<br>Navigate to Dashboard | "Filter by Cluster" dropdown shows **ALL** clusters. "Filter by Rep" shows **ALL** reps. |
| **SYS-03** | **Global Workload Access**<br>Navigate to Workloads | Can see and edit workloads for ANY sales rep. |
| **SYS-04** | **Cron Job Management**<br>Check Logs | Has access to verify cron execution logs (via server access, out of app scope but relevant). |

---

## 2. Region Administrator
**User:** `Abdul`
**Role:** `region_admin`
**Credentials:** `Abdul / user001`

| ID | Description | Expected Result |
| :--- | :--- | :--- |
| **REG-01** | **Restricted Admin Access**<br>Navigate to `/admin` | Page loads, but may have restricted options compared to Sys Admin (e.g., cannot delete Clusters if restricted). *Verify specific restrictions.* |
| **REG-02** | **Region Data Visibility**<br>Navigate to Dashboard | "Filter by Cluster" shows only clusters within their assigned Region. |
| **REG-03** | **Workload Management**<br>Navigate to Workloads | Can add/edit workloads for any Rep within their Region. |

---

## 3. Cluster Administrator
**User:** `sudheesh`
**Role:** `cluster_admin`
**Credentials:** `sudheesh / user001`

| ID | Description | Expected Result |
| :--- | :--- | :--- |
| **CLU-01** | **No Admin Page Access**<br>Navigate to `/admin` | Should be redirected to Dashboard or show "Access Denied" / 403 Error. |
| **CLU-02** | **Cluster Data Visibility**<br>Navigate to Dashboard | Dashboard defaults to their specific Cluster. Cannot switch to other Clusters. |
| **CLU-03** | **Cluster Workload Access**<br>Navigate to Workloads | Can see and edit workloads for all Reps in their Cluster. |

---

## 4. Standard User (Sales Rep)
**User:** `Ohmmagesh`
**Role:** `user`
**Credentials:** `Ohmmagesh / user001`

| ID | Description | Expected Result |
| :--- | :--- | :--- |
| **USR-01** | **No Admin Access**<br>Navigate to `/admin` | Redirected to Dashboard or Access Denied. |
| **USR-02** | **Personal Data Visibility**<br>Navigate to Dashboard | Dashboard shows personal numbers. Rep Filter locked or defaulted to self. |
| **USR-03** | **Personal Workloads**<br>Navigate to Workloads | Can ONLY see and edit their OWN workloads. Cannot view other reps' data. |
| **USR-04** | **Add Workload**<br>Click "Add Workload" | "Sales Rep" field in modal is locked/defaulted to `Ohmmagesh`. |

---

## 5. Deployment & System Tests (General)

| ID | Description | Expected Result |
| :--- | :--- | :--- |
| **SYS-GEN-01** | **Weekly Export**<br>Run `cron_jobs/run_weekly_export.sh` | Excel file created in `generated_reports/` with correct name format. |

---

## 6. Regression & Bug Fixes

| ID | Description | Expected Result |
| :--- | :--- | :--- |
| **BUG-001** | **Workload Seeder Q2 Upload**<br>Upload an Excel file with Q2 data (Sep/Oct/Nov columns). | Workloads are created with correct `month_1`, `month_2`, `month_3` values and non-zero `total`. |
| **BUG-002** | **Override Button State Persistence**<br>1. Navigate to Dashboard<br>2. Click Override button for any quarter (should show "🔓 Override Active")<br>3. Perform a full page reload (F5)<br>4. Check the same quarter's Override button | Override button should still show "🔓 Override Active" after page reload. State should persist in localStorage. When toggled off and reloaded, it should remain off. |
