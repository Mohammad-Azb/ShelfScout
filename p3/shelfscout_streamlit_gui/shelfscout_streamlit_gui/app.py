import base64
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests
import streamlit as st

# =========================
# Theme (your palette)
# =========================
PALETTE = {
    "orange": "#FFA239",
    "cream": "#FCF9EA",
    "sage":  "#A8BBA3",
    "olive": "#97A87A",
}


def inject_css() -> None:
    st.markdown(
        f"""
<style>
/* Layout */
.block-container {{
  padding-top: 1.2rem;
  padding-bottom: 2.2rem;
  max-width: 1100px;
}}
/* Neon-ish background (subtle) */
.stApp {{
  background:
    radial-gradient(900px 700px at 20% -10%, rgba(255,162,57,.18), transparent 60%),
    radial-gradient(800px 550px at 95% 10%, rgba(168,187,163,.14), transparent 60%),
    radial-gradient(900px 650px at 45% 95%, rgba(151,168,122,.10), transparent 65%),
    #0b1220;
}}
/* Cards */
.ss-card {{
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 18px;
  padding: 14px 14px;
  background: linear-gradient(180deg, rgba(255,255,255,.04), transparent 55%), rgba(17,26,46,.95);
  box-shadow: 0 12px 34px rgba(0,0,0,.35), 0 0 0 1px rgba(255,162,57,.18), 0 18px 70px rgba(255,162,57,.10);
}}
.ss-sub {{
  opacity: .75;
  font-size: 0.92rem;
}}
.ss-badge {{
  display:inline-flex; align-items:center; gap:.4rem;
  border-radius: 999px;
  padding: 6px 10px;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.04);
  font-weight: 700;
  font-size: 0.86rem;
}}
.ss-badge.ok {{ background: rgba(34,197,94,.14); border-color: rgba(34,197,94,.25); }}
.ss-badge.warn {{ background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.25); }}
.ss-badge.bad {{ background: rgba(251,113,133,.12); border-color: rgba(251,113,133,.25); }}

/* Buttons polish */
.stButton > button {{
  border-radius: 14px !important;
  font-weight: 800 !important;
}}
/* Primary button glow */
.stButton > button[kind="primary"] {{
  background: linear-gradient(180deg, {PALETTE["orange"]}, rgba(255,162,57,.85)) !important;
  color: #111 !important;
  border: 1px solid rgba(255,162,57,.65) !important;
  box-shadow: 0 16px 60px rgba(255,162,57,.22);
}}
/* Inputs */
.stTextInput input, .stNumberInput input {{
  border-radius: 14px !important;
}}
/* Tabs */
.stTabs [data-baseweb="tab"] {{
  font-weight: 800;
}}
</style>
""",
        unsafe_allow_html=True,
    )


@dataclass
class PredictResult:
    payload: Dict[str, Any]
    elapsed_ms: int


def b64_to_data_url_png(b64: str) -> str:
    return f"data:image/png;base64,{b64}"


def call_health(base_url: str, timeout_s: int = 10) -> Tuple[bool, str]:
    url = base_url.rstrip("/") + "/health"
    try:
        r = requests.get(url, timeout=timeout_s)
        if r.status_code != 200:
            return False, f"Health failed (HTTP {r.status_code})"
        return True, "Server connected"
    except requests.RequestException as e:
        return False, f"Server not reachable ({e.__class__.__name__})"


def call_predict(base_url: str, file_bytes: bytes, filename: str, mime_type: str, include_masks: bool, timeout_s: int = 60) -> PredictResult:
    url = base_url.rstrip("/") + "/predict"
    t0 = time.perf_counter()
    mime_type = (mime_type or "image/jpeg").strip() or "image/jpeg"
    files = {"file": (filename or "image.jpg", file_bytes, mime_type)}
    params = {"include_masks": "true" if include_masks else "false"}
    r = requests.post(url, files=files, params=params, timeout=timeout_s)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    try:
        data = r.json()
    except Exception:
        data = {"detail": r.text[:5000]}

    if r.status_code != 200:
        detail = data.get("detail") if isinstance(data, dict) else None
        msg = f"Predict failed (HTTP {r.status_code})"
        if detail:
            msg += f": {detail}"
        raise RuntimeError(msg)

    if not isinstance(data, dict):
        raise RuntimeError("Predict returned non-JSON object")

    return PredictResult(payload=data, elapsed_ms=elapsed_ms)


