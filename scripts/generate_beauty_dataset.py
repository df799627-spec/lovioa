#!/usr/bin/env python3
"""
Batch-generate beauty-photo test data with prompt-image alignment.

Outputs:
- public/test-generated/<run_id>/*.png
- data/<run_id>_manifest.json
- data/<run_id>_manifest.csv
- data/<run_id>_prompts.json

Usage example:
  python3 scripts/generate_beauty_dataset.py --count 40 --concurrency 4 --quality medium
"""

import argparse
import base64
import csv
import json
import os
import random
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


SCENES = [
    "地铁站出口", "咖啡店窗边", "城市天台", "雨后街头", "书店角落", "美术馆走廊",
    "海边栈道", "樱花公园", "办公楼大厅", "复古电车站", "夜市街口", "大学校园林荫道",
]

LIGHTING = [
    "清晨柔和日光", "午后侧逆光", "阴天漫反射光", "傍晚金色日落光", "霓虹夜景混合光", "窗边自然光",
]

OUTFITS = [
    "米色针织上衣", "浅蓝衬衫", "白色连衣裙", "黑色皮夹克", "灰色风衣", "简约运动套装", "奶油色西装",
]

MOODS = [
    "自然松弛", "清新治愈", "都市高级", "电影感", "轻熟优雅", "活力元气"]

NEGATIVE_DEFAULT = "低清晰度,过度磨皮,塑料皮肤,畸形手指,多余手臂,面部扭曲,文字,水印,logo,过曝,失焦"


def build_prompts(count: int):
    random.seed(20260519)
    prompts = []
    for i in range(1, count + 1):
        sid = f"b{i:04d}"
        scene = random.choice(SCENES)
        light = random.choice(LIGHTING)
        outfit = random.choice(OUTFITS)
        mood = random.choice(MOODS)

        prompt = (
            f"亚洲女生人像，场景在{scene}，{light}，穿着{outfit}，"
            f"表情{mood}，真实皮肤纹理，背景轻微虚化，构图干净，"
            "社交媒体高质量美照风格，摄影质感自然。"
        )

        tags = [scene, light, outfit, mood]
        category = "Portrait" if i % 5 else "Editorial"

        prompts.append({
            "id": sid,
            "title": f"测试样图 {sid}",
            "prompt": prompt,
            "negativePrompt": NEGATIVE_DEFAULT,
            "category": category,
            "tags": tags,
        })
    return prompts


