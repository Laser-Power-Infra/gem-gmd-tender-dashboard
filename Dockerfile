FROM python:3.10-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=6001

# Set working directory
WORKDIR /app

# Install system dependencies needed for Python packages & Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright headless Chromium & system browser dependencies
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy application files
COPY . .

# Expose port 6001
EXPOSE 6001

# Command to run Flask app
CMD ["python", "app.py"]
