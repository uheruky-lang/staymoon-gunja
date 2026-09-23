// GitHub에서 이 파일만 수정하면 달력 가격이 바뀝니다.
const defaultPrices={sun:218000,mon:190000,tue:190000,wed:190000,thu:190000,fri:289000,sat:289000};

const specialPrices={
  // "2026-10-03":329000,
};

const closedDates=[
  // "2026-10-10",
];

const extraGuestFeePerNight=30000;
const baseGuestCount=4;
const maxGuestCount=8;
const stayDiscounts = [
  { nights: 7, rate: 0.10 },
  { nights: 5, rate: 0.07 },
  { nights: 3, rate: 0.04 }
];
