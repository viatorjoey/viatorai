# 구축·검증 결과

확인일: 2026-10-16 (미 동부 시간)

## 실행 주소와 현재 상태

- Windows 데스크톱: http://localhost:8787
- Tailscale 비공개 HTTPS: https://studio.example.invalid/
- 앱은 별도 Node.js 서버로 실행 중. 기존 Docker/n8n/ComfyUI는 재시작하거나 재설정하지 않음.
- 이후 사용자가 Tailscale 설치·로그인·계정의 Serve 활성화를 완료함. Tailscale 1.104.1 Running 확인 후, 이 앱의 127.0.0.1:8787만 443 HTTPS로 연결함. 기존 Serve 경로는 없었으며 Funnel은 구성하지 않음.
- 실제 HTTPS에서 페이지·manifest·서비스워커·아이콘 HTTP 200, 익명 API HTTP 401 확인. 연결번호 인증과 Secure/HttpOnly/SameSite=Strict 쿠키, 인증된 API, 영상 HTTP 206 범위 요청을 통과함. 연결번호와 쿠키는 로그·검증 파일에 출력하지 않음.
- iPhone 실기기·집 밖 네트워크·홈 화면 설치는 아직 검증하지 못함. PWA manifest, 서비스워커, 192/512 아이콘은 제공·응답 확인.

## 실제 생성 검증

| 기능 | 결과 | 증거 |
|---|---|---|
| 글 → 이미지 | 성공 | FLUX.2 Klein PNG, 288×512, 164,767바이트 |
| 사진 → 설명 | 성공 | 위 풍경 사진을 Qwen 3.5 9B로 분석, 한국어 설명+영어 프롬프트 1,163자 |
| 글 → 영상 | 성공 | 2초, 288×512, H.264 MP4, 110,603바이트 |
| 사진 → 영상 | 성공 | 2초, 288×512, H.264 MP4, 110,294바이트 |

- 글→이미지 job `44470ebd-0ec3-4bb3-b0b5-872eaab6fa92`, n8n 소유자 `1033`, ComfyUI prompt `b2594d68-39fc-446e-8497-19a5d961c63d`.
- 사진→설명 job `3e9429ce-83ff-4ec8-8220-ceff6c5e8f74`, n8n `1036`.
- 글→영상 job `71f23154-9220-4522-9391-9364340f6275`, n8n 소유자 `1038`, ComfyUI prompt `df2c9b21-157b-40fd-97b4-6fa1175fe7f5`.
- 사진→영상 job `e19b39bc-29fb-4969-a322-7705b9cd1e6b`, n8n `1046`, ComfyUI prompt `4ce4ffb9-a40f-42db-95f7-38ec9d3c4bc2`.
- 모든 테스트는 정확한 prompt의 완료 성공 → 저장 파일 검증 → VRAM 정리 확인 → 자기 소유 잠금 해제까지 완료.
- MP4의 moov/mvhd/tkhd와 avc1 표식을 읽어 실제 길이·해상도·형식을 확인. 두 영상은 브라우저에서 duration=2, 288×512, readyState=4, 오류 없음. 사진→영상은 실제 재생 후 currentTime=2, ended=true 확인.
- 다운로드 크기와 `Range: bytes=0-31`의 HTTP 206·32바이트 응답 확인.
- 테스트 도중 사용자가 추가한 별도 고화질 이미지 요청도 대기열을 거쳐 완료됨. 이 보고서의 네 가지 테스트와는 별도 요청이며 삭제·취소하지 않음.

## 발견·수정한 문제

1. n8n CLI가 Data Table 모듈을 초기화하지 않음: 설치 코드를 수정하지 않고, 모바일 전용 CLI 프로세스에서만 해당 모듈을 초기화하는 별도 preload 파일로 해결.
2. ComfyUI `/free` 성공 시 빈 본문: JSON을 강제로 읽던 처리를 수정. 이미 저장된 첫 이미지는 재생성하지 않고 원래 소유권·파일 체크섬을 확인해 정리·잠금 해제함.
3. 영상 모델 초기화 중 이력 조회 시간 초과: 제출 ID와 잠금을 보존하고 원래 prompt의 조회를 재개함. 이후 조회 일시 장애는 동일 ID로 제한 시간 안에서 계속 확인하도록 수정. 영상은 재제출하지 않음.
4. 주기적 화면 갱신이 영상 플레이어를 다시 만드는 문제: 완료 목록이 바뀌지 않으면 플레이어를 유지하도록 수정하고 실제 재생 종료 확인.
5. 통신 오류 뒤 재시도 중복 접수 방지: 동일 입력의 미확인 요청 ID를 세션에 보존. API에서도 동일 ID 중복 제출은 기존 작업을 반환함.

첫 영상은 첫 모델 초기화와 후처리로 상당한 시간이 걸렸음. 짧은 영상도 즉시 완료되는 서비스로 안내하지 않음. 모든 길이·화질 조합이나 장시간 부하를 검증한 것은 아님.

## 보존·보안·정리

- 기존 워크플로우 26개의 수정 시각·활성 상태 변경 없음.
- 활성 A `62K6BJYPjscOdoCz`, B `ezWnajluvcVbz7PM`은 최종 nodes/connections/settings 전체를 최초 조회와 비교하여 동일함을 확인. 둘 다 계속 활성.
- 신규 워크플로우 `OUEvnzeelRd84Sr8`(작업)과 `2Fn3if59BIQZyrVf`(기존 작업 재확인)는 비활성. CLI로만 호출하며 스케줄/웹훅을 추가하지 않음.
- 기존 GPU Data Table의 조건부 획득과 소유자 조건 해제를 재사용. 실제 작업이 순차 진행됨을 확인.
- 익명 API 요청 401, 다른 출처의 변경 요청 403, 결과 경로 탈출 요청 404 확인.
- 앱 8787, 내부 브리지 8788, ComfyUI 8188, Ollama 11434 모두 127.0.0.1 바인딩. 기존 n8n Docker 포트도 127.0.0.1:5678 유지.
- 최종 ComfyUI 실행/대기 큐 0/0, Ollama 로드 모델 0. GPU 사용 2,908MiB, 여유 13,138MiB / 전체 16,376MiB. 드라이버/화면 메모리는 남아 있으므로 모든 VRAM이 해제됐다고 주장하지 않음.
- 로컬 안전성 검사 10개 통과. 인증·출처·경로·PWA 파일·결과 바이트·부분 다운로드 실제 HTTP 검사 통과.

상세 실행 자료는 `data/generation-test-results.json`, `data/live-test-results.json`, SQLite 작업 기록에 있음. 이 폴더는 사진·세션이 포함되므로 git에서 제외함.

## 남은 사용자 조작

1. iPhone Tailscale을 같은 계정으로 연결.
2. Safari에서 https://studio.example.invalid/ 열기.
3. Windows http://localhost:8787/ 의 연결 설정에 표시되는 번호를 iPhone에 입력.
4. Safari 공유 → 홈 화면에 추가. 집 밖 네트워크에서 생성·재생 테스트.

원격 검증 기록: `data/remote-test-results.json`. 위 테스트는 데스크톱에서 실제 HTTPS 경로를 통해 수행했으며 iPhone 실기기·이동통신망 검증을 대체하지 않음.

원격 방식 근거: [Tailscale Serve 공식 문서](https://tailscale.com/docs/reference/tailscale-cli/serve). Serve는 tailnet 내부 HTTPS 프록시 용도로 사용하며 Funnel이나 관리 포트 공개는 구성하지 않음.
