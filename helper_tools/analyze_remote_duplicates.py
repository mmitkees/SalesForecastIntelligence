#!/usr/bin/env python3
"""
Analyze duplicate sales_rep entries in the remote database.
Finds duplicates by name and shows what data exists in each.
"""
import sqlite3
from collections import defaultdict
import os

# Connect to production database
DB_PATH = os.path.expanduser('~/sales-app/sales_app_v3.db')

print(f"Connecting to database: {DB_PATH}")
if not os.path.exists(DB_PATH):
    print(f"❌ ERROR: Database file not found at {DB_PATH}")
    exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Find all sales reps grouped by name
cursor.execute("""
    SELECT 
        id, name, username, password_hash, role, 
        cluster_id, region_id, fiscal_year_id,
        last_year_exit, q1_exit, q2_exit, q3_exit, q4_exit,
        q1_add_fct, q2_add_fct, q3_add_fct, q4_add_fct,
        current_daily_rate, last_week_daily_rate,
        jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec
    FROM sales_reps
    ORDER BY name, id
""")

rows = cursor.fetchall()

# Group by name
by_name = defaultdict(list)
for row in rows:
    by_name[row['name']].append(dict(row))

# Find duplicates
duplicates = {name: reps for name, reps in by_name.items() if len(reps) > 1}

if not duplicates:
    print("✅ No duplicates found!")
else:
    print(f"🚨 Found {len(duplicates)} names with duplicate entries:\n")
    
    for name, reps in duplicates.items():
        print(f"{'='*80}")
        print(f"Name: {name} - {len(reps)} entries")
        print(f"{'='*80}")
        
        for i, rep in enumerate(reps, 1):
            print(f"\n--- Entry {i} (ID: {rep['id']}) ---")
            print(f"  Username: {rep['username'] or 'NULL'}")
            print(f"  Password Hash: {'SET' if rep['password_hash'] else 'NULL'}")
            print(f"  Role: {rep['role'] or 'NULL'}")
            print(f"  Cluster ID: {rep['cluster_id'] or 'NULL'}")
            print(f"  Region ID: {rep['region_id'] or 'NULL'}")
            print(f"  Fiscal Year ID: {rep['fiscal_year_id'] or 'NULL'}")
            
            # Check for data
            has_data = False
            data_fields = []
            
            if rep['last_year_exit'] and rep['last_year_exit'] != 0:
                has_data = True
                data_fields.append(f"Last Year Exit: ${rep['last_year_exit']:,.0f}")
            
            for q in ['q1', 'q2', 'q3', 'q4']:
                if rep[f'{q}_exit'] and rep[f'{q}_exit'] != 0:
                    has_data = True
                    data_fields.append(f"{q.upper()} Exit: ${rep[f'{q}_exit']:,.0f}")
            
            for month in ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']:
                if rep[month] and rep[month] != 0:
                    has_data = True
                    data_fields.append(f"{month.capitalize()}: ${rep[month]:,.0f}")
            
            if rep['current_daily_rate'] and rep['current_daily_rate'] != 0:
                has_data = True
                data_fields.append(f"Current Daily Rate: ${rep['current_daily_rate']:,.0f}")
            
            if has_data:
                print(f"  📊 HAS DATA:")
                for field in data_fields[:5]:  # Show first 5 data fields
                    print(f"    - {field}")
                if len(data_fields) > 5:
                    print(f"    ... and {len(data_fields) - 5} more fields")
            else:
                print(f"  ⚠️  NO FINANCIAL DATA")
        
        print()

# Count total duplicates
total_duplicate_rows = sum(len(reps) - 1 for reps in duplicates.values())
print(f"\n📊 Summary:")
print(f"  - Total sales reps: {len(rows)}")
print(f"  - Unique names: {len(by_name)}")
print(f"  - Names with duplicates: {len(duplicates)}")
print(f"  - Extra rows to merge: {total_duplicate_rows}")

conn.close()
