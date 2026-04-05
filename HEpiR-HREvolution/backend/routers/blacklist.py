"""Blacklist router — manage blacklisted jobs and profiles."""

import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import hrflow

router = APIRouter()


def load_blacklist() -> dict:
    return hrflow.load_blacklist()


def save_blacklist(blacklist: dict):
    with open(hrflow.BLACKLIST_FILE, "w") as f:
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
        # Clear cache because the lists (jobs or candidates) changed
        hrflow._clear_cache()
    
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
        # Clear cache because the lists changed
        hrflow._clear_cache()
    
    return {"ok": True, "blacklist": blacklist}
