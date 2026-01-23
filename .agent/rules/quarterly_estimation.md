---
trigger: always_on
---

# Quarterly Estimation Logic

**Rule:** When updating Sales Rep data, follow these calculation rules for monthly and quarterly projections.

## Monthly Field Calculations

1.  **Past Months:**
    *   **Do NOT modify.** These are manually entered actuals.

2.  **Current Month:**
    *   **Auto-detected** based on today's date (e.g., if today is Jan 22, current month = January).
    *   Current month has **two fields** in the database:
        *   **Act (Actual)**: Manual entry - never overwrite.
        *   **Est (Estimate)**: Calculated automatically.
    *   **Formula for Estimate:**
        ```
        current_month_est = current_month_act + (daily_rate × (remaining_days + 0.5))
        ```
    *   **Remaining Days** = `days_in_month - partial_data_date.day`

3.  **Future Months:**
    *   Simple projection based on daily rate:
        ```
        month_estimate = daily_rate × days_in_month
        ```
    *   This applies to ALL future months, regardless of quarter.

## Quarterly Aggregation

Quarterly Exit values are automatically summed from their constituent months:

| Quarter | Months | Formula |
|---------|--------|---------|
| Q1 | Jun + Jul + Aug | Sum of monthly values |
| Q2 | Sep + Oct + Nov | Sum of monthly values |
| Q3 | Dec + Jan + Feb | Sum of monthly values |
| Q4 | Mar + Apr + May | Sum of monthly values |

## Simulation Override

The `simulation` field is added ONLY to the **current** and **next** fiscal quarters (determined by today's date).

## UI Behavior

When the `current_daily_rate` field is updated, the entire dashboard must refresh to display the recalculated values for all quarters.
