# Hugging Face Spaces, Docker SDK.
FROM python:3.11-slim

# OpenCV needs these even in the headless build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Spaces runs the container as uid 1000 and only $HOME is writable. Without
# this, huggingface_hub cannot write its model cache and the Space dies on
# first request with a permission error that reads like a network failure.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1

WORKDIR $HOME/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY --chown=user . .

# Spaces routes to 7860.
EXPOSE 7860

# One worker deliberately: the ONNX session is per-process and ~90 MB of
# weights, and check-in traffic is a handful of requests per round. Two workers
# would double memory to serve a queue that is never deep.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
