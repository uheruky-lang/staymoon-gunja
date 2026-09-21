# Stay Moon Gunja Booking Engine + Mini PMS v7 — FINAL

## 1. 기본 판매 규칙
- Domain: `staymoon-gunja.shop`
- Property ID: `staymoon_gunja`
- 판매기간: 오늘 기준 D+60 rolling.
- 가격: 일 218,000원 / 월~목 190,000원 / 금~토 289,000원.
- 1~4인 포함. 5~8인은 초과 1인당 30,000원/박. 최대 8인.
- 기본 최소 2박.
- 예약 사이 1~2박 자투리 공실은 1박 허용.
- 체크인 D-5 이내는 공실 길이와 무관하게 1박 허용.
- Airbnb 예약 체크인 날짜는 직전 공홈 숙박의 체크아웃 boundary로 사용 가능.
- Airbnb iCal `DTEND`는 exclusive checkout.

## 2. 가격 관리
- GitHub `prices.js`: 요일 기본가, `specialPrices`, `closedDates` 관리.
- 화면의 계산값은 참고값. HOLD/결제 시 Worker가 서버에서 최종 금액을 다시 계산하고 검증.
- 향후 예약 건별 운영자 수동 할인 가능하도록 확장.

## 3. 재고
- Airbnb → 공홈: Worker Secret `AIRBNB_ICAL_URL`로 private iCal fetch.
- 공홈 → Airbnb: `/calendar/direct.ics?token=...`; D1의 유효한 직접예약을 `.ics`로 export.
- outbound token은 Worker Secret `OUTBOUND_ICAL_TOKEN`.
- iCal에는 게스트 PII를 넣지 않음.
- 재고 확인 실패는 fail-closed.
- 결제 직전 최신 Airbnb 재고 + D1 재고를 다시 확인.

## 4. 예약 Flow
날짜 → 인원 → 가격 → 예약자정보/동의 → 결제하기 → 최신재고 확인 → Atomic HOLD(10분) → Naver Pay → 서버 결제검증 → CONFIRMED → 예약완료.

Naver Pay는 아직 미연동. 승인 후 공식 API 기준으로 결제/승인검증/취소/부분환불/전액환불/notification 방식을 연결.

## 5. HOLD / 동시예약
- `hold_expires_at = now + 10분`.
- 만료 HOLD는 즉시 재고에서 제외하는 lazy expiry.
- 5분 Cron이 오래된 HOLD를 `EXPIRED`로 바꾸고 `reservation_nights`를 정리.
- `reservation_nights`의 `PRIMARY KEY(property_id, stay_date)`가 직접예약 충돌의 마지막 방어선.
- 늦게 도착한 결제 결과는 HOLD/재고를 다시 검증한 뒤에만 확정.

## 6. 예약 상태
`HOLD → CONFIRMED → CANCEL_REQUESTED → (운영자 승인) → CANCELLED → 필요 시 REFUND_PENDING → REFUNDED`

결제 미완료 HOLD는 `EXPIRED`.

### 취소는 자동 실행하지 않음
- 고객은 **취소 신청만** 가능.
- 신청 시 `CONFIRMED → CANCEL_REQUESTED`.
- 신청만으로 Naver Pay 취소/환불을 실행하지 않음.
- 신청만으로 재고를 풀지 않음. 승인 전까지 기존 예약은 계속 BLOCK.
- 운영자가 내용을 확인하고 승인한 뒤 실제 결제 취소/환불 및 재고 오픈.
- 환불불가 기간이어도 취소 신청 자체는 가능하며 예상 환불액 0원을 안내할 수 있음.

## 7. 예약번호
고객/운영자용 예약번호: **체크인 MMDD + 전화번호 뒤 4자리**.

예: 2026-10-20 체크인 + 010-1234-5678 → `1020-5678`.

이 값은 보안토큰/DB PK가 아님. 내부 PK는 UUID `reservation_id` 사용.

## 8. 예약 조회
- 고객 UX: 예약번호 + 예약 시 전체 휴대폰번호.
- 조회 API rate limiting 필요.
- 조회 응답은 필요한 예약정보만 반환.
- 실서비스에서 필요 시 OTP/secure token으로 강화.

## 9. 환불 정책
- 체크인 14일 전까지: 100%.
- 체크인 14일 전~7일 전: 50%.
- 체크인 7일 이내: 환불 불가.
- 시스템은 예상 환불액을 서버에서 계산하지만 실제 취소/환불 실행은 운영자 승인 후.

## 10. 운영자 이메일 / 자동화 이벤트
수신: `uheruky@gmail.com`.

Cloudflare Email Service Worker binding 사용. 이메일은 기존 예약→청소 Calendar/Sheet 자동화가 읽는 시스템 이벤트이므로 제목 첫 토큰을 고정.

