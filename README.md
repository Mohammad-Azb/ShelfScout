# 🛒 ShelfScout — CNN Shelf Analysis (Backend + GUIs)

ShelfScout is a computer vision project that analyzes retail shelf images using a CNN-based model.  
It detects products, estimates empty shelf space, and returns clear quantitative results such as **empty ratio**, **decoded centers**, and **predicted instances**, along with optional visual overlays.

---

## Repository Contents

This repository contains **model training, inference, and GUI components**:

- `model&data_V1.0Final_cleaned.ipynb`  
  Dataset handling, preprocessing, training pipeline, and first working inference functions.

- `Z_model_inference.ipynb`  
  Final inference notebook prepared for GUI integration.

- `p3/`  
  Folder containing all GUI-related components (backend + frontend + optional Streamlit GUI).

---

## Project Overview

ShelfScout formulates shelf analysis as a **dense prediction problem** instead of traditional object detection.

The model predicts:
- Semantic product regions
- Object centers
- Pixel-to-center offsets

From these predictions, the system:
- Counts individual products
- Estimates empty shelf ratio
- Generates optional visualization masks and overlays

---

## Dataset & Preprocessing

- Images: RGB shelf images
- Annotations: CSV files containing bounding box coordinates

During preprocessing:
- Bounding boxes are converted into dense supervision targets
- Targets are aligned to a feature-map stride
- The model learns semantic masks, center heatmaps, and offset vectors

All dataset handling and target generation are implemented in  
`model&data_V1.0Final_cleaned.ipynb`.

---

## Model Training

Training includes:
- Fully convolutional CNN architecture
- Anchor-free center-based supervision
- Multi-task loss (semantic, center, offset)

The full training pipeline and experiments are documented in the training notebook.

---

## Inference Pipeline

The inference process:
1. Runs the trained CNN
2. Decodes object centers
3. Reconstructs instances using offset vectors
4. Computes shelf occupancy statistics

The finalized inference workflow is provided in:
- `Z_model_inference.ipynb`

This notebook is designed to be **directly callable by a GUI**.

---

# ShelfScout — CNN Shelf Analysis (Backend + GUIs)

ShelfScout is a computer-vision project that analyzes shelf images using a CNN model and returns an easy-to-read summary (e.g., **empty ratio**, **decoded centers**, and **detected instances**) plus optional visual outputs (decoded-centers overlay and segmentation masks).

This repository contains:
- **FastAPI backend** (`shelfscout_backend/`) for model inference
- **Web frontend** (`shelfscout_frontend/`) (static HTML/CSS/JS, no npm)
- **Streamlit GUI** (optional, runs from Python and avoids browser CORS)

---

## GUI Structure

```text
p3/
├─ shelfscout_backend/
│  ├─ app/                  # FastAPI app + inference code
│  ├─ checkpoints/          # model weights/checkpoints
│  ├─ tests/
│  ├─ requirements.txt
│  ├─ README.md
│  └─ Dockerfile
├─ shelfscout_frontend/
│  ├─ index.html
│  ├─ css/
│  ├─ js/
│  └─ README.md
└─ (optional) shelfscout_streamlit_gui/
   ├─ app.py
   ├─ requirements.txt
   └─ run_streamlit.bat
