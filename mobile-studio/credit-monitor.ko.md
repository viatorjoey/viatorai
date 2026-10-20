# API 크레딧 잔액 확인

스튜디오 설정의 잔액은 공식 결제 화면에서 확인한 실제 선불 잔액입니다. 사용량, 월 한도, 구독 크레딧, 예상 비용을 잔액으로 계산하지 않습니다. Codex의 이 대화에 연결된 12시간 간격 자동 작업이 로그인된 브라우저에서 읽고 로컬 SQLite에 기록합니다. PC와 Codex가 실행되어 있어야 합니다.

## 확인 대상

- OpenAI: https://platform.openai.com/settings/organization/billing/overview — **ChiefMechanic** 조직의 API credit balance를 확인합니다. Personal 조직의 무료 크레딧이나 Wallet balance는 사용하지 않습니다.
- Gemini: https://aistudio.google.com/billing — **Default Gemini Project**의 결제 계정만 사용합니다. chiefmechanic 프로젝트, GCP 프로모션 크레딧, 다른 결제 계정의 $0는 사용하지 않습니다.
- Grok: https://console.x.ai/ 에서 **prost's team**의 Billing / Credits 화면을 엽니다.
- Claude: https://platform.claude.com/settings/billing

스튜디오에서 사용하는 조직/프로젝트와 일치하는지 화면에서 확인합니다. 계정 선택이 불명확하면 `account_mismatch`, 로그인 화면이면 `needs_login`, 일시적 조회 오류는 `unavailable`을 기록합니다. CAPTCHA, 신규 약관, 계정 생성, 충전/결제/자동 충전 설정은 진행하지 않습니다. 비밀번호, API 키, 세션 쿠키를 추출하거나 저장하지 않습니다. 읽을 수 없는 금액은 추정하지 않습니다. 명시적으로 후불임이 확인될 때만 `postpaid`를 사용합니다.

## 로컬 기록

작업 디렉터리 `mobile-studio`에서 `node update-credit-balances.mjs`의 표준 입력으로 아래 JSON을 전달합니다. `provider`는 `openai`, `gemini`, `xai`, `anthropic` 중 하나입니다. 한 번에 최대 4개를 원자적으로 저장합니다.

```json
{"observations":[{"provider":"gemini","status":"verified","amount":5,"currency":"USD","account":"Default Gemini Project","sourceUrl":"https://aistudio.google.com/billing"}]}
```

위 금액은 형식 예시입니다. 실행 시점의 화면에서 실제로 확인한 값을 사용합니다. 실패 상태에서는 `amount`, `currency`, `account`를 보내지 않아도 됩니다. `sourceUrl`은 해당 서비스 공식 결제 주소입니다. 예: `{"provider":"xai","status":"needs_login","sourceUrl":"https://console.x.ai/"}`. 실패 시 이전 확인 잔액/시각은 유지되고 시도 시각과 상태만 갱신됩니다. 조회 시도와 잔액 확인 시각은 별개입니다.

설정 화면은 `/api/cloud/credits`를 인증된 세션에서 읽습니다. 이 엔드포인트는 읽기 전용이며 일반 API 키나 브라우저 세션을 반환하지 않습니다. 정기 조회는 무료 결제 페이지 조회만 수행하고 유료 생성을 실행하지 않습니다. 외부 계정 로그인 문제는 새로 발생했을 때만 알리고, 반복되거나 잔액만 정상 갱신되면 조용히 마칩니다.
