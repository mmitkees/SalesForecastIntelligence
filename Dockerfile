FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (libaio is required for Oracle)
RUN apt-get update && apt-get install -y libaio1 wget unzip && \
    rm -rf /var/lib/apt/lists/*

# Install Oracle Instant Client (Basic Lite)
WORKDIR /opt/oracle
RUN wget https://download.oracle.com/otn_software/linux/instantclient/2113000/instantclient-basiclite-linux.x64-21.13.0.0.0.zip && \
    unzip instantclient-basiclite-linux.x64-21.13.0.0.0.zip && \
    rm instantclient-basiclite-linux.x64-21.13.0.0.0.zip && \
    echo /opt/oracle/instantclient_21_13 > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 5000

# Set environment variable for database (overridden at runtime)
ENV DATABASE_URL=sqlite:///local.db

# Run the application
CMD ["python", "app.py"]
