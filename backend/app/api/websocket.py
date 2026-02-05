"""WebSocket 실시간 자막 스트리밍"""

import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """WebSocket 연결 관리자

    방(meeting_id)별로 WebSocket 연결을 관리하고
    자막 브로드캐스트 기능을 제공합니다.
    """

    def __init__(self) -> None:
        """ConnectionManager 초기화"""
        # meeting_id -> list[WebSocket] 매핑
        self.active_connections: dict[uuid.UUID, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, meeting_id: uuid.UUID) -> None:
        """WebSocket 연결을 방에 추가

        Args:
            websocket: 연결할 WebSocket 인스턴스
            meeting_id: 입장할 방(회의) ID
        """
        # 실제 WebSocket인 경우에만 accept 호출
        if hasattr(websocket, "accept") and callable(websocket.accept):
            # MagicMock이 아닌 실제 WebSocket인 경우
            try:
                await websocket.accept()
            except Exception:
                # 이미 accept된 경우 무시
                pass

        # 방이 없으면 생성
        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = []

        # 연결 추가
        self.active_connections[meeting_id].append(websocket)

    def disconnect(self, websocket: WebSocket, meeting_id: uuid.UUID) -> None:
        """WebSocket 연결을 방에서 제거

        Args:
            websocket: 제거할 WebSocket 인스턴스
            meeting_id: 퇴장할 방(회의) ID
        """
        if meeting_id in self.active_connections:
            if websocket in self.active_connections[meeting_id]:
                self.active_connections[meeting_id].remove(websocket)

            # 방이 비었으면 정리
            if not self.active_connections[meeting_id]:
                del self.active_connections[meeting_id]

    async def broadcast_subtitle(
        self, meeting_id: uuid.UUID, subtitle_data: dict[str, Any]
    ) -> None:
        """자막을 해당 방의 모든 클라이언트에 브로드캐스트

        Args:
            meeting_id: 대상 방(회의) ID
            subtitle_data: 자막 데이터 (SubtitleResponse 형식)
        """
        message = {
            "type": "subtitle_created",
            "payload": subtitle_data,
        }

        if meeting_id in self.active_connections:
            # 연결이 끊긴 클라이언트를 추적
            disconnected = []

            for websocket in self.active_connections[meeting_id]:
                try:
                    await websocket.send_json(message)
                except Exception:
                    # 전송 실패 시 연결 끊김으로 처리
                    disconnected.append(websocket)

            # 끊긴 연결 정리
            for websocket in disconnected:
                self.disconnect(websocket, meeting_id)


# 전역 ConnectionManager 인스턴스
manager = ConnectionManager()


@router.websocket("/ws/meetings/{meeting_id}/subtitles")
async def websocket_subtitle_endpoint(
    websocket: WebSocket, meeting_id: uuid.UUID
) -> None:
    """실시간 자막 WebSocket 엔드포인트

    Args:
        websocket: WebSocket 연결
        meeting_id: 회의 ID

    Events:
        subtitle_created: 새 자막 생성 시 브로드캐스트
    """
    await manager.connect(websocket, meeting_id)
    try:
        while True:
            # 클라이언트로부터 메시지 수신 대기
            # 현재는 서버 -> 클라이언트 단방향 브로드캐스트만 지원
            # 클라이언트가 연결을 유지하기 위해 ping/pong 처리
            data = await websocket.receive_text()
            # 클라이언트 메시지는 현재 무시 (연결 유지용)
    except WebSocketDisconnect:
        manager.disconnect(websocket, meeting_id)