def classification_badge(empty_ratio: float, threshold_pct: float) -> Tuple[str, str]:
    pct = max(0.0, min(100.0, float(empty_ratio) * 100.0))
    if pct >= threshold_pct:
        return "Needs restock", "bad"
    if pct >= max(5.0, threshold_pct * 0.6):
        return "Mixed stock", "warn"
    return "Well stocked", "ok"


def main() -> None:
    st.set_page_config(page_title="ShelfScout • CNN Analyzer", page_icon="🧠", layout="wide")
    inject_css()

    st.markdown(
        """<div class="ss-card">
  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap">
    <div style="display:flex; align-items:center; gap:12px">
      <div style="width:12px;height:40px;border-radius:999px;background:linear-gradient(180deg,#FFA239,rgba(255,162,57,.18));
                  box-shadow:0 0 0 1px rgba(255,162,57,.35),0 10px 25px rgba(255,162,57,.18);"></div>
      <div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
          <div style="font-size:1.1rem; font-weight:900; letter-spacing:.2px">ShelfScout</div>
          <div class="ss-badge">Server: <span style="opacity:.85">not checked</span></div>
        </div>
        <div class="ss-sub">CNN App → Input Image → Analyze → Results</div>
      </div>
    </div>
  </div>
</div>""",
        unsafe_allow_html=True,
    )

    with st.sidebar:
        st.markdown("### Test Health")
        st.caption("Check that the server is reachable")

        base_url = st.text_input(
            "API Base URL",
            value=st.session_state.get("base_url", "http://localhost:8000"),
            placeholder="http://localhost:8000",
        )
        st.session_state["base_url"] = base_url

        include_masks = st.toggle("Include masks", value=st.session_state.get("include_masks", True))
        st.session_state["include_masks"] = include_masks

        threshold_pct = st.slider("Empty threshold (%)", 0, 100, int(st.session_state.get("threshold_pct", 35)))
        st.session_state["threshold_pct"] = threshold_pct

        c1, c2 = st.columns(2)
        with c1:
            if st.button("Test /health", use_container_width=True):
                ok, msg = call_health(base_url)
                st.session_state["health_ok"] = ok
                st.session_state["health_msg"] = msg
        with c2:
            if st.button("Clear results", use_container_width=True):
                st.session_state.pop("result", None)
                st.toast("Cleared")

        ok = st.session_state.get("health_ok")
        msg = st.session_state.get("health_msg", "Not checked")
        if ok is True:
            st.success(msg)
        elif ok is False:
            st.error(msg)
        else:
            st.info(msg)

    left, right = st.columns([0.48, 0.52], gap="large")

    with left:
        st.markdown("## Input")
        st.caption("Choose a shelf image (JPG / PNG / WEBP).")

        uploaded = st.file_uploader("Upload image", type=["jpg", "jpeg", "png", "webp"])

        error = ""
        if uploaded is None:
            error = "Please upload an image to start."
        elif uploaded.size > 12 * 1024 * 1024:
            error = "Image is too large (> 12MB). Try a smaller one."

        if error:
            st.warning(error)
        else:
            st.success("Image looks good")

        run = st.button("Analyze", type="primary", use_container_width=True, disabled=bool(error))

        st.markdown("### Preview")
        if uploaded is not None:
            st.image(uploaded, use_container_width=True)
        else:
            st.info("Your image preview will appear here.")

        if run and uploaded is not None and not error:
            base_url = st.session_state["base_url"]
            include_masks = st.session_state["include_masks"]

            progress = st.progress(0, text="Starting…")
            with st.spinner("Processing…"):
                try:
                    progress.progress(25, text="Uploading…")
                    time.sleep(0.08)
                    progress.progress(55, text="Running model…")
                    mime_type = getattr(uploaded, "type", None) or ""
                    result = call_predict(base_url, uploaded.getvalue(), uploaded.name, mime_type, include_masks)
                    progress.progress(85, text="Preparing results…")
                    time.sleep(0.08)
                    st.session_state["result"] = result
                    progress.progress(100, text="Done")
                    st.toast("Analysis complete")
                except Exception as e:
                    progress.empty()
                    st.error(str(e))
                    st.stop()

    with right:
        st.markdown("## Results")

        result: Optional[PredictResult] = st.session_state.get("result")
        if not result:
            st.info("Run analysis to see results here.")
            return

        payload = result.payload
        empty_ratio = float(payload.get("empty_ratio") or 0.0)
        label, kind = classification_badge(empty_ratio, float(st.session_state.get("threshold_pct", 35)))

        st.markdown(
            f'<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px">'
            f'<span class="ss-badge {kind}">{label}</span>'
            f'<span class="ss-badge">⏱ {result.elapsed_ms} ms</span>'
            f'</div>',
            unsafe_allow_html=True,
        )

        tab_summary, tab_more, tab_media = st.tabs(["Summary", "More information", "Overlays & masks"])

        with tab_summary:
            c1, c2 = st.columns(2)
            with c1:
                st.metric("Empty ratio", f"{empty_ratio*100:.1f}%")
                st.metric("Decoded centers", payload.get("decoded_centers", "—"))
            with c2:
                st.metric("Instances", payload.get("predicted_instances", "—"))
                st.metric("Shelf region", "Found" if payload.get("shelf_bbox") else "—")

        with tab_more:
            cols = st.columns(2)
            with cols[0]:
                if "product_pixels" in payload:
                    st.metric("Product pixels", payload.get("product_pixels"))
                if "empty_pixels" in payload:
                    st.metric("Empty pixels", payload.get("empty_pixels"))
            with cols[1]:
                if payload.get("image_size"):
                    st.metric("Model input", f'{payload.get("image_size")}×{payload.get("image_size")}')
                fm = payload.get("feature_map_size")
                if fm:
                    if isinstance(fm, list):
                        fm = "×".join(map(str, fm))
                    st.metric("Feature map", fm)

            with st.expander("Raw JSON (optional)", expanded=False):
                st.code(json.dumps(payload, indent=2), language="json")

        with tab_media:
            masks = payload.get("masks") or {}
            centers_b64 = masks.get("decoded_centers_overlay_png_b64")

            mcol1, mcol2 = st.columns(2)
            with mcol1:
                st.markdown("### Decoded centers overlay")
                if centers_b64:
                    st.image(b64_to_data_url_png(centers_b64), use_container_width=True)
                else:
                    st.info("No centers overlay returned. Enable “Include masks” then run again.")
            with mcol2:
                st.markdown("### Masks")
                mask_choice = st.radio("Select mask", ["product", "empty", "background"], horizontal=True)
                key_map = {
                    "product": "product_mask_png_b64",
                    "empty": "empty_mask_png_b64",
                    "background": "background_mask_png_b64",
                }
                b64 = masks.get(key_map[mask_choice])
                if b64:
                    st.image(b64_to_data_url_png(b64), use_container_width=True)
                else:
                    st.info("Mask not available. Enable “Include masks” then run again.")

        st.markdown("### Actions")

        report = {
            "app": "ShelfScout",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "summary": {
                "empty_ratio": payload.get("empty_ratio"),
                "decoded_centers": payload.get("decoded_centers"),
                "predicted_instances": payload.get("predicted_instances"),
                "shelf_bbox": payload.get("shelf_bbox"),
            },
            "more_information": {
                "product_pixels": payload.get("product_pixels"),
                "empty_pixels": payload.get("empty_pixels"),
                "image_size": payload.get("image_size"),
                "feature_map_size": payload.get("feature_map_size"),
            },
            "ui": {
                "include_masks": st.session_state.get("include_masks", True),
                "threshold_pct": st.session_state.get("threshold_pct", 35),
            },
        }

        centers_b64 = (payload.get("masks") or {}).get("decoded_centers_overlay_png_b64")

        a1, a2 = st.columns(2)
        with a1:
            st.download_button(
                "Download report (JSON)",
                data=json.dumps(report, indent=2),
                file_name="shelfscout_report.json",
                mime="application/json",
                use_container_width=True,
            )
        with a2:
            if centers_b64:
                st.download_button(
                    "Download centers overlay (PNG)",
                    data=base64.b64decode(centers_b64),
                    file_name="decoded_centers_overlay.png",
                    mime="image/png",
                    use_container_width=True,
                )
            else:
                st.button("Download centers overlay (PNG)", disabled=True, use_container_width=True)


if __name__ == "__main__":
    main()
