# VIATOR AI Studio · Directing Room

2026-10-20 기준 스튜디오와 디렉팅룸의 소스·워크플로·테스트·문서 백업입니다. 원본 실행 폴더와 서비스를 변경하지 않고 별도 복사본을 만들었습니다.

| 경로 | 내용 |
|---|---|
| `mobile-studio/` | Windows 로컬 스튜디오, 웹 UI, 생성·편집·음성·에셋 관리, 테스트와 운영 문서 |
| `sites/viator-agent-meeting/` | 디렉팅룸 React/TypeScript 소스, 서버 API, DB 스키마·마이그레이션, 프레임워크 코드, 테스트 |
| `workflows/n8n/` | 현재 n8n 인스턴스에서 읽은 워크플로 28개. 인증정보·실행 데이터를 제거하고 모두 비활성으로 저장 |
| `workflows/index.json` | 워크플로 이름, ID, 원본 활성 여부와 백업 경로 |
| `drafts/`, `deployed/`, `backups/*.json`, `artifacts/workflow-*.json` | 이전 워크플로 수정본·기준본. 인증 연결을 제거한 비활성 사본 |
| `tests/` | 워크플로 순차 실행·GPU 잠금·정리 로직 검증 코드와 모의 fixture |
| `sites/*.cjs`, `sites/*.mjs`, `artifacts/*.mjs` | 변경·검증 보조 스크립트 |
| `docs/` | 복원 안내, 파일별 체크섬과 백업 검증 결과 |

API 키, 쿠키, 토큰, DPAPI 파일, SQLite/D1 데이터, 대화·작업 이력, 업로드·생성 결과, 결제 화면, 모델 가중치, 의존성 디렉터리, 빌드 산출물은 포함하지 않았습니다. 테스트용 가짜 인증 문자열과 합성 미디어는 실제 자격 증명이나 사용자 결과물이 아닙니다.

복원은 [docs/RESTORE.ko.md](docs/RESTORE.ko.md), 공개 백업 정책은 [SECURITY.md](SECURITY.md)를 참고하세요. 하위 폴더의 기존 변경 보고서는 당시 기록이므로 현재 설정과 다른 부분이 있을 수 있습니다. 이 저장소를 clone하는 것만으로 배포·자동 실행·유료 API 호출을 수행하지 않습니다.
