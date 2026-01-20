FROM python:3.12-slim-bookworm

WORKDIR /app

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget unzip && \
    rm -rf /var/lib/apt/lists/*


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
# Run the application
CMD ["python", "backend/app.py"]
