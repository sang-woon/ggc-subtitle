"""Subtitles API 테스트 - TDD"""

import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app


class TestGetSubtitles:
    """GET /api/meetings/{meeting_id}/subtitles 테스트"""

    def test_get_subtitles_returns_200(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막 목록 조회 시 200 응답을 반환한다"""
        response = client.get(f"/api/meetings/{meeting_id}/subtitles")
        assert response.status_code == 200

    def test_get_subtitles_returns_list(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막 목록 조회 시 리스트를 반환한다"""
        response = client.get(f"/api/meetings/{meeting_id}/subtitles")
        data = response.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_get_subtitles_with_pagination(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막 목록 조회 시 페이지네이션 파라미터를 지원한다"""
        response = client.get(
            f"/api/meetings/{meeting_id}/subtitles?limit=10&offset=0"
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "limit" in data
        assert "offset" in data

    def test_get_subtitles_with_data(
        self, client_with_mock_db: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막이 있을 경우 올바른 구조의 데이터를 반환한다"""
        response = client_with_mock_db.get(
            f"/api/meetings/{meeting_id}/subtitles"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

        # 항목 구조 검증
        item = data["items"][0]
        assert "id" in item
        assert "meeting_id" in item
        assert "start_time" in item
        assert "end_time" in item
        assert "text" in item
        assert "speaker" in item
        assert "confidence" in item
        assert "created_at" in item

    def test_get_subtitles_empty_list(
        self, client_with_empty_db: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막이 없을 경우 빈 리스트를 반환한다"""
        response = client_with_empty_db.get(
            f"/api/meetings/{meeting_id}/subtitles"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_get_subtitles_invalid_meeting_id_returns_422(
        self, client: TestClient
    ) -> None:
        """잘못된 형식의 meeting_id는 422 에러를 반환한다"""
        response = client.get("/api/meetings/invalid-uuid/subtitles")
        assert response.status_code == 422


class TestSearchSubtitles:
    """GET /api/meetings/{meeting_id}/subtitles/search 테스트"""

    def test_search_subtitles_returns_200(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막 검색 시 200 응답을 반환한다"""
        response = client.get(
            f"/api/meetings/{meeting_id}/subtitles/search?q=test"
        )
        assert response.status_code == 200

    def test_search_subtitles_requires_query_param(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """검색어 파라미터(q)가 없으면 422 에러를 반환한다"""
        response = client.get(f"/api/meetings/{meeting_id}/subtitles/search")
        assert response.status_code == 422

    def test_search_subtitles_returns_list(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막 검색 시 리스트를 반환한다"""
        response = client.get(
            f"/api/meetings/{meeting_id}/subtitles/search?q=test"
        )
        data = response.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_search_subtitles_with_data(
        self, client_with_mock_db: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """검색 결과가 있을 경우 올바른 구조의 데이터를 반환한다"""
        response = client_with_mock_db.get(
            f"/api/meetings/{meeting_id}/subtitles/search?q=키워드"
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

        # 항목이 있으면 구조 검증
        if data["items"]:
            item = data["items"][0]
            assert "id" in item
            assert "meeting_id" in item
            assert "start_time" in item
            assert "end_time" in item
            assert "text" in item

    def test_search_subtitles_empty_query_returns_422(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """빈 검색어는 422 에러를 반환한다"""
        response = client.get(
            f"/api/meetings/{meeting_id}/subtitles/search?q="
        )
        assert response.status_code == 422

    def test_search_subtitles_invalid_meeting_id_returns_422(
        self, client: TestClient
    ) -> None:
        """잘못된 형식의 meeting_id는 422 에러를 반환한다"""
        response = client.get(
            "/api/meetings/invalid-uuid/subtitles/search?q=test"
        )
        assert response.status_code == 422

    def test_search_subtitles_with_pagination(
        self, client: TestClient, meeting_id: uuid.UUID
    ) -> None:
        """자막 검색 시 페이지네이션 파라미터를 지원한다"""
        response = client.get(
            f"/api/meetings/{meeting_id}/subtitles/search?q=test&limit=5&offset=0"
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "limit" in data
        assert data["limit"] == 5
        assert "offset" in data
        assert data["offset"] == 0
