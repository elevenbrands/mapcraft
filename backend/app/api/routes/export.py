"""
Export Minecraft structures to Bedrock format (.mcstructure / .mcpack)

Endpoints:
  GET /api/sessions/{id}/export/mcstructure  → binary .mcstructure NBT file
  GET /api/sessions/{id}/export/mcpack       → .mcpack behavior-pack ZIP
                                               (tap on tablet → imports into Minecraft)
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Tuple

import nbtlib
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.routes.payments import is_session_paid
from app.config import settings
from app.services.file_ops import get_file_service

router = APIRouter()

CODE_FNAME = "code.json"


def _storage_root() -> Path:
    return Path(settings.storage_path)


# Block version constant used in Bedrock .mcstructure palette entries.
# Value seen in structures exported from Minecraft Bedrock 1.19 / 1.20.
BEDROCK_BLOCK_VERSION = 17959425


# ---------------------------------------------------------------------------
# Core conversion helpers
# ---------------------------------------------------------------------------


def _expand_blocks(
    structure: Dict[str, Any],
) -> Dict[Tuple[int, int, int], Tuple[str, Dict[str, str]]]:
    """
    Expand bounding-box block entries into individual voxel positions.

    Returns dict: (x, y, z) → (block_name, properties).
    Later entries overwrite earlier ones (painter's algorithm — lets hollow
    shells be filled by inner fill blocks if the agent stacks them that way).
    """
    grid: Dict[Tuple[int, int, int], Tuple[str, Dict[str, str]]] = {}

    for entry in structure.get("blocks", []):
        sx, sy, sz = entry["start"]
        ex, ey, ez = entry["end"]
        block_type: str = entry["type"]
        properties: Dict[str, str] = entry.get("properties") or {}
        fill: bool = entry.get("fill", True)

        for y in range(sy, ey):
            for z in range(sz, ez):
                for x in range(sx, ex):
                    if fill:
                        grid[(x, y, z)] = (block_type, properties)
                    else:
                        # Hollow: only place on the outer shell
                        on_surface = (
                            x == sx
                            or x == ex - 1
                            or y == sy
                            or y == ey - 1
                            or z == sz
                            or z == ez - 1
                        )
                        if on_surface:
                            grid[(x, y, z)] = (block_type, properties)

    return grid


def _normalize_block_name(block_type: str) -> str:
    """Lowercase and ensure 'minecraft:' namespace prefix."""
    name = block_type.lower()
    if ":" not in name:
        name = f"minecraft:{name}"
    return name


def _to_bedrock_states(properties: Dict[str, str]) -> nbtlib.Compound:
    """
    Convert Java Edition block properties → Bedrock block states NBT.

    Bedrock uses byte (0/1) for booleans and int for numeric values;
    everything else stays as a string.
    """
    states: Dict[str, Any] = {}
    for key, value in properties.items():
        lower = value.lower()
        if lower in ("true", "false"):
            states[key] = nbtlib.Byte(1 if lower == "true" else 0)
        else:
            try:
                states[key] = nbtlib.Int(int(value))
            except ValueError:
                states[key] = nbtlib.String(value)
    return nbtlib.Compound(states)


# ---------------------------------------------------------------------------
# .mcstructure builder
# ---------------------------------------------------------------------------


def structure_to_mcstructure_bytes(structure: Dict[str, Any]) -> bytes:
    """
    Convert a MinecraftLM structure dict → Bedrock .mcstructure binary NBT.

    Input format::

        {
            "width": int, "height": int, "depth": int,
            "blocks": [
                {"start": [x,y,z], "end": [ex,ey,ez],
                 "type": "minecraft:stone",
                 "properties": {"facing": "south"},
                 "fill": true}
            ]
        }

    Output: little-endian NBT bytes (Bedrock .mcstructure format).
    """
    width = max(1, int(structure.get("width", 1)))
    height = max(1, int(structure.get("height", 1)))
    depth = max(1, int(structure.get("depth", 1)))

    grid = _expand_blocks(structure)

    # ---- Build palette -------------------------------------------------------
    # Air is always at index 0.
    # We use (name, sorted_props_json) as the dedup key.
    AIR_NAME = "minecraft:air"
    AIR_KEY: Tuple[str, str] = (AIR_NAME, "{}")

    palette_keys: List[Tuple[str, str]] = [AIR_KEY]
    palette_index: Dict[Tuple[str, str], int] = {AIR_KEY: 0}

    for _coords, (block_type, props) in grid.items():
        name = _normalize_block_name(block_type)
        props_json = json.dumps(props, sort_keys=True) if props else "{}"
        key: Tuple[str, str] = (name, props_json)
        if key not in palette_index:
            palette_index[key] = len(palette_keys)
            palette_keys.append(key)

    # ---- Build flat indices array --------------------------------------------
    # Iteration order: y (outermost) → z → x (innermost)
    # flat_index = y * (W * D) + z * W + x
    total = width * height * depth
    indices: List[int] = [0] * total  # default = air

    for (x, y, z), (block_type, props) in grid.items():
        if not (0 <= x < width and 0 <= y < height and 0 <= z < depth):
            continue  # skip blocks outside declared bounding box
        name = _normalize_block_name(block_type)
        props_json = json.dumps(props, sort_keys=True) if props else "{}"
        key = (name, props_json)
        flat = y * (width * depth) + z * width + x
        indices[flat] = palette_index.get(key, 0)

    # ---- Build NBT palette entries -------------------------------------------
    nbt_palette_entries: List[nbtlib.Compound] = []
    for name, props_json in palette_keys:
        props_dict: Dict[str, str] = json.loads(props_json)
        nbt_palette_entries.append(
            nbtlib.Compound(
                {
                    "name": nbtlib.String(name),
                    "states": _to_bedrock_states(props_dict),
                    "version": nbtlib.Int(BEDROCK_BLOCK_VERSION),
                }
            )
        )

    # ---- Assemble NBT tree ---------------------------------------------------
    nbt_layer0 = nbtlib.List[nbtlib.Int]([nbtlib.Int(i) for i in indices])
    nbt_layer1 = nbtlib.List[nbtlib.Int]([nbtlib.Int(-1)] * total)

    nbt_file = nbtlib.File(
        {
            "format_version": nbtlib.Int(1),
            "size": nbtlib.List[nbtlib.Int](
                [nbtlib.Int(width), nbtlib.Int(height), nbtlib.Int(depth)]
            ),
            "structure_world_origin": nbtlib.List[nbtlib.Int](
                [nbtlib.Int(0), nbtlib.Int(0), nbtlib.Int(0)]
            ),
            "structure": nbtlib.Compound(
                {
                    "block_indices": nbtlib.List[nbtlib.List](
                        [nbt_layer0, nbt_layer1]
                    ),
                    "entities": nbtlib.List[nbtlib.Compound]([]),
                    "palette": nbtlib.Compound(
                        {
                            "default": nbtlib.Compound(
                                {
                                    "block_position_data": nbtlib.List[
                                        nbtlib.Compound
                                    ]([]),
                                    "block_palette": nbtlib.List[nbtlib.Compound](
                                        nbt_palette_entries
                                    ),
                                }
                            )
                        }
                    ),
                }
            ),
        }
    )

    # Serialize as little-endian, uncompressed NBT (Bedrock format)
    buf = io.BytesIO()
    nbt_file.write(buf, byteorder="little")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# .mcpack builder (behavior pack ZIP — tap to import on tablet)
# ---------------------------------------------------------------------------


def structure_to_mcpack_bytes(
    structure: Dict[str, Any], world_name: str
) -> bytes:
    """
    Package a .mcstructure as a Bedrock .mcpack behavior-pack ZIP.

    On Android/iOS tablets:
      tap the file → Minecraft opens → "Pack imported!" notification
    Then in any world: /structure load generated 0 0 0
    """
    mcstructure_bytes = structure_to_mcstructure_bytes(structure)

    manifest = {
        "format_version": 2,
        "header": {
            "description": f"Generated by MinecraftLM: {world_name}",
            "name": world_name,
            "uuid": str(uuid.uuid4()),
            "version": [1, 0, 0],
            "min_engine_version": [1, 16, 0],
        },
        "modules": [
            {
                "description": "Structure data for MinecraftLM map",
                "type": "data",
                "uuid": str(uuid.uuid4()),
                "version": [1, 0, 0],
            }
        ],
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        # Minecraft looks for structures in structures/<namespace>/<name>.mcstructure
        # Using the "mystructures" namespace so in-game it's: mystructures:generated
        zf.writestr("structures/mystructures/generated.mcstructure", mcstructure_bytes)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Route helpers
# ---------------------------------------------------------------------------


async def _load_structure(session_id: str) -> Dict[str, Any]:
    """Read and return the structure JSON for a session or raise HTTP 404/500."""
    fs = get_file_service()
    code_path = _storage_root() / session_id / CODE_FNAME

    if not await fs.exists(code_path):
        raise HTTPException(
            status_code=404,
            detail=(
                f"No structure found for session '{session_id}'. "
                "Generate a structure first."
            ),
        )

    try:
        return await fs.read_json(code_path)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error reading structure: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@router.get("/sessions/{session_id}/export/mcstructure")
async def export_mcstructure(session_id: str):
    """
    Download the generated structure as a Bedrock **.mcstructure** file.

    Import it into Minecraft Bedrock by placing the file in:
    `games/com.mojang/structures/` on your device, then use a Structure
    Block or `/structure load generated` to place it in any world.
    """
    if not await is_session_paid(session_id):
        raise HTTPException(
            status_code=402,
            detail="Payment required to download this map.",
        )
    structure = await _load_structure(session_id)

    try:
        nbt_bytes = structure_to_mcstructure_bytes(structure)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error generating .mcstructure: {exc}"
        ) from exc

    filename = f"minecraftlm_{session_id[:8]}.mcstructure"
    return StreamingResponse(
        io.BytesIO(nbt_bytes),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(nbt_bytes)),
        },
    )


@router.get("/sessions/{session_id}/export/mcpack")
async def export_mcpack(
    session_id: str,
    name: str = Query(default="MinecraftLM Map", max_length=50),
):
    """
    Download the generated structure as a Bedrock **.mcpack** behavior pack.

    **Tablet instructions (Android / iOS):**
    1. Tap the downloaded file → Minecraft opens automatically.
    2. You'll see "Pack imported successfully!"
    3. Open any world → enable the behavior pack.
    4. In-game, run: `/structure load mystructures:generated 0 64 0`

    The structure will be placed at coordinates (0, 64, 0) in that world.
    """
    if not await is_session_paid(session_id):
        raise HTTPException(
            status_code=402,
            detail="Payment required to download this map.",
        )
    structure = await _load_structure(session_id)

    try:
        pack_bytes = structure_to_mcpack_bytes(structure, name)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Error generating .mcpack: {exc}"
        ) from exc

    safe_name = "".join(c for c in name if c.isalnum() or c in " _-").strip()[:30]
    filename = f"{safe_name or 'minecraftlm'}.mcpack"

    return StreamingResponse(
        io.BytesIO(pack_bytes),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pack_bytes)),
        },
    )
