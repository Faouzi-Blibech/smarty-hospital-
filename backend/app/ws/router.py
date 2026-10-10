import asyncio

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.auth.deps import nurse_scope, user_from_token
from app.db import get_db
from app.ws.hub import Client, hub

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = "", db: Session = Depends(get_db)):
    user = user_from_token(db, token)
    if user is None:
        await websocket.close(code=4401)
        return
    if user.role == "patient":  # api.md: patients do not connect
        await websocket.close(code=4403)
        return
    ward, supervisor = nurse_scope(db, user) if user.role in ("nurse", "doctor") else (None, None)
    client = Client(ws=websocket, user_id=user.id, role=user.role, ward=ward, supervisor_id=supervisor)
    db.commit()  # end the read transaction so the socket doesn't hold a DB connection
    await websocket.accept()
    hub.loop = asyncio.get_running_loop()
    hub.clients.add(client)
    try:
        while True:
            msg = await websocket.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        hub.clients.discard(client)
