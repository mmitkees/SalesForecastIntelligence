#!/usr/bin/env python3
"""
Database Migration Script for Region Hierarchy + RBAC.
Adds new columns to existing tables without losing data.
"""

import sqlite3
import os
import hashlib


def hash_password(password):
    """Simple password hashing using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()


def migrate():
    # Find the database file
    db_path = os.environ.get("DATABASE_URL", "sqlite:///sales_app_v3.db")
    if db_path.startswith("sqlite:///"):
        db_path = db_path.replace("sqlite:///", "")
    
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. Create regions table if it doesn't exist
        print("Creating regions table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS regions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL
            )
        """)
        
        # 2. Add region_id to clusters if not exists
        print("Adding region_id to clusters...")
        try:
            cursor.execute("ALTER TABLE clusters ADD COLUMN region_id INTEGER REFERENCES regions(id)")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print("  - region_id column already exists")
            else:
                raise
        
        # 3. Add auth fields to sales_reps if not exists
        print("Adding auth fields to sales_reps...")
        auth_columns = [
            ("username", "VARCHAR(100)"),
            ("password_hash", "VARCHAR(256)"),
            ("role", "VARCHAR(50) DEFAULT 'user'")
        ]
        
        for col_name, col_type in auth_columns:
            try:
                cursor.execute(f"ALTER TABLE sales_reps ADD COLUMN {col_name} {col_type}")
                print(f"  - Added {col_name}")
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    print(f"  - {col_name} column already exists")
                else:
                    raise
        
        conn.commit()
        
        # 4. Create default region and assign clusters
        print("\nCreating default region...")
        cursor.execute("SELECT COUNT(*) FROM regions")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO regions (name) VALUES ('Default Region')")
            region_id = cursor.lastrowid
            print(f"  - Created 'Default Region' (ID: {region_id})")
            
            # Assign all clusters to this region
            cursor.execute("UPDATE clusters SET region_id = ? WHERE region_id IS NULL", (region_id,))
            print(f"  - Assigned clusters to default region")
        else:
            print("  - Regions already exist")
        
        # 5. Create sys admin if not exists
        print("\nCreating sys admin user...")
        cursor.execute("SELECT id FROM sales_reps WHERE username = 'sys'")
        if cursor.fetchone() is None:
            # Get a cluster and fiscal year for sys admin
            cursor.execute("SELECT id FROM clusters LIMIT 1")
            cluster_row = cursor.fetchone()
            cursor.execute("SELECT id FROM fiscal_years LIMIT 1")
            fy_row = cursor.fetchone()
            
            if cluster_row and fy_row:
                cursor.execute("""
                    INSERT INTO sales_reps (name, username, password_hash, role, cluster_id, fiscal_year_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, ("System Administrator", "sys", hash_password("sys"), "system_admin", cluster_row[0], fy_row[0]))
                print("  - Created sys admin (username: sys, password: sys)")
            else:
                print("  - ERROR: No cluster or fiscal year found to create sys admin")
        else:
            # Update existing sys admin
            cursor.execute("""
                UPDATE sales_reps SET password_hash = ?, role = ? WHERE username = 'sys'
            """, (hash_password("sys"), "system_admin"))
            print("  - Updated sys admin (username: sys, password: sys)")
        
        # 6. Set default passwords for all users
        print("\nSetting default passwords for sales reps...")
        default_hash = hash_password("user000")
        cursor.execute("""
            UPDATE sales_reps 
            SET password_hash = ?, role = COALESCE(role, 'user')
            WHERE username != 'sys' AND (password_hash IS NULL OR password_hash = '')
        """, (default_hash,))
        
        # Generate usernames for users without them
        cursor.execute("SELECT id, name FROM sales_reps WHERE username IS NULL OR username = ''")
        for row in cursor.fetchall():
            user_id, name = row
            username = name.lower().replace(' ', '_').replace('.', '')
            # Check for duplicates
            cursor.execute("SELECT id FROM sales_reps WHERE username = ?", (username,))
            if cursor.fetchone():
                username = f"{username}_{user_id}"
            cursor.execute("UPDATE sales_reps SET username = ? WHERE id = ?", (username, user_id))
            print(f"  - Generated username: {username}")
        
        conn.commit()
        
        # Summary
        print("\n--- Migration Summary ---")
        cursor.execute("SELECT COUNT(*) FROM regions")
        print(f"Regions: {cursor.fetchone()[0]}")
        cursor.execute("SELECT COUNT(*) FROM clusters")
        print(f"Clusters: {cursor.fetchone()[0]}")
        cursor.execute("SELECT COUNT(*) FROM sales_reps")
        print(f"Sales Reps: {cursor.fetchone()[0]}")
        cursor.execute("SELECT COUNT(*) FROM sales_reps WHERE username IS NOT NULL")
        print(f"Users with login: {cursor.fetchone()[0]}")
        
        print("\nMigration complete!")
        print("Sys Admin: sys / sys")
        print("Default password for users: user000")
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
