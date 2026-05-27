FROM python:3.11-slim

WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy configuration files and dependencies
COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create volume checkpoints directory
RUN mkdir -p /workspace/data

EXPOSE 8000

CMD ["python", "examples/research-video-assistant/run_assistant.py"]
