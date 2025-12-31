# NOTE: For GPU, use an NVIDIA CUDA base image and install torch accordingly.
FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV / PIL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY checkpoints ./checkpoints

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
