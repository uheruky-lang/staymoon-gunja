# Stay Moon v7 FINAL package

현재 합의된 v7 기준본입니다.

포함:
- `index.html` / `prices.js`: 예약홈 UI와 가격 설정
- `worker.js`: Airbnb inbound, D1 availability, HOLD, lazy expiry, 예약조회, 취소신청, reverse iCal, 운영자 이메일 helper, 개인정보 파기 Cron
- `schema.sql`: D1 예약/숙박일 collision schema
- `wrangler.toml.example`: D1, Email, 5분 HOLD Cron + 일일 개인정보 파기 Cron 예시
- `V7-SPEC.md`: 최종 합의 스펙

## 아직 활성화하지 않은 것
Naver Pay는 심사용 사이트 미배포로 거절된 상태였으므로 실제 결제는 아직 연결하지 않습니다. 사이트를 먼저 배포/정비하고 재심사 후 공식 API에 맞춰 연결합니다.

결제 연결 후 흐름:
1. `POST /api/holds`
2. Naver Pay 결제
3. 서버에서 결제 검증 + HOLD 유효성 재확인
4. `CONFIRMED`
5. `[예약완료]...` 운영자 이메일

취소는 고객 자동취소가 아니라 신청제:
1. 고객 예약조회
2. `POST /api/reservations/cancel-request`
3. `CONFIRMED → CANCEL_REQUESTED`
4. `[취소신청]...` 이메일
5. 운영자 승인 후에만 실제 취소/환불 및 재고 오픈

개인정보는 Stay Moon 운영정책에 따라 체크아웃 +2일 후 이름/전화/이메일을 자동 파기하도록 scaffold가 포함되어 있습니다. 법령상 별도 보관이 필요한 거래정보는 분리해서 최소 보관해야 합니다.
