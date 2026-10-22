# USDZ conversion toolchain

`gltf_to_usdz.py` is the Python half of `UsdzConversionService`
(`backend/src/tripo/usdz-conversion.service.ts`) — the Node side unpacks a
GLB into a self-contained glTF JSON via `gltf-pipeline`, then shells out to
this script to produce the `.usdz`. See that service's doc comment for the
full pipeline explanation and why this is hand-written instead of reusing
`kcoley/gltf2usd`.

This lives in the repo for version control, but **runs from a system-level
install, not from this checked-out path** — `UsdzConversionService` calls it
via `USDZ_PYTHON_BIN` / `USDZ_CONVERTER_SCRIPT` (both optional, defaulting to
the paths below).

## Server install (one-time, per host)

```bash
apt-get install -y python3-venv python3-pip
mkdir -p /opt/usdz-tools
python3 -m venv /opt/usdz-tools/venv
/opt/usdz-tools/venv/bin/pip install usd-core pillow numpy
cp backend/tools/usdz/gltf_to_usdz.py /opt/usdz-tools/gltf_to_usdz.py
```

Both the staging and production app servers need this — it's shared,
environment-independent tooling (no secrets, no per-env config), so one
install under `/opt/usdz-tools` serves every checkout on that host.

## Redeploying a change to this script

There's no automated sync yet — after editing `gltf_to_usdz.py` here, copy it
to `/opt/usdz-tools/gltf_to_usdz.py` on each server manually (or via
whatever deploy tooling picks this up later; nothing currently does).

## Local testing without the app

```bash
# Unpack a GLB to embedded glTF JSON first (e.g. via gltf-pipeline's CLI or
# the same glbToGltf call UsdzConversionService makes), then:
/opt/usdz-tools/venv/bin/python3 gltf_to_usdz.py --gltf model.gltf --output model.usdz
```