def post_json(base_url: str, api_key: str, payload: dict, timeout: int):
    base = base_url.rstrip("/")
    if not base.lower().endswith("/v1"):
        base += "/v1"
    req = urllib.request.Request(
        base + "/images/generations",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode("utf-8", "ignore")


def generate_one(item, cfg, output_dir: Path):
    merged_prompt = f"{item['prompt']}\n避免：{item['negativePrompt']}"
    payload = {
        "model": cfg["model"],
        "prompt": merged_prompt,
        "size": cfg["size"],
        "quality": cfg["quality"],
    }

    attempts = 0
    last_err = ""
    while attempts < cfg["retries"]:
        attempts += 1
        t0 = time.time()
        try:
            status, body = post_json(cfg["base_url"], cfg["api_key"], payload, cfg["timeout"])
            data = json.loads(body)
            b64 = data.get("data", [{}])[0].get("b64_json")
            if not b64:
                raise RuntimeError(f"missing b64_json; status={status}")

            img_bytes = base64.b64decode(b64)
            img_name = f"{item['id']}.png"
            img_path = output_dir / img_name
            img_path.write_bytes(img_bytes)

            elapsed = round(time.time() - t0, 2)
            row = {
                **item,
                "status": "ok",
                "model": cfg["model"],
                "size": cfg["size"],
                "quality": cfg["quality"],
                "attempts": attempts,
                "elapsedSec": elapsed,
                "imageFile": img_name,
                "imagePath": str(img_path),
                "imageUrl": f"/{output_dir.relative_to(cfg['project_root']).as_posix()}/{img_name}",
                "error": "",
                "createdAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            return row
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8", "ignore")[:300]
            except Exception:
                detail = ""
            last_err = f"HTTP {e.code} {detail}"
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"

        time.sleep(min(1.5 * attempts, 5))

    return {
        **item,
        "status": "failed",
        "model": cfg["model"],
        "size": cfg["size"],
        "quality": cfg["quality"],
        "attempts": attempts,
        "elapsedSec": None,
        "imageFile": "",
        "imagePath": "",
        "imageUrl": "",
        "error": last_err,
        "createdAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def write_manifest_json(path: Path, records):
    path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def write_manifest_csv(path: Path, records):
    if not records:
        return
    keys = [
        "id", "title", "status", "category", "tags", "prompt", "negativePrompt",
        "model", "size", "quality", "attempts", "elapsedSec", "imageFile", "imageUrl", "error", "createdAt"
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in records:
            out = dict(r)
            out["tags"] = ",".join(r.get("tags", []))
            w.writerow({k: out.get(k, "") for k in keys})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=20, help="number of prompts/images")
    ap.add_argument("--concurrency", type=int, default=3, help="parallel requests")
    ap.add_argument("--model", default=os.getenv("VITE_OPENAI_IMAGE_MODEL", "gpt-image-2"))
    ap.add_argument("--size", default=os.getenv("VITE_OPENAI_IMAGE_SIZE", "1024x1024"))
    ap.add_argument("--quality", default="medium", choices=["low", "medium", "high", "auto"])
    ap.add_argument("--timeout", type=int, default=180)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--base-url", default=os.getenv("OPENAI_API_BASE_URL", "https://api.openai.com"))
    ap.add_argument("--api-key", default=os.getenv("OPENAI_API_KEY", ""))
    ap.add_argument("--run-id", default="")
    args = ap.parse_args()

    if not args.api_key:
        raise SystemExit("Missing API key. Set OPENAI_API_KEY in env or pass --api-key")

    project_root = Path(__file__).resolve().parents[1]
    run_id = args.run_id or time.strftime("beauty_%Y%m%d_%H%M%S")

    output_dir = project_root / "public" / "test-generated" / run_id
    data_dir = project_root / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    prompts = build_prompts(args.count)
    prompts_path = data_dir / f"{run_id}_prompts.json"
    prompts_path.write_text(json.dumps(prompts, ensure_ascii=False, indent=2), encoding="utf-8")

    cfg = {
        "base_url": args.base_url,
        "api_key": args.api_key,
        "model": args.model,
        "size": args.size,
        "quality": args.quality,
        "timeout": args.timeout,
        "retries": args.retries,
        "project_root": project_root,
    }

    lock = threading.Lock()
    done = 0
    total = len(prompts)
    records = []
    t_start = time.time()

    print(f"run_id={run_id} count={args.count} concurrency={args.concurrency} model={args.model} size={args.size} quality={args.quality}")

    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as ex:
        futures = {ex.submit(generate_one, item, cfg, output_dir): item for item in prompts}
        for fut in as_completed(futures):
            row = fut.result()
            with lock:
                records.append(row)
                done += 1
                status = row["status"]
                msg = row.get("error", "")
                print(f"[{done}/{total}] {row['id']} {status} attempts={row['attempts']} elapsed={row['elapsedSec']} {msg}")

    records.sort(key=lambda x: x["id"])

    manifest_json = data_dir / f"{run_id}_manifest.json"
    manifest_csv = data_dir / f"{run_id}_manifest.csv"
    write_manifest_json(manifest_json, records)
    write_manifest_csv(manifest_csv, records)

    ok = sum(1 for r in records if r["status"] == "ok")
    fail = total - ok
    sec = round(time.time() - t_start, 2)

    summary = {
        "runId": run_id,
        "count": total,
        "ok": ok,
        "failed": fail,
        "elapsedSec": sec,
        "outputDir": str(output_dir),
        "promptsFile": str(prompts_path),
        "manifestJson": str(manifest_json),
        "manifestCsv": str(manifest_csv),
    }
    (data_dir / f"{run_id}_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print("SUMMARY", json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
