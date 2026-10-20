# Windows 자동 실행과 복구

현재 사용자 로그인 시 예약 작업 **AI Creator Studio Supervisor**가 백그라운드로 실행됩니다. 재부팅한 뒤에도 Windows에 로그인하면 시작합니다. 로그인 전 서비스 실행이나 자동 로그인 설정은 변경하지 않습니다.

- 감시기: `start-supervisor.ps1` → `supervisor.mjs`.
- 웹 화면: 127.0.0.1:8799, 생성 작업 서버: 127.0.0.1:8787. 정상 프로세스는 그대로 인계해 감시하고, 종료된 서버만 재실행합니다. 다른 프로그램이 포트를 사용하면 종료하지 않습니다.
- 기본 감시 간격 5초. 서버 종료 시 2~30초 범위의 재시도 간격을 적용합니다. 감시 Node가 종료되면 PowerShell 실행기가 5초 후 복구합니다. 실행기 자체가 실패하면 Windows 예약 작업의 1분 간격 재시작 설정이 적용됩니다.
- 웹은 Docker·ComfyUI가 준비되지 않아도 독립 실행됩니다. Docker가 준비되면 작업 서버의 기존 n8n CLI 준비 파일을 복사하고 시작합니다. ComfyUI나 Docker를 강제 종료·재시작하지 않습니다.
- ComfyUI 연결 상태는 감시 파일과 로그에 기록됩니다. 대기 작업은 연결 복구 후 약 5~15초 주기로 실행 가능 여부를 재확인합니다.
- 이미 제출된 작업은 원래 prompt ID와 GPU 소유권을 보존합니다. 서버가 다시 시작되면 ComfyUI 큐 또는 성공 이력에서 원래 요청을 확인할 수 있을 때만 기존 복구 워크플로로 이어갑니다. 소유권·이력이 불확실하거나 ComfyUI 재시작으로 작업이 사라진 경우 자동으로 다시 제출하지 않습니다. 이 경우 확인 후 재생성이 필요할 수 있습니다.

## 상태 확인

```powershell
Get-ScheduledTask -TaskName 'AI Creator Studio Supervisor'
Invoke-RestMethod http://127.0.0.1:8801/health
Get-Content .\data\supervisor.log -Tail 20
```

다시 설치: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-autostart.ps1`.
상태 파일: `data/supervisor-status.json`, 로그: `data/supervisor.log`, 감시기 복구 로그: `data/supervisor-launcher.log`.

## 검증

- 현재 Windows 계정에 로그인 트리거·동시 중복 실행 방지·무제한 실행 시간·배터리 상태에서도 실행하는 예약 작업 등록 및 실행 확인.
- 실제 감시 Node 종료 후 5초 뒤 새 PID로 자동 복구. 기존 운영 웹·작업 서버 PID 유지 확인.
- 격리 서버 두 개를 각각 강제 종료해 실제 Node 재시작 확인. 상대 서버 유지, SQLite 대기 요청 유지 확인.
- 모의 ComfyUI를 종료하고 재연결해 웹 HTTP 200 유지와 연결 상태 전환 확인. 실제 dispatcher의 오프라인 보류·복구 후 실행 예약을 모의 호출로 검증. GPU 생성 요청은 보내지 않았습니다.
- 자동 테스트 59개 통과. Windows 자체 재부팅·로그아웃은 현재 작업을 중단하지 않기 위해 실행하지 않았습니다.
