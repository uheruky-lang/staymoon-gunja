const el=id=>document.getElementById(id);
let activeModal=null,previousFocus=null,modalStack=[];
let quote=null,selection=null,guestData=null,requestKey=null,busy=false,currentReservation=null,timer=null;
async function api(path,body,headers={}) {
  const response=await fetch(AVAILABILITY_API+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.success) throw new Error(data.error||'요청을 처리할 수 없습니다.');
  return data;
}
function openModal(modal) {
  if(activeModal){modalStack.push(activeModal);activeModal.classList.remove('open');}
  else previousFocus=document.activeElement;
  activeModal=modal;modal.classList.add('open');document.body.style.overflow='hidden';
  const panel=modal.querySelector('.modal-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.querySelector('input,button')?.focus();
}
function closeModal() {
  if(busy&&activeModal===el('checkoutModal'))return;
  activeModal?.classList.remove('open');
  activeModal=modalStack.pop()||null;
  if(activeModal){activeModal.classList.add('open');activeModal.querySelector('button')?.focus();}
  else {document.body.style.overflow='';previousFocus?.focus();}
}
document.querySelectorAll('[data-modal]').forEach(b=>b.addEventListener('click',()=>openModal(el(b.dataset.modal))));
document.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click',closeModal));
document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal();}));
document.addEventListener('keydown',e=>{
  if(!activeModal)return;
  if(e.key==='Escape'){e.preventDefault();closeModal();}
  if(e.key==='Tab'){
    const nodes=[...activeModal.querySelectorAll('button:not(:disabled),input,a[href]')].filter(n=>n.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
});
const summary=q=>`${q.checkIn} → ${q.checkOut}\n${q.nights}박 · ${q.guests}명\n객실료 ₩${KRW(q.roomAmount)}${q.discountAmount?` · 연박 할인 −₩${KRW(q.discountAmount)}`:''}\n추가인원 ₩${KRW(q.extraGuestAmount)}\n최종 결제금액 ₩${KRW(q.paymentAmount)}`;
function setBusy(value){busy=value;el('bankTransfer').disabled=value;el('editGuest').disabled=value;el('guestForm').querySelector('button[type=submit]').disabled=value;}
el('bookBtn').onclick=()=>{
  if(!start||!end||!availabilityLoaded||!pricingLoaded)return;
  // A completed HOLD is kept visible until the guest closes and explicitly starts another booking.
  if(currentReservation?.reservationStatus==='HOLD'){openModal(el('checkoutModal'));return;}
  selection={checkIn:key(start),checkOut:key(end),guests};quote=null;guestData=null;requestKey=null;
  el('checkoutInput').hidden=false;el('guestForm').hidden=false;el('paymentMethods').hidden=true;el('bankResult').hidden=true;
  el('checkoutTitle').textContent='예약자 정보 · 최종 확인';el('checkoutSummary').textContent=`${selection.checkIn} → ${selection.checkOut} · ${guests}명\n예약자 정보를 입력하면 서버에서 최종 요금을 확인합니다.`;
  el('checkoutMessage').textContent='';openModal(el('checkoutModal'));
};
el('guestForm').onsubmit=async e=>{
  e.preventDefault();if(busy||!el('guestForm').reportValidity())return;
  const f=new FormData(el('guestForm'));
  const phone=String(f.get('phone')).replace(/\D/g,'');
  if(!/^01[016789]\d{7,8}$/.test(phone)){el('checkoutMessage').textContent='휴대폰번호를 확인해 주세요.';return;}
  setBusy(true);el('checkoutMessage').textContent='예약 가능 여부와 최종 금액을 확인하고 있습니다.';
  try{
    guestData={name:String(f.get('name')).trim(),phone,email:String(f.get('email')).trim(),consent:true};
    quote=(await api('quote',selection)).quote;requestKey=crypto.randomUUID();
    el('checkoutSummary').textContent=summary(quote);el('guestReview').textContent=`${guestData.name} · ${guestData.phone}`;
    el('guestForm').hidden=true;el('paymentMethods').hidden=false;el('checkoutMessage').textContent='';
    el('bankTransfer').focus();
  }catch(error){el('checkoutMessage').textContent=error.message;}
  finally{setBusy(false);}
};
el('editGuest').onclick=()=>{quote=null;requestKey=null;el('guestForm').hidden=false;el('paymentMethods').hidden=true;};
el('bankTransfer').onclick=async()=>{
  if(busy||!quote||!guestData)return;
  setBusy(true);el('checkoutMessage').textContent='예약을 접수하고 있습니다. 잠시 기다려 주세요.';
  try{
    const data=await api('reservations',{...selection,...guestData,paymentMethod:'BANK_TRANSFER',expectedAmount:quote.paymentAmount},{'Idempotency-Key':requestKey});
    currentReservation=data.reservation;showReservation(currentReservation);loadAvailability();
  }catch(error){el('checkoutMessage').textContent=error.message+' 응답이 끊긴 경우 같은 버튼을 다시 누르면 중복 없이 확인합니다.';}
  finally{setBusy(false);}
};
const statusName={HOLD:'입금 대기',CONFIRMED:'예약 확정',CANCELLED:'예약 취소',PENDING:'입금 미확인',PAID:'결제 완료',REFUNDED:'환불 완료',BANK_TRANSFER:'계좌이체',NAVER_PAY:'네이버페이'};
function details(r){return `예약번호: ${r.bookingNumber}\n${r.checkIn} → ${r.checkOut} · ${r.nights}박 · ${r.guests}명\n금액: ₩${KRW(r.paymentAmount)}\n예약: ${statusName[r.reservationStatus]||r.reservationStatus}\n결제: ${statusName[r.paymentStatus]||'확인 필요'} · ${statusName[r.paymentMethod]||'기존 예약'}${r.cancelRequestedAt?'\n취소 신청 접수 · 운영자 확인 대기':''}`;}
function bankText(r){return r.bank?`\n\n${r.bank.bankName} ${r.bank.accountNumber}\n예금주: ${r.bank.accountHolder}\n입금자명: ${r.name}\n입금기한: ${new Date(r.holdExpiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국시간)`:'';}
function showReservation(r){
  el('checkoutInput').hidden=true;el('bankResult').hidden=false;el('checkoutTitle').textContent=r.reservationStatus==='HOLD'?'예약 신청 · 입금 안내':statusName[r.reservationStatus];
  el('bankResult').querySelector('p').hidden=r.reservationStatus!=='HOLD';
  el('bankDetails').textContent=details(r)+bankText(r);el('checkoutMessage').textContent='';
  clearInterval(timer);
  const tick=()=>{
    if(r.reservationStatus!=='HOLD'){el('holdCountdown').textContent='';return;}
    const remaining=Math.max(0,Math.ceil((Date.parse(r.holdExpiresAt)-Date.now())/1000));
    el('holdCountdown').textContent=remaining?`입금까지 ${Math.floor(remaining/60)}분 ${remaining%60}초 남았습니다. 입금 확인 후 확정됩니다.`:'입금 기한이 지났습니다. 입금하지 말고 예약 상태를 조회해 주세요.';
    if(!remaining){el('bankDetails').textContent=details(r);clearInterval(timer);}
  };tick();timer=setInterval(tick,1000);
}
el('copyBooking').onclick=async()=>{try{await navigator.clipboard.writeText(currentReservation.bookingNumber);el('checkoutMessage').textContent='예약번호를 복사했습니다.';}catch{el('checkoutMessage').textContent='위 예약번호를 선택하여 복사해 주세요.';}};
el('refreshReservation').onclick=async()=>{
  try{currentReservation=(await api('reservations/lookup',{bookingNumber:currentReservation.bookingNumber,phone:guestData.phone})).reservation;showReservation(currentReservation);loadAvailability();}
  catch(error){el('checkoutMessage').textContent=error.message;}
};
function renderLookup(r,credentials){
  const message=el('lookupMessage');message.replaceChildren();
  const text=document.createElement('div');text.className='bank-details';text.textContent=details(r)+bankText(r);message.append(text);
  if(r.reservationStatus!=='CANCELLED'&&!r.cancelRequestedAt){
    const button=document.createElement('button');button.className='lookup-btn';button.textContent=r.reservationStatus==='HOLD'?'입금 대기 예약 취소':'취소 신청';
    button.onclick=async()=>{
      if(!confirm(r.reservationStatus==='HOLD'?'입금 대기 예약을 취소하시겠습니까? 이미 입금했다면 숙소로 먼저 문의해 주세요.':'취소 신청을 접수할까요? 운영자 확인 후 환불 규정에 따라 처리됩니다.'))return;
      button.disabled=true;
      try{const data=await api('reservations/cancel-request',credentials);renderLookup(data.reservation,credentials);if(currentReservation?.bookingNumber===r.bookingNumber)currentReservation=data.reservation;loadAvailability();}
      catch(error){const p=document.createElement('p');p.textContent=error.message;message.append(p);button.disabled=false;}
    };message.append(button);
  }
}
el('lookupBtn').onclick=async()=>{
  const credentials={bookingNumber:el('lookupReservation').value.trim(),phone:el('lookupPhone').value.replace(/\D/g,'')};
  el('lookupBtn').disabled=true;el('lookupMessage').textContent='예약을 확인하고 있습니다.';
  try{renderLookup((await api('reservations/lookup',credentials)).reservation,credentials);}
  catch(error){el('lookupMessage').textContent=error.message;}
  finally{el('lookupBtn').disabled=false;}
};
async function initialize(){
  render();el('availabilityMessage').textContent='요금과 예약 가능 날짜를 불러오고 있습니다.';
  try{
    const data=await api('config');
    ({defaultPrices,specialPrices,closedDates,baseGuestCount,maxGuestCount,extraGuestFeePerNight,stayDiscounts}=data.pricing);
    pricingLoaded=true;await loadAvailability();
    el('availabilityMessage').textContent=availabilityLoaded?'계좌이체로 예약할 수 있습니다. 입금 확인 후 예약이 확정됩니다.':'예약 가능 날짜를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.';
  }catch{pricingLoaded=false;el('availabilityMessage').textContent='예약 서비스를 준비 중입니다. 잠시 후 다시 방문하거나 숙소로 문의해 주세요.';render();}
}
initialize();
