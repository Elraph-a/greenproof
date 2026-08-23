# One container, no vendor lock-in. Runs on Cloud Run, Render, a Hugging Face
# Space, or a laptop. Nothing in here is specific to a host.
FROM python:3.11-slim

# OpenCV needs these even in the headless build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Run as uid 1000 with a writable $HOME. Hugging Face Spaces requires exactly
# this, and without a writable HOME huggingface_hub cannot write its model
# cache and the container dies on first request with a permission error that
# reads like a network failure.
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

# BAKE THE MODEL INTO THE IMAGE. This is the difference between a live demo and
# ninety seconds of dead air on stage.
#
# Cloud Run scales to zero, so the first request after idle starts a cold
# container. If the weights are not already present, that request also waits on
# a ~90 MB download from Hugging Face before it can score anything. Downloading
# at BUILD time moves that cost to a machine nobody is watching, and cold start
# becomes container boot plus ONNX session init.
#
# It also removes a runtime dependency on huggingface.co being reachable and
# not rate-limiting, which is not a thing to discover during a pitch.
#
# Costs ~90 MB of image size. Artifact Registry's free tier is 0.5 GB, so this
# may tip storage into a few cents a month. Worth it.
RUN python -c "from greenproof_ml.embed import _model_path; print('baked:', _model_path())"

EXPOSE 7860

# One worker deliberately: the ONNX session is per-process and ~90 MB of
# weights, and check-in traffic is a handful of requests per round. Two workers
# would double memory to serve a queue that is never deep.
#
# SHELL FORM, so ${PORT} is expanded at runtime. Every container host injects
# the port it wants on a different variable-or-default convention, and the
# exec form ["uvicorn", ...] would pass the literal string "${PORT}" and the
# container would die on boot with an unreadable error. 7860 is the fallback.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1
