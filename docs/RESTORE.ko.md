# 복원·검증 안내

## 스튜디오

1. Node.js 22 이상과 Windows PowerShell을 준비하고 `mobile-studio`에서 `npm ci`를 실행합니다.
2. 로컬 생성에는 별도로 ComfyUI, 해당 모델, Ollama, Docker/n8n이 필요합니다. 모델과 사용자 결과물은 백업에 없습니다.
3. Python 편집·렌더링에는 Pillow, PyAV(`av`), NumPy 등이 필요합니다. 원본의 Python 설치 경로는 머신별 설정이므로 본인 환경에 맞게 조정하거나 서버의 `STUDIO_VIDEO_PYTHON`을 설정하세요. 일부 기존 테스트와 시작 스크립트에도 원본 PC 경로가 남아 있습니다.
4. API 키와 디렉팅룸 연결 인증은 앱의 설정 또는 보호된 환경 설정으로 다시 연결하세요. Windows DPAPI 키 파일은 포함하지 않았으며 다른 계정으로 복사해 재사용하지 않습니다.
5. `README.ko.md`, `AUTOSTART_RECOVERY.ko.md`, `STUDIO-WORKFLOW.md`를 읽고 포트와 작업자 구성을 확인한 뒤 시작하세요. 자동 시작·서비스 설치 스크립트는 검토 후 명시적으로 실행하세요.

## 디렉팅룸

1. `sites/viator-agent-meeting`에서 `npm ci`를 실행합니다. `scripts/`, `build/`, `vendor/`, `drizzle/`도 함께 복원해야 합니다.
2. `.openai/hosting.json`은 비밀이 없는 바인딩 설명입니다. 실제 Sites 프로젝트·D1/R2 리소스와 배포 인증을 새 환경에 연결하세요. 기존 프로젝트 배포 설정과 실제 DB 데이터는 포함하지 않았습니다.
3. 각 공급자의 API 키·서비스 인증은 서버 비밀 저장소에 설정합니다. SQLite/D1 마이그레이션은 대상 DB와 기존 데이터 상태를 확인한 뒤 적용하세요.
4. `npm run dev` 또는 환경에 맞는 Sites 배포 절차를 사용합니다. 소비자 구독 세션과 API 인증은 별개입니다.

## n8n

`workflows/index.json`이 현재 워크플로 목록입니다. JSON 사본은 모두 `active:false`이며 키·credential 연결·실행 상태가 없습니다. 원본 워크플로 ID, 다른 워크플로 참조, Data Table ID, 모델 경로, Drive 폴더 등의 연결을 새 인스턴스에 맞춰 확인하세요. `PRIVATE_RESOURCE_...`는 외부 리소스 식별자의 대체값입니다.

운영 인스턴스에 한꺼번에 가져오거나 활성화하지 마세요. 복원할 대상만 별도 환경에 가져와 자격 증명과 GPU 공용 잠금·정리 로직을 검증한 후 활성화합니다. 이전 기준본은 테스트와 변경 이력 보존용이며 현재본은 `workflows/n8n/`입니다.

## 안전한 테스트

저장소 루트에서 `node tools/setup-test-fixtures.mjs`를 실행하면 공개 모델 목록과 합성 영상 fixture를 테스트 경로로 복사합니다. 운영 데이터는 만들지 않으며 기존 동명 fixture를 덮어쓰지 않습니다.

```powershell
node tools/setup-test-fixtures.mjs
cd mobile-studio
npm ci
node build-prompt-builder.mjs --check
npm test
```

```powershell
cd sites/viator-agent-meeting
npm ci
node --test test/*.test.mjs
```

저장소 루트의 `node tests/sequential.test.cjs`는 워크플로를 실제 실행하지 않고 Code 노드의 로직을 VM과 모의 데이터로 검사합니다. `*live*.mjs`, `lock_concurrency.py`, 배포·재시작·복구 보조 스크립트는 실제 인프라나 유료 생성에 영향을 줄 수 있으므로 일반 테스트에 포함하지 마세요. 테스트 결과는 `docs/VALIDATION.ko.md`에 기록합니다.

## 원본 보존 확인

`docs/backup-manifest.json`에 복사 대상 원본과 백업본 SHA-256, 정리 여부를 기록했습니다. `sourceSha256`은 로컬 원본 검증용이며 원본 파일 내용·인증정보를 제공하지 않습니다. 워크플로 credential 재연결과 실제 운영 데이터 복구는 별도 작업입니다.
