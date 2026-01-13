ORACLE WALLET CONFIGURATION
===========================

This directory (`/wallet`) is the designated location for your Oracle Autonomous Database credentials.

INSTRUCTIONS:
1.  Download the "Client Credentials (Wallet)" zip file from your OCI Console (Database Details page -> "DB Connection" -> "Download Wallet").
2.  Unzip the contents of that file DIRECTLY into this folder.
3.  Ensure the following files are present here:
    - cwallet.sso
    - ewallet.p12
    - sqlnet.ora
    - tnsnames.ora
    - keystore.jks (optional)
    - truststore.jks (optional)

USAGE:
When deploying, set the TNS_ADMIN environment variable to the absolute path of this directory.
Example:
    export TNS_ADMIN="/Users/mmitkees/Library/CloudStorage/OneDrive-OracleCorporation/SalesAPP/wallet"
    export DATABASE_URL="oracle+cx_oracle://USER:PASSWORD@db_high"
