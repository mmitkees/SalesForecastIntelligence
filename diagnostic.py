
from backend.models import SessionLocal, SalesRep, Cluster
import sys

db = SessionLocal()
rep = db.query(SalesRep).filter(SalesRep.id == 7).first()
if not rep:
    print("Rep 7 not found")
    sys.exit(1)

print(f"Rep: {rep.name}")
print(f"Simulations: Q1={rep.q1_simulation}, Q2={rep.q2_simulation}, Q3={rep.q3_simulation}, Q4={rep.q4_simulation}")
print(f"Legacy Sim: {rep.simulation}")

print("\nUpdating Q3 Simulation to 999...")
rep.q3_simulation = 999.0
db.commit()

# Refresh from DB
db.expire_all()
rep = db.query(SalesRep).filter(SalesRep.id == 7).first()
print(f"After update - Q3 Sim: {rep.q3_simulation}")

if rep.q3_simulation == 999.0:
    print("\nSUCCESS: Database persistence is working for new columns.")
else:
    print("\nFAILURE: Database persistence is NOT working for new columns.")
db.close()
