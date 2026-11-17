/* Fee options and eligibility remain owned by core.js. This UI only records intent. */
let paymentFeeChoice = null;
let paymentFeePickerSignature = '';
function resetPaymentFeeChoice(){ paymentFeeChoice = null; }
function isPaymentFeeChoiceConfirmed(){
  const meta = getSelectedFeeTypeMeta();
  const student = getPaymentEligibleStudentById(selectedStudentId);
  return Boolean(student && meta && isFeeTypeApplicableForStudent(meta, student)
    && paymentFeeChoice?.student === String(student.id)
    && paymentFeeChoice?.fee === String(meta.id)
    && paymentFeeChoice?.label === String(elFee.value));
}
function choosePaymentFee(value){
  const student = getPaymentEligibleStudentById(selectedStudentId);
  const option = Array.from(elFee.options).find(o => o.value === value && !o.disabled);
  if(!student || !option) return;
  const meta = findFeeTypeById(option.dataset.feeTypeId);
  if(!meta || !isFeeTypeApplicableForStudent(meta, student)) return;
  const changed = elFee.value !== value || !isPaymentFeeChoiceConfirmed();
  if(!changed) return;
  elFee.value = value;
  paymentFeeChoice = { student: String(student.id), fee: String(meta.id), label: String(value) };
  if(changed){
    // A tender entered for another fee must never carry into this selection.
    elAmount.value = '';
    if(elMixedCdfAmount) elMixedCdfAmount.value = '';
  }
  elFee.dispatchEvent(new Event('change', { bubbles: true }));
  syncPaymentFeePicker();
}
function syncPaymentFeePicker(){
  const container = document.getElementById('paymentFeeChoices');
  if(!container) return;
  const student = getPaymentEligibleStudentById(selectedStudentId);
  const confirmed = isPaymentFeeChoiceConfirmed();
  const search = document.getElementById('paymentFeeSearch');
  const query = String(search?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const options = Array.from(elFee.options).filter(o => {
    const meta = findFeeTypeById(o.dataset.feeTypeId);
    return meta && !o.disabled && (!student || isFeeTypeApplicableForStudent(meta, student));
  });
  const signature = JSON.stringify([student?.id, query, confirmed, elFee.value, options.map(o=>[o.value,o.dataset.feeTypeId,o.dataset.feeCycle,o.dataset.feeCurrency])]);
  if(signature !== paymentFeePickerSignature){
    paymentFeePickerSignature = signature;
    const visible = options.filter(o => o.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query));
    const focusedValue = container.contains(document.activeElement) ? document.activeElement?.dataset?.feeValue : null;
    container.innerHTML = visible.map(o => {
      const cycle = {monthly:'Mensuel',annual:'Annuel',item:'Article'}[o.dataset.feeCycle] || 'Selon configuration';
      const selected = confirmed && o.value === elFee.value;
      return `<button type="button" class="payment-fee-choice" data-fee-value="${esc(o.value)}" aria-pressed="${selected}" ${student ? '' : 'disabled'}><strong>${esc(o.textContent)}</strong><small>${esc(cycle)} · ${esc(o.dataset.feeCurrency || '')}</small><span>${selected ? '✓ Sélectionné' : 'Choisir ce frais'}</span></button>`;
    }).join('') || '<p class="tiny">Aucun frais correspondant pour cet élève.</p>';
    if(focusedValue) Array.from(container.querySelectorAll('[data-fee-value]')).find(b => b.dataset.feeValue === focusedValue)?.focus();
  }
  const summary = document.getElementById('paymentFeeSelection');
  if(summary){
    summary.classList.toggle('is-selected', confirmed);
    summary.textContent = confirmed ? `Frais choisi : ${elFee.value} · ${elMonth.value || 'Période à vérifier'}` : (student ? 'Choisissez explicitement le frais demandé par la famille.' : 'Sélectionnez un élève pour afficher ses frais disponibles.');
  }
  if(paymentReviewFee) paymentReviewFee.textContent = confirmed ? elFee.value : 'Aucun frais choisi';
}
document.getElementById('paymentFeeSearch')?.addEventListener('input', syncPaymentFeePicker);
document.getElementById('paymentFeeChoices')?.addEventListener('click', event => {
  const button = event.target.closest('[data-fee-value]');
  if(button) choosePaymentFee(button.dataset.feeValue);
});
