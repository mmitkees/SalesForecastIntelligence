import sqlite3
import os

DB_PATH = os.path.expanduser("~/sales-app/sales_app_v3.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get existing columns
    cursor.execute("PRAGMA table_info(sales_reps)")
    existing_columns = [row[1] for row in cursor.fetchall()]

    new_columns = [
        ("q1_simulation", "FLOAT DEFAULT 0.0"),
        ("q2_simulation", "FLOAT DEFAULT 0.0"),
        ("q3_simulation", "FLOAT DEFAULT 0.0"),
        ("q4_simulation", "FLOAT DEFAULT 0.0")
    ]

    for col_name, col_def in new_columns:
        if col_name not in existing_columns:
            print(f"Adding column {col_name} to sales_reps...")
            try:
                cursor.execute(f"ALTER TABLE sales_reps ADD COLUMN {col_name} {col_def}")
                print(f"Successfully added {col_name}")
            except Exception as e:
                print(f"Error adding {col_name}: {e}")
        else:
            print(f"Column {col_name} already exists.")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
