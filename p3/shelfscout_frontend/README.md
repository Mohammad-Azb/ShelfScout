# ShelfScout Professional Frontend (Offline / No CDN / No npm)

This version has **no external dependencies** (no Bootstrap CDN). It should work even without internet.

Backend:
- GET  /health
- POST /predict?include_masks=true|false  (multipart field "file")

## Run UI
From this folder:
```bash
python -m http.server 5500
```
Open:
- http://localhost:5500/index.html

## Run backend
```bash
uvicorn app.api.main:app --reload --port 8000
```

## If requests fail (CORS)
Best: serve UI from backend:
```python
from fastapi.staticfiles import StaticFiles
app.mount("/ui", StaticFiles(directory="ui", html=True), name="ui")
```
Put these files in `ui/` and open:
- http://localhost:8000/ui/index.html
