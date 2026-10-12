"""In-process LIFEGRID realtime event hub.

The WebSocket transport gives local/single-instance deployments immediate
updates. Supabase Realtime can remain enabled for multi-instance production.
No emergency data is stored here; clients always refresh the authoritative
snapshot from the database/API after receiving an event.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, emergency_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[emergency_id].add(websocket)

    async def disconnect(self, emergency_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._connections.get(emergency_id)
            if not connections:
                return
            connections.discard(websocket)
            if not connections:
                self._connections.pop(emergency_id, None)

    async def register(self, emergency_id: int, websocket: WebSocket) -> None:
        self._loop = asyncio.get_running_loop()
        async with self._lock:
            self._connections[emergency_id].add(websocket)

    async def broadcast(self, emergency_id: int, payload: dict[str, Any]) -> None:
        async with self._lock:
            connections = list(self._connections.get(emergency_id, set()))

        if not connections:
            return

        dead: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)

        for websocket in dead:
            await self.disconnect(emergency_id, websocket)


realtime_manager = ConnectionManager()


def broadcast_event(emergency_id: int | None, event: str = "changed") -> None:
    """Schedule a realtime notification without blocking a DB request."""
    if emergency_id is None:
        return

    payload = {
        "type": "update",
        "event": event,
        "emergency_id": int(emergency_id),
    }

    loop = realtime_manager._loop

    if loop is not None and loop.is_running():
        asyncio.run_coroutine_threadsafe(
            realtime_manager.broadcast(int(emergency_id), payload),
            loop,
        )
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            realtime_manager.broadcast(int(emergency_id), payload)
        )
    except RuntimeError:
        return
