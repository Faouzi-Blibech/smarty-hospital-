"""WebSocket fan-out (api.md → WebSocket). A nurse gets frames for their ward, a doctor for their own
patients, an admin only `device_status`. `scope` routes the frame and is stripped before sending."""

import asyncio
import logging
from dataclasses import dataclass, field

log = logging.getLogger("ward.ws")


@dataclass(eq=False)
class Client:
    ws: object
    user_id: str
    role: str
    ward: str | None
    supervisor_id: str | None = None


def wants(c: Client, frame: dict) -> bool:
    scope = frame.get("scope") or {}
    if c.role == "admin":
        return frame.get("type") == "device_status"
    if c.role == "nurse":
        return (c.ward is not None and scope.get("ward") == c.ward) or (
            c.supervisor_id is not None and scope.get("doctor_id") == c.supervisor_id)
    if c.role == "doctor":
        return scope.get("doctor_id") == c.user_id or c.user_id in (scope.get("shared_with") or ())
    return False


@dataclass
class Hub:
    clients: set[Client] = field(default_factory=set)
    loop: asyncio.AbstractEventLoop | None = None

    async def _send(self, frame: dict) -> None:
        out = {k: v for k, v in frame.items() if k != "scope"}
        for c in [c for c in self.clients if wants(c, frame)]:
            try:
                await c.ws.send_json(out)
            except Exception:  # a dead socket must not stop the others
                self.clients.discard(c)

    def broadcast(self, frame: dict) -> None:
        """Safe from any thread (the MQTT relay runs on paho's network thread)."""
        loop = self.loop
        if loop is None or loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            loop.create_task(self._send(frame))
        else:
            asyncio.run_coroutine_threadsafe(self._send(frame), loop)


hub = Hub()
