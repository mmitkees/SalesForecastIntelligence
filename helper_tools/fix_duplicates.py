#!/usr/bin/env python3
"""
Script to remove duplicate entries from the local database.
This script identifies and removes duplicate sales reps and clusters.
"""

import sqlite3
import sys
from datetime import datetime

DB_PATH = 'sales_app_v3.db'

def backup_database():
    """Create a backup of the database before making changes."""
    import shutil
    timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    backup_path = f'db_backups/sales_app_v3_before_dedup_{timestamp}.db'
    shutil.copy(DB_PATH, backup_path)
    print(f"✓ Database backed up to: {backup_path}")
    return backup_path

def remove_duplicate_sales_reps(conn):
    """Remove duplicate sales reps, keeping the first occurrence."""
    cursor = conn.cursor()
    
    # Find duplicates (same name and cluster_id)
    cursor.execute("""
        SELECT name, cluster_id, GROUP_CONCAT(id) as ids, COUNT(*) as count
        FROM sales_reps
        WHERE cluster_id IS NOT NULL
        GROUP BY name, cluster_id
        HAVING count > 1
    """)
    
    duplicates = cursor.fetchall()
    
    if not duplicates:
        print("✓ No duplicate sales reps found")
        return 0
    
    total_removed = 0
    print(f"\nFound {len(duplicates)} sets of duplicate sales reps:")
    
    for name, cluster_id, ids_str, count in duplicates:
        ids = [int(id) for id in ids_str.split(',')]
        # Keep the first ID, delete the rest
        keep_id = ids[0]
        delete_ids = ids[1:]
        
        print(f"  - '{name}' in cluster {cluster_id}: keeping ID {keep_id}, removing IDs {delete_ids}")
        
        # First, delete associated workloads
        for delete_id in delete_ids:
            cursor.execute("DELETE FROM workloads WHERE sales_rep_id = ?", (delete_id,))
            workloads_deleted = cursor.rowcount
            if workloads_deleted > 0:
                print(f"    → Deleted {workloads_deleted} workloads for sales rep ID {delete_id}")
        
        # Then delete the sales rep
        cursor.execute("DELETE FROM sales_reps WHERE id IN ({})".format(','.join('?' * len(delete_ids))), delete_ids)
        total_removed += len(delete_ids)
    
    conn.commit()
    print(f"\n✓ Removed {total_removed} duplicate sales rep entries")
    return total_removed

def remove_duplicate_cluster_raees(conn):
    """Remove the 'Raees' cluster duplicate, keeping 'Sudheesh'."""
    cursor = conn.cursor()
    
    # Check if both clusters exist
    cursor.execute("SELECT id, name FROM clusters")
    clusters = cursor.fetchall()
    
    print(f"\nFound {len(clusters)} clusters:")
    for id, name in clusters:
        print(f"  - ID {id}: {name}")
    
    # Find the Raees cluster (ID 2)
    cursor.execute("SELECT id FROM clusters WHERE name = 'Raees'")
    raees_cluster = cursor.fetchone()
    
    if not raees_cluster:
        print("✓ No 'Raees' cluster found to remove")
        return 0
    
    raees_id = raees_cluster[0]
    
    # Delete sales reps associated with Raees cluster
    cursor.execute("SELECT COUNT(*) FROM sales_reps WHERE cluster_id = ?", (raees_id,))
    sales_reps_count = cursor.fetchone()[0]
    
    if sales_reps_count > 0:
        # First delete workloads for these sales reps
        cursor.execute("""
            DELETE FROM workloads 
            WHERE sales_rep_id IN (SELECT id FROM sales_reps WHERE cluster_id = ?)
        """, (raees_id,))
        workloads_deleted = cursor.rowcount
        print(f"  → Deleted {workloads_deleted} workloads for Raees cluster sales reps")
        
        # Then delete the sales reps
        cursor.execute("DELETE FROM sales_reps WHERE cluster_id = ?", (raees_id,))
        print(f"  → Deleted {sales_reps_count} sales reps from Raees cluster")
    
    # Finally, delete the Raees cluster
    cursor.execute("DELETE FROM clusters WHERE id = ?", (raees_id,))
    print(f"✓ Removed 'Raees' cluster (ID {raees_id})")
    
    conn.commit()
    return 1

def verify_cleanup(conn):
    """Verify that all duplicates have been removed."""
    cursor = conn.cursor()
    
    print("\n" + "="*60)
    print("VERIFICATION")
    print("="*60)
    
    # Check for duplicate sales reps
    cursor.execute("""
        SELECT name, cluster_id, COUNT(*) as count
        FROM sales_reps
        WHERE cluster_id IS NOT NULL
        GROUP BY name, cluster_id
        HAVING count > 1
    """)
    
    duplicates = cursor.fetchall()
    if duplicates:
        print("❌ WARNING: Duplicate sales reps still exist:")
        for name, cluster_id, count in duplicates:
            print(f"  - '{name}' in cluster {cluster_id}: {count} entries")
    else:
        print("✓ No duplicate sales reps")
    
    # Show final counts
    cursor.execute("SELECT COUNT(*) FROM clusters")
    cluster_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM sales_reps")
    sales_rep_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM workloads")
    workload_count = cursor.fetchone()[0]
    
    print(f"\nFinal database state:")
    print(f"  - Clusters: {cluster_count}")
    print(f"  - Sales Reps: {sales_rep_count}")
    print(f"  - Workloads: {workload_count}")
    
    # Show clusters
    cursor.execute("SELECT id, name FROM clusters")
    clusters = cursor.fetchall()
    print(f"\nRemaining clusters:")
    for id, name in clusters:
        cursor.execute("SELECT COUNT(*) FROM sales_reps WHERE cluster_id = ?", (id,))
        rep_count = cursor.fetchone()[0]
        print(f"  - ID {id}: {name} ({rep_count} sales reps)")

def main():
    """Main function to orchestrate the duplicate removal process."""
    print("="*60)
    print("DATABASE DUPLICATE REMOVAL SCRIPT")
    print("="*60)
    
    # Backup the database
    backup_path = backup_database()
    
    # Connect to the database
    conn = sqlite3.connect(DB_PATH)
    
    try:
        # Remove duplicate sales reps
        removed_reps = remove_duplicate_sales_reps(conn)
        
        # Remove the Raees cluster duplicate
        removed_clusters = remove_duplicate_cluster_raees(conn)
        
        # Verify the cleanup
        verify_cleanup(conn)
        
        print("\n" + "="*60)
        print("✓ CLEANUP COMPLETED SUCCESSFULLY")
        print("="*60)
        print(f"Backup saved at: {backup_path}")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print("Rolling back changes...")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
