# ShelfScout Backend (FastAPI)

This is a production-style backend wrapper around the `Z_model_infer.ipynb` inference pipeline.

## Project structure

```
shelfscout_backend/
  app/
    api/main.py          # FastAPI app + routes
    core/config.py       # env-driven settings
    ml/model.py          # model definition (ResNet+FPN+heads)
    ml/postprocess.py    # center decoding + masks + empty ratio
    ml/inference.py      # preprocessing + predict_from_bytes()
  checkpoints/           # put shelfscout_latest.pth here (or set MODEL_PATH)
  requirements.txt
  Dockerfile
```

## 1) Put your checkpoint in place

Expected checkpoint format:
- file path: `checkpoints/shelfscout_latest.pth` (default), or set `MODEL_PATH`
- checkpoint keys: `{"model_state": <state_dict>}`

## 2) Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Install torch/torchvision per your setup:
# https://pytorch.org/get-started/locally/

export MODEL_PATH=checkpoints/shelfscout_latest.pth
uvicorn app.api.main:app --reload --port 8000  #If this does not work (Makesure y=Uuvicorn is added to your system path, So Powershell can find it.)
```

Health check:
- `GET /health`

Inference:
- `POST /predict` (multipart form-data with `file=@image.jpg`)
- Optional query: `include_masks=true` to return base64 PNG masks.

## 3) Docker

```bash
docker build -t shelfscout-api .
docker run --rm -p 8000:8000 -e MODEL_PATH=checkpoints/shelfscout_latest.pth shelfscout-api
```

For GPU deployment, use an NVIDIA CUDA base image + `--gpus all` and a CUDA-enabled torch build.
