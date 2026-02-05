"""용어 사전 기반 후처리 서비스

용어 교정 및 의원 이름 교정을 위한 서비스입니다.
"""

from dataclasses import dataclass, field
from typing import Literal


@dataclass
class DictionaryEntry:
    """사전 항목

    Attributes:
        wrong_text: 잘못된 텍스트 (교정 대상)
        correct_text: 올바른 텍스트 (교정 결과)
        category: 카테고리 (councilor: 의원 이름, term: 의회 용어, general: 일반)
    """

    wrong_text: str
    correct_text: str
    category: Literal["councilor", "term", "general"] | None = None


class DictionaryService:
    """사전 기반 텍스트 교정 서비스

    용어 사전을 기반으로 텍스트를 교정합니다.
    - wrong_text -> correct_text 변환
    - 의원 이름, 의회 용어 등 교정
    """

    def __init__(self, entries: list[DictionaryEntry] | None = None):
        """사전 서비스 초기화

        Args:
            entries: 초기 사전 항목 목록
        """
        self._entries: dict[str, DictionaryEntry] = {}
        if entries:
            for entry in entries:
                self._entries[entry.wrong_text] = entry

    def correct(self, text: str) -> str:
        """텍스트 교정

        사전에 등록된 잘못된 텍스트를 올바른 텍스트로 교정합니다.

        Args:
            text: 교정할 텍스트

        Returns:
            교정된 텍스트
        """
        if not text:
            return text

        result = text
        for wrong_text, entry in self._entries.items():
            result = result.replace(wrong_text, entry.correct_text)

        return result

    def add_entry(self, entry: DictionaryEntry) -> None:
        """사전 항목 추가

        Args:
            entry: 추가할 사전 항목
        """
        self._entries[entry.wrong_text] = entry

    def remove_entry(self, wrong_text: str) -> bool:
        """사전 항목 제거

        Args:
            wrong_text: 제거할 잘못된 텍스트

        Returns:
            제거 성공 여부
        """
        if wrong_text in self._entries:
            del self._entries[wrong_text]
            return True
        return False

    def get_entries(self) -> list[DictionaryEntry]:
        """모든 사전 항목 조회

        Returns:
            사전 항목 목록
        """
        return list(self._entries.values())

    def get_entries_by_category(
        self, category: Literal["councilor", "term", "general"]
    ) -> list[DictionaryEntry]:
        """카테고리별 사전 항목 조회

        Args:
            category: 조회할 카테고리

        Returns:
            해당 카테고리의 사전 항목 목록
        """
        return [
            entry for entry in self._entries.values() if entry.category == category
        ]

    def clear(self) -> None:
        """모든 사전 항목 제거"""
        self._entries.clear()

    def __len__(self) -> int:
        """사전 항목 개수"""
        return len(self._entries)
