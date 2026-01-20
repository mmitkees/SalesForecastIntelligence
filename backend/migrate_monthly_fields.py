"""
Migration script for simplified 13-field monthly schema.
Adds: jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, current_month_est
Migrates data from old fields where applicable.
"""
import sqlite3
import os

DB_FILE = 'sales_app_v3.db'

# New monthly columns (simplified)
NEW_COLUMNS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'current_month_est']

# Data migration map: old column -> new column
DATA_MIGRATION = {
    'dec_actual': 'dec',
    'jan_actual': 'jan', 
    'jan_est': 'current_month_est',  # Current month estimate
    'feb_actual': 'feb'
}

def migrate():
    if not os.path.exists(DB_FILE):
        print("Database not found, skipping migration.")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get existing columns
    cursor.execute("PRAGMA table_info(sales_reps)")
    existing_columns = [row[1] for row in cursor.fetchall()]
    
    # Step 1: Add new columns
    print("Step 1: Adding new columns...")
    for col in NEW_COLUMNS:
        try:
            cursor.execute(f"ALTER TABLE sales_reps ADD COLUMN {col} REAL DEFAULT 0.0")
            conn.commit()
            print(f"  ✓ Added: {col}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print(f"  - Already exists: {col}")
            else:
                print(f"  ✗ Error: {e}")

    # Step 2: Migrate data from old columns
    print("\nStep 2: Migrating data from old columns...")
    for old_col, new_col in DATA_MIGRATION.items():
        if old_col in existing_columns:
            try:
                cursor.execute(f"UPDATE sales_reps SET {new_col} = {old_col} WHERE {old_col} IS NOT NULL AND {old_col} != 0")
                conn.commit()
                print(f"  ✓ {old_col} → {new_col}")
            except Exception as e:
                print(f"  ✗ Error migrating {old_col}: {e}")
        else:
            print(f"  - Old column not found: {old_col}")

    conn.close()
    print("\n✅ Migration complete!")

if __name__ == "__main__":
    migrate()
