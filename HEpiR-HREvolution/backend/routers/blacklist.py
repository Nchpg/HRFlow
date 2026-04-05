"""Blacklist router — manage blacklisted jobs and profiles."""

import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

BLACKLIST_FILE = "blacklist.json"


def load_blacklist() -> dict:
    if not os.path.exists(BLACKLIST_FILE):
        return {"jobs": [], "profiles": []}
    try:
        with open(BLACKLIST_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"jobs": [], "profiles": []}


def save_blacklist(blacklist: dict):
    with open(BLACKLIST_FILE, "w") as f:
        json.dump(blacklist, f, indent=2)


class BlacklistPayload(BaseModel):
    key: str


@router.get("")
async def get_blacklist():
    """Return the current blacklist."""
    return load_blacklist()


@router.post("/{type}")
async def add_to_blacklist(type: str, payload: BlacklistPayload):
    """Add a key to the blacklist (jobs or profiles)."""
    if type not in ["jobs", "profiles"]:
        raise HTTPException(status_code=400, detail="Type must be 'jobs' or 'profiles'")
    
    blacklist = load_blacklist()
    if payload.key not in blacklist[type]:
        blacklist[type].append(payload.key)
        save_blacklist(blacklist)
    
    return {"ok": True, "blacklist": blacklist}


@router.delete("/{type}/{key}")
async def remove_from_blacklist(type: str, key: str):
    """Remove a key from the blacklist."""
    if type not in ["jobs", "profiles"]:
        raise HTTPException(status_code=400, detail="Type must be 'jobs' or 'profiles'")
    
    blacklist = load_blacklist()
    if key in blacklist[type]:
        blacklist[type].remove(key)
        save_blacklist(blacklist)
    
    return {"ok": True, "blacklist": blacklist}
