"""Meeting Pydantic 스키마"""

from datetime import date, datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MeetingStatus(str, Enum):
    """회의 상태 enum"""

    SCHEDULED = "scheduled"
    LIVE = "live"
    PROCESSING = "processing"
    ENDED = "ended"


class MeetingBase(BaseModel):
    """회의 기본 스키마"""

    title: str = Field(..., max_length=255, description="회의 제목")
    meeting_date: date = Field(..., description="회의 날짜")
    stream_url: Optional[str] = Field(None, description="실시간 스트림 URL")
    vod_url: Optional[str] = Field(None, description="VOD URL")
    status: MeetingStatus = Field(
        default=MeetingStatus.SCHEDULED, description="회의 상태"
    )
    duration_seconds: Optional[int] = Field(None, description="총 재생 시간 (초)")


class MeetingCreate(MeetingBase):
    """회의 생성 요청 스키마"""

    pass


class MeetingUpdate(BaseModel):
    """회의 수정 요청 스키마"""

    title: Optional[str] = Field(None, max_length=255, description="회의 제목")
    meeting_date: Optional[date] = Field(None, description="회의 날짜")
    stream_url: Optional[str] = Field(None, description="실시간 스트림 URL")
    vod_url: Optional[str] = Field(None, description="VOD URL")
    status: Optional[MeetingStatus] = Field(None, description="회의 상태")
    duration_seconds: Optional[int] = Field(None, description="총 재생 시간 (초)")


class MeetingResponse(MeetingBase):
    """회의 응답 스키마"""

    id: UUID = Field(..., description="고유 식별자")
    created_at: datetime = Field(..., description="생성 시각")
    updated_at: datetime = Field(..., description="수정 시각")

    model_config = {"from_attributes": True}


class MeetingListResponse(BaseModel):
    """회의 목록 응답 스키마"""

    items: list[MeetingResponse]
    total: int
    limit: int
    offset: int