- `[예약완료][홍길동]님이 9월 10일 체크인 · 9월 12일 체크아웃으로 스테이문을 예약했습니다`
- `[취소신청][홍길동]님의 9월 10일 체크인 · 9월 12일 체크아웃 예약에 취소 신청이 접수되었습니다`
- `[예약취소][홍길동]님이 9월 10일 체크인 · 9월 12일 체크아웃 스테이문 예약을 취소했습니다`
- `[환불완료][홍길동]님의 9월 10일 체크인 · 9월 12일 체크아웃 스테이문 예약 환불이 완료되었습니다`

자동화는 `[예약완료]`, `[취소신청]`, `[예약취소]`, `[환불완료]`를 파싱.

본문 필드명은 고정: 예약번호, 숙소ID, 숙소명, 예약경로, 체크인, 체크아웃, 숙박일수, 인원, 예약자명, 연락처, 결제금액, 예약상태.

D1이 source of truth. 이메일 실패가 예약 상태를 롤백하지 않으며 발송실패는 기록/재시도 대상으로 처리.

## 11. 개인정보 Lifecycle
Stay Moon 운영정책: **체크아웃 +2일 후 예약자 개인정보 파기**.

하루 1회 Privacy Cron이 대상 예약을 찾아:
- 예약자명 → 파기값으로 치환
- 전화번호 → 삭제
- 이메일 → 삭제
- `pii_destroyed_at` 기록

예약 레코드 자체는 삭제하지 않고, 운영/정산에 필요한 비식별 정보(내부 reservation_id, 숙소ID, 날짜, 숙박일수, 인원, 금액, 할인, 상태, 결제/환불 관련 최소 식별정보, 상태변경 시각)는 유지.

`booking_number`에는 전화번호 뒤 4자리가 포함되므로 개인정보 파기 이후 고객 식별/조회 수단으로 사용하지 않음.

법령상 별도 보관 의무가 있는 거래/결제 정보는 개인정보 파기 정책과 분리하여 필요한 최소 범위만 보관.

## 12. 데이터 Lifecycle
- HOLD: 10분 후 논리적 만료 → Cron으로 `EXPIRED` 정리.
- EXPIRED 실패성 데이터: 운영 디버깅용 단기 보관 후 추후 30일 cleanup 적용 가능.
- CONFIRMED/CANCELLED/REFUNDED: 거래/운영 이력 유지하되 PII는 체크아웃 +2일 후 파기.
- API 로그/이메일 원문/결제사 응답 전문은 D1에 무분별하게 저장하지 않음.
- reverse iCal은 현재/미래 유효 예약 위주로 출력하도록 운영.

## 13. D1 주요 필드
`reservation_id`, `booking_number`, `property_id`, `check_in`, `check_out`, `nights`, `guest_count`, `guest_name`, `phone`, `email`, `room_amount`, `extra_guest_amount`, `discount_amount`, `payment_amount`, `status`, `hold_expires_at`, `payment_id`, `payment_status`, `refund_amount`, `notification_status`, `created_at`, `confirmed_at`, `cancel_requested_at`, `cancelled_at`, `refunded_at`, `pii_destroyed_at`.

처음부터 `property_id`를 사용하여 2호점 확장 가능하게 유지.

## 14. 보안 원칙 / 결제 후 QA
- Airbnb iCal token, outbound iCal token, Naver Pay Secret은 Cloudflare Secrets에만 저장.
- 브라우저가 보내는 가격/재고/환불액/예약상태를 신뢰하지 않음.
- 서버 가격 재계산 + 결제 직전 재고 재확인.
- 결제 성공화면이 아니라 서버측 결제 검증 후에만 CONFIRMED.
- payment/cancel/refund idempotency.
- production CORS 제한.
- 예약조회/HOLD endpoint rate limiting 및 필요 시 Turnstile.
- outbound iCal에 PII 금지.
- 고객용 API로 `CANCELLED`/`REFUNDED` 직접 전이 불가.

결제 연동 후 공격 QA: 가격변조, 중복 HOLD, 예약조회 brute force, 가짜 결제완료, 중복 취소/환불, iCal token 노출, API 폭격, 개인정보 과다반환, HOLD 만료 경계, 결제 callback 중복/지연.

## 15. Cloudflare Cron
- `*/5 * * * *`: HOLD expiry cleanup.
- `0 3 * * *`: 개인정보 파기 대상 일일 처리(UTC 기준; 운영시간은 필요 시 변경).

## 16. 현재 v7 상태
- Airbnb inbound API 구조 존재.
- D1 schema/HOLD/reverse iCal/email helper/cancel-request scaffold 포함.
- Naver Pay는 아직 실제 연결하지 않음.
- 공홈 UI의 실제 HOLD/결제/취소신청 동작은 결제 승인/API 연동 단계에서 활성화.
