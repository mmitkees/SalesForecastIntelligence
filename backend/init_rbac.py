#!/usr/bin/env python3
"""
Database Initialization Script for Region Hierarchy + RBAC.
Creates sys admin user and sets default passwords for all sales reps.
"""

import hashlib
from models import init_db, SessionLocal, SalesRep, Cluster, FiscalYear, Region


def hash_password(password):
    """Simple password hashing using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()


def main():
    print("Initializing database with Region + RBAC support...")
    
    # Initialize tables
    init_db()
    
    db = SessionLocal()
    
    try:
        # 1. Create default region if none exist
        if db.query(Region).count() == 0:
            default_region = Region(name="Default Region")
            db.add(default_region)
            db.commit()
            db.refresh(default_region)
            print(f"Created default region: {default_region.name} (ID: {default_region.id})")
            
            # Assign all existing clusters to this region
            clusters = db.query(Cluster).filter(Cluster.region_id == None).all()
            for cluster in clusters:
                cluster.region_id = default_region.id
            db.commit()
            print(f"Assigned {len(clusters)} clusters to default region")
        else:
            default_region = db.query(Region).first()
            print(f"Using existing region: {default_region.name}")
        
        # 2. Check if sys admin exists
        sys_admin = db.query(SalesRep).filter(SalesRep.username == 'sys').first()
        
        if not sys_admin:
            # Need a cluster and fiscal year for sys admin
            cluster = db.query(Cluster).first()
            fiscal_year = db.query(FiscalYear).first()
            
            if not cluster:
                cluster = Cluster(name="Admin Cluster", region_id=default_region.id)
                db.add(cluster)
                db.commit()
                db.refresh(cluster)
                print(f"Created admin cluster: {cluster.name}")
            
            if not fiscal_year:
                fiscal_year = FiscalYear(year=2026, start_date="2025-06-01", end_date="2026-05-31")
                db.add(fiscal_year)
                db.commit()
                db.refresh(fiscal_year)
                print(f"Created fiscal year: FY{fiscal_year.year}")
            
            # Create sys admin
            sys_admin = SalesRep(
                name="System Administrator",
                username="sys",
                password_hash=hash_password("sys"),
                role="system_admin",
                cluster_id=cluster.id,
                fiscal_year_id=fiscal_year.id
            )
            db.add(sys_admin)
            db.commit()
            print("Created sys admin user (username: sys, password: sys)")
        else:
            # Update existing sys admin password to 'sys'
            sys_admin.password_hash = hash_password("sys")
            sys_admin.role = "system_admin"
            db.commit()
            print("Updated sys admin user (username: sys, password: sys)")
        
        # 3. Set default password for all sales reps
        sales_reps = db.query(SalesRep).filter(SalesRep.username != 'sys').all()
        default_password_hash = hash_password("user000")
        updated_count = 0
        
        for rep in sales_reps:
            # Create username from name if not set
            if not rep.username:
                # Generate username from name (lowercase, no spaces)
                base_username = rep.name.lower().replace(' ', '_').replace('.', '')
                rep.username = base_username
            
            # Set default password
            if not rep.password_hash:
                rep.password_hash = default_password_hash
                updated_count += 1
            
            # Set default role
            if not rep.role or rep.role == '':
                rep.role = 'user'
        
        db.commit()
        print(f"Set default password 'user000' for {updated_count} sales reps")
        print(f"Total sales reps with auth: {len(sales_reps)}")
        
        print("\n--- Summary ---")
        print(f"Regions: {db.query(Region).count()}")
        print(f"Clusters: {db.query(Cluster).count()}")
        print(f"Sales Reps: {db.query(SalesRep).count()}")
        print(f"Sys Admin: sys / sys")
        print(f"Default password for users: user000")
        
    finally:
        db.close()
    
    print("\nDatabase initialization complete!")


if __name__ == "__main__":
    main()
