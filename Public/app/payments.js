/***************
 * POS input events
 ***************/
const paymentWorkflowPanels = [
  document.getElementById("paymentWorkflowStep1"),
  document.getElementById("paymentWorkflowStep2"),
  document.getElementById("paymentWorkflowStep3")
];
const paymentWorkflowSteps = Array.from(document.querySelectorAll("[data-payment-step]"));
const paymentWorkflowLines = Array.from(document.querySelectorAll(".payment-workflow-progress > i"));
const paymentSelectedStudentCard = document.getElementById("paymentSelectedStudent");
const paymentNextFee = document.getElementById("paymentNextFee");
const paymentBackStudent = document.getElementById("paymentBackStudent");
const paymentNextAmount = document.getElementById("paymentNextAmount");
const paymentBackFee = document.getElementById("paymentBackFee");
const paymentStep1Status = document.getElementById("paymentStep1Status");
const paymentStep2Status = document.getElementById("paymentStep2Status");
const paymentStep2Student = document.getElementById("paymentStep2Student");
const paymentStep2Class = document.getElementById("paymentStep2Class");
const paymentReviewStudent = document.getElementById("paymentReviewStudent");
const paymentReviewFee = document.getElementById("paymentReviewFee");
const paymentReviewMonth = document.getElementById("paymentReviewMonth");
const paymentReviewAmount = document.getElementById("paymentReviewAmount");
const paymentReviewBalance = document.getElementById("paymentReviewBalance");
const paymentConfirmStatus = document.getElementById("paymentConfirmStatus");
let paymentWorkflowCurrentStep = 1;
let paymentConfirmationInFlight = false;

function setPaymentConfirmationBusy(isBusy){
  paymentConfirmationInFlight = Boolean(isBusy);
  if(elConfirm){
    elConfirm.classList.toggle("is-loading", paymentConfirmationInFlight);
    elConfirm.textContent = paymentConfirmationInFlight
      ? "Enregistrement…"
      : "✓ Confirmer et imprimer";
  }
  validateForm();
}

function getPaymentWorkflowAmountLabel(){
  const currency = String(elCurrency?.value || "USD").toUpperCase();
  const tender = getPaymentTenderInputSplit();
  if(currency === "MIXED"){
    if(!(Number(tender.usd || 0) > 0) && !(Number(tender.cdf || 0) > 0)) return "—";
    return `${formatUSD(Number(tender.usd || 0))} + ${formatMoney(Number(tender.cdf || 0), "CDF")}`;
  }
  const amount = parseInt(onlyDigits(elAmount?.value || "") || "0", 10);
  return amount > 0 ? formatMoney(amount, currency) : "—";
}

function syncPaymentWorkflowUi(){
  syncPaymentFeePicker();
  const student = getPaymentEligibleStudentById(selectedStudentId);
  const hasStudent = Boolean(student?.id);
  paymentSelectedStudentCard?.classList.toggle("is-empty", !hasStudent);
  if(paymentNextFee) paymentNextFee.disabled = !hasStudent;
  if(paymentStep1Status){
    paymentStep1Status.textContent = hasStudent
      ? "Dossier identifié. Vérifiez la classe avant de continuer."
      : "Sélectionnez un élève pour continuer.";
    paymentStep1Status.classList.toggle("is-error", !hasStudent && paymentWorkflowCurrentStep > 1);
  }
  if(paymentStep2Student) paymentStep2Student.textContent = student?.name || "—";
  if(paymentStep2Class) paymentStep2Class.textContent = student ? `${formatClassLevel(student.className, student.level)} · ${student.matricule || student.id}` : "—";
  if(paymentReviewStudent) paymentReviewStudent.textContent = student ? `${student.name} (${student.matricule || student.id})` : "—";
  if(paymentReviewFee) paymentReviewFee.textContent = isPaymentFeeChoiceConfirmed() ? normalizeFeeName(elFee?.value || "") : "Aucun frais choisi";
  if(paymentReviewMonth) paymentReviewMonth.textContent = elMonth?.value || "—";
  if(paymentReviewAmount) paymentReviewAmount.textContent = getPaymentWorkflowAmountLabel();
  if(paymentReviewBalance) paymentReviewBalance.textContent = elSelBal?.textContent || "—";
  if(paymentStep2Status){
    paymentStep2Status.textContent = selectedStudentFeeStatus
      ? "Situation de paiement vérifiée."
      : (hasStudent ? "Vérification du solde en cours…" : "");
  }
  if(paymentConfirmStatus){
    const reason = String(elConfirm?.title || "").trim();
    const ready = Boolean(hasStudent && elConfirm && !elConfirm.disabled && !paymentConfirmationInFlight);
    paymentConfirmStatus.classList.toggle("is-ready", ready);
    paymentConfirmStatus.classList.toggle("is-error", Boolean(reason));
    paymentConfirmStatus.textContent = paymentConfirmationInFlight
      ? "Enregistrement du paiement sur le serveur… Le reçu sera imprimé après confirmation."
      : ready
      ? "Tout est prêt. Confirmez pour enregistrer et imprimer le reçu."
      : (reason || (hasStudent ? "Saisissez un montant valide pour activer la confirmation." : "Sélectionnez d’abord un élève."));
  }
}

function setPaymentWorkflowStep(step, { focus = true } = {}){
  const next = Math.max(1, Math.min(3, Number(step) || 1));
  paymentWorkflowCurrentStep = next;
  paymentWorkflowPanels.forEach((panel, index) => {
    if(panel) panel.hidden = false;
  });
  paymentWorkflowSteps.forEach((button) => {
    const buttonStep = Number(button.dataset.paymentStep || 1);
    button.classList.toggle("is-active", buttonStep === next);
    button.classList.toggle("is-complete", buttonStep < next);
    button.setAttribute("aria-current", buttonStep === next ? "step" : "false");
  });
  paymentWorkflowLines.forEach((line, index) => line.classList.toggle("is-complete", index + 1 < next));
  syncPaymentWorkflowUi();
  if(!focus) return;
  requestAnimationFrame(() => {
    if(next === 1) elStudentLookup?.focus();
    if(next === 2) document.getElementById('paymentFeeSearch')?.focus();
    if(next === 3) elAmount?.focus();
  });
}

paymentNextFee?.addEventListener("click", () => {
  if(!getPaymentEligibleStudentById(selectedStudentId)){
    syncPaymentWorkflowUi();
    elStudentLookup?.focus();
    return;
  }
  setPaymentWorkflowStep(2);
});
paymentBackStudent?.addEventListener("click", () => setPaymentWorkflowStep(1));
paymentNextAmount?.addEventListener("click", () => {
  if(!getPaymentEligibleStudentById(selectedStudentId)){
    setPaymentWorkflowStep(1);
    return;
  }
  setPaymentWorkflowStep(3);
});
paymentBackFee?.addEventListener("click", () => setPaymentWorkflowStep(2));
paymentWorkflowSteps.forEach((button) => {
  button.addEventListener("click", () => {
    const target = Number(button.dataset.paymentStep || 1);
    if(target < paymentWorkflowCurrentStep) setPaymentWorkflowStep(target);
  });
});

const renderStudentListFromSearchInput = debounce(() => {
  paymentVisibleCount = PAYMENT_LIST_STEP;
  renderStudentList();
}, 120);
if(elSearch){
  elSearch.addEventListener("input", () => {
    markPaymentUiInteraction();
    renderStudentListFromSearchInput();
  });
}
if(elClassFilter){
  elClassFilter.addEventListener("change", () => {
    markPaymentUiInteraction();
    paymentVisibleCount = PAYMENT_LIST_STEP;
    renderStudentList();
  });
}
if(elStatusFilter){
  elStatusFilter.addEventListener("change", () => {
    markPaymentUiInteraction();
    paymentVisibleCount = PAYMENT_LIST_STEP;
    renderStudentList();
  });
}

elFee.addEventListener("change", () => {
  markPaymentUiInteraction();
  const meta = getSelectedFeeTypeMeta();
  saveUiStatePatch({
    paymentFeeTypeId: meta?.id ?? null,
    paymentFeeTypeCode: String(meta?.code || "").toUpperCase(),
    paymentFeeLabel: normalizeFeeName(elFee.value || "")
  });
  applyFeeTypeSelectionBehavior();
  if(selectedStudentId){
    loadSelectedStudentFeeStatus({ applyMonthDefault: true })
      .finally(() => {
        validateForm();
        refreshReceiptPreviewFromForm();
      });
  } else {
    validateForm();
    refreshReceiptPreviewFromForm();
  }
});
elMonth.addEventListener("change", () => {
  markPaymentUiInteraction();
  saveUiStatePatch({ paymentMonth: String(elMonth.value || "") });
  const s = getPaymentEligibleStudentById(selectedStudentId);
  if(s) enforceMonthPriorityForStudent(s, true);
  applyFeeTypeSelectionBehavior();
  if(selectedStudentId){
    loadSelectedStudentFeeStatus({ applyMonthDefault: false })
      .finally(() => {
        validateForm();
        refreshReceiptPreviewFromForm();
      });
  } else {
    validateForm();
    refreshReceiptPreviewFromForm();
  }
});

elCurrency.dataset.previousCurrency = String(elCurrency.value || "USD").toUpperCase();
elCurrency.addEventListener("change", () => {
  markPaymentUiInteraction();
  const nextCurrency = String(elCurrency.value || "USD").toUpperCase();
  const previousCurrency = String(elCurrency.dataset.previousCurrency || nextCurrency).toUpperCase();
  if(previousCurrency !== nextCurrency){
    elAmount.value = "";
    if(elMixedCdfAmount) elMixedCdfAmount.value = "";
  }
  elCurrency.dataset.previousCurrency = nextCurrency;
  saveUiStatePatch({ paymentCurrency: nextCurrency });
  syncMixedPaymentUi();
  enforceAmountLimitForSelectedMonth();
  validateForm();
  refreshReceiptPreviewFromForm();
});

if(elMixedCdfAmount){
  elMixedCdfAmount.addEventListener("input", () => {
    markPaymentUiInteraction();
    const digits = onlyDigits(elMixedCdfAmount.value);
    elMixedCdfAmount.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    enforceAmountLimitForSelectedMonth();
    validateForm();
    refreshReceiptPreviewFromForm();
  });
}

elAmount.addEventListener("input", () => {
  markPaymentUiInteraction();
  const digits = onlyDigits(elAmount.value);
  elAmount.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  enforceAmountLimitForSelectedMonth();
  validateForm();
  refreshReceiptPreviewFromForm();
});
if(elNote){
  elNote.addEventListener("input", () => {
    markPaymentUiInteraction();
    syncPaymentWorkflowUi();
  });
}

elConfirm.addEventListener("click", confirmPayment);
elPrint.addEventListener("click", printCurrentReceipt);
syncMixedPaymentUi();
setPaymentWorkflowStep(1, { focus: false });

/***************
 * Students page events
 ***************/
stAddBtn.addEventListener("click", submitEnrollmentWorkflow);
stRefreshBtn.addEventListener("click", async () => {
  await loadStudents();
  await renderStudentsTable();
});
if(stLookupOldBtn){
  stLookupOldBtn.addEventListener("click", () => {
    toggleOldStudentsLookupPanel();
  });
}
if(stModeNew){
  stModeNew.addEventListener("click", () => setEnrollmentMode("new"));
}
if(stNextPlacement){
  stNextPlacement.addEventListener("click", () => {
    if(!validateEnrollmentIdentity()) return;
    setEnrollmentStep(2);
    updateEnrollmentPlacementPreview();
  });
}
if(stBackIdentity) stBackIdentity.addEventListener("click", () => setEnrollmentStep(1));
if(stNextReview){
  stNextReview.addEventListener("click", () => {
    if(!validateEnrollmentPlacement()) return;
    renderEnrollmentReview();
    setEnrollmentStep(3);
  });
}
if(stBackPlacement) stBackPlacement.addEventListener("click", () => setEnrollmentStep(2));
document.querySelectorAll("[data-enrollment-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = Number(button.dataset.enrollmentStep || 1);
    if(target < enrollmentCurrentStep) setEnrollmentStep(target);
  });
});
if(stOldLookupQuery){
  stOldLookupQuery.addEventListener("input", debounce(() => {
    searchOldStudentsForEnrollment(stOldLookupQuery.value);
  }, 140));
  stOldLookupQuery.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      searchOldStudentsForEnrollment(stOldLookupQuery.value);
      return;
    }
    if(e.key === "Escape" && stOldLookupPanel){
      stOldLookupPanel.hidden = true;
    }
  });
}
if(stOldLookupResults){
  stOldLookupResults.addEventListener("click", (e) => {
    const enrollBtn = e.target.closest("button[data-st-old-enroll-id]");
    if(!enrollBtn) return;
    const studentId = String(enrollBtn.getAttribute("data-st-old-enroll-id") || "").trim();
    if(!studentId) return;
    selectOldStudentForEnrollment(studentId);
  });
}
if(stOldSelected){
  stOldSelected.addEventListener("click", (e) => {
    if(!e.target.closest("[data-clear-old-student]")) return;
    selectedOldStudentForEnrollment = null;
    stOldSelected.hidden = true;
    stOldSelected.innerHTML = "";
    if(stOldLookupResults) stOldLookupResults.hidden = false;
    stOldLookupQuery?.focus();
  });
}
[stLevel, stClass, stCode].forEach((element) => element?.addEventListener("change", updateEnrollmentPlacementPreview));
stDue?.addEventListener("input", updateEnrollmentPlacementPreview);
if(stListSearch){
  stListSearch.addEventListener("input", debounce(() => {
    studentsVisibleCount = STUDENTS_LIST_STEP;
    saveUiStatePatch({ studentsListSearch: String(stListSearch.value || "") });
    renderStudentsTableGrouped();
  }, 140));
}
if(stListLevelFilter){
  stListLevelFilter.addEventListener("change", () => {
    studentsVisibleCount = STUDENTS_LIST_STEP;
    if(stListClassFilter){
      stListClassFilter.value = "";
      stListClassFilter.dataset.savedClass = "";
    }
    saveUiStatePatch({
      studentsListLevel: String(stListLevelFilter.value || "").trim().toLowerCase(),
      studentsListClass: ""
    });
    renderStudentsTableGrouped();
  });
}
if(stListClassFilter){
  stListClassFilter.addEventListener("change", () => {
    studentsVisibleCount = STUDENTS_LIST_STEP;
    saveUiStatePatch({ studentsListClass: String(stListClassFilter.value || "").trim() });
    renderStudentsTableGrouped();
  });
}
if(stListPrintBtn){
  stListPrintBtn.addEventListener("click", printStudentsList);
}
if(caisseHistoryPrintBtn){
  caisseHistoryPrintBtn.addEventListener("click", printCaisseHistoryOnly);
}
stTbody.addEventListener("click", (e) => {
  const toggleClassBtn = e.target.closest("button[data-st-toggle-class]");
  if(toggleClassBtn){
    const key = String(toggleClassBtn.getAttribute("data-st-toggle-class") || "").trim();
    if(key){
      studentsClassCollapsed[key] = !studentsClassCollapsed[key];
      renderStudentsTableGrouped();
    }
    return;
  }
  const profileBtn = e.target.closest("button[data-st-profile-id]");
  if(profileBtn){
    const id = profileBtn.getAttribute("data-st-profile-id") || "";
    if(id) loadStudentProfile(id);
    return;
  }
  const codeBtn = e.target.closest("button[data-change-code-id]");
  if(codeBtn){
    const id = codeBtn.getAttribute("data-change-code-id") || "";
    const nextClass = codeBtn.getAttribute("data-change-code-next") || "";
    if(id && nextClass){
      changeStudentCodeApi(id, nextClass);
    }
    return;
  }
  const more = e.target.closest("button[data-st-see-more-global]");
  if(more){
    studentsVisibleCount += STUDENTS_LIST_STEP;
    renderStudentsTableGrouped();
    return;
  }
  const less = e.target.closest("button[data-st-see-less-global]");
  if(less){
    studentsVisibleCount = STUDENTS_LIST_STEP;
    renderStudentsTableGrouped();
  }
});
if(studentProfileClose){
  studentProfileClose.addEventListener("click", closeStudentProfileModal);
}
if(studentProfileNewPaymentBtn){
  studentProfileNewPaymentBtn.addEventListener("click", () => {
    const studentId = String(studentProfileState?.student?.id || studentProfileState?.studentId || "").trim();
    if(!studentId) return showInAppPopup("Aucun eleve selectionne.");
    const paymentStudent = getPaymentEligibleStudentById(studentId);
    closeStudentProfileModal();
    setView("payment");
    if(!paymentStudent){
      showInAppPopup("Eleve inactif ou introuvable dans la liste de paiement.");
      return;
    }
    selectStudent(paymentStudent.id);
  });
}
if(studentProfileModal){
  studentProfileModal.addEventListener("click", (e) => {
    if(e.target === studentProfileModal) closeStudentProfileModal();
    const tabButton = e.target.closest?.("[data-profile-tab]");
    if(tabButton) setStudentProfileTab(tabButton.dataset.profileTab);
  });
}
if(pfOpenGradesBtn){
  pfOpenGradesBtn.addEventListener("click", () => {
    const student = studentProfileState?.student;
    if(!student) return;
    closeStudentProfileModal();
    if(typeof window.openGradesForStudent === "function"){
      window.openGradesForStudent({
        studentId: student.id,
        level: student.level,
        className: student.className
      });
    }else{
      setView("grades");
    }
  });
}
if(appConfirmCancelTop){
  appConfirmCancelTop.addEventListener("click", () => closeAppConfirm(false));
}
if(appConfirmCancel){
  appConfirmCancel.addEventListener("click", () => closeAppConfirm(false));
}
if(appConfirmOk){
  appConfirmOk.addEventListener("click", () => closeAppConfirm(true));
}
if(appConfirmModal){
  appConfirmModal.addEventListener("click", (e) => {
    if(e.target === appConfirmModal) closeAppConfirm(false);
  });
}
document.addEventListener("keydown", (e) => {
  if(appConfirmModal && appConfirmModal.style.display !== "none"){
    if(e.key === "Escape"){
      e.preventDefault();
      closeAppConfirm(false);
      return;
    }
    if(e.key === "Enter"){
      e.preventDefault();
      closeAppConfirm(true);
      return;
    }
  }
  if(e.key === "Escape" && caisseSpendModal && caisseSpendModal.style.display !== "none"){
    closeCaisseSpendModal();
    return;
  }
  if(e.key === "Escape" && studentProfileModal && studentProfileModal.style.display !== "none"){
    closeStudentProfileModal();
  }
});
if(pfChangeLevel){
  pfChangeLevel.addEventListener("change", () => profileSyncClassControlsFromLevel({ preserve: false }));
}
if(pfHistoryFeeFilter){
  pfHistoryFeeFilter.addEventListener("change", () => {
    profileHistoryVisibleCount = Math.max(1, Number(pfHistoryLimit?.value || 10));
    renderProfilePaymentsTable();
  });
}
if(pfHistoryLimit){
  pfHistoryLimit.addEventListener("change", () => {
    profileHistoryVisibleCount = Math.max(1, Number(pfHistoryLimit?.value || 10));
    renderProfilePaymentsTable();
  });
}
if(pfHistoryAddFee){
  pfHistoryAddFee.addEventListener("change", syncProfileHistoryAddFeeCurrency);
}
if(pfHistoryAddAmount){
  pfHistoryAddAmount.addEventListener("input", () => {
    const digits = onlyDigits(pfHistoryAddAmount.value);
    pfHistoryAddAmount.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  });
}
if(pfHistoryAddBtn){
  pfHistoryAddBtn.addEventListener("click", addHistoricalPaymentFromProfile);
}
if(pfHistoryRefresh){
  pfHistoryRefresh.addEventListener("click", () => {
    if(studentProfileState.studentId) loadStudentProfile(studentProfileState.studentId, { open: false });
  });
}
if(pfPaymentsTbody){
  pfPaymentsTbody.addEventListener("click", (e) => {
    const edit = e.target.closest("button[data-pf-pay-edit]");
    if(edit){
      const paymentId = edit.getAttribute("data-pf-pay-edit") || "";
      profileHistoryEditingPaymentId = String(paymentId || "");
      renderProfilePaymentsTable();
      return;
    }
    const cancelEdit = e.target.closest("button[data-pf-pay-edit-cancel]");
    if(cancelEdit){
      profileHistoryEditingPaymentId = "";
      renderProfilePaymentsTable();
      return;
    }
    const saveEdit = e.target.closest("button[data-pf-pay-edit-save]");
    if(saveEdit){
      const paymentId = saveEdit.getAttribute("data-pf-pay-edit-save") || "";
      updatePaymentDateFromProfile(paymentId);
      return;
    }
    const cancelReceipt = e.target.closest("button[data-pf-pay-cancel]");
    if(cancelReceipt){
      const paymentId = cancelReceipt.getAttribute("data-pf-pay-cancel") || "";
      cancelReceiptPayment(paymentId);
      return;
    }
    const del = e.target.closest("button[data-pf-pay-delete]");
    if(!del) return;
    const paymentId = del.getAttribute("data-pf-pay-delete") || "";
    deletePaymentFromProfile(paymentId);
  });
}
if(pfFeeStatusControls){
  pfFeeStatusControls.addEventListener("click", (e) => {
    const more = e.target.closest("button[data-pf-fee-more]");
    if(more){
      profileFeeStatusVisibleCount += PROFILE_FEE_STATUS_STEP;
      renderProfileFeeStatusTable();
      return;
    }
    const less = e.target.closest("button[data-pf-fee-less]");
    if(less){
      profileFeeStatusVisibleCount = PROFILE_FEE_STATUS_STEP;
      renderProfileFeeStatusTable();
    }
  });
}
if(pfHistoryControls){
  pfHistoryControls.addEventListener("click", (e) => {
    const step = Math.max(1, Number(pfHistoryLimit?.value || 10));
    const more = e.target.closest("button[data-pf-history-more]");
    if(more){
      profileHistoryVisibleCount += step;
      renderProfilePaymentsTable();
      return;
    }
    const less = e.target.closest("button[data-pf-history-less]");
    if(less){
      profileHistoryVisibleCount = step;
      renderProfilePaymentsTable();
    }
  });
}
if(pfChangeClassBtn){
  pfChangeClassBtn.addEventListener("click", submitStudentProfileClassChange);
}
if(pfSexToggleBtn){
  pfSexToggleBtn.addEventListener("click", toggleStudentSexFromProfile);
}
if(pfInfoSaveBtn){
  pfInfoSaveBtn.addEventListener("click", submitStudentProfileInfoUpdate);
}
if(pfFamilyLinkBtn){
  pfFamilyLinkBtn.addEventListener("click", submitStudentProfileFamilyLink);
}
if(pfBusManageBtn){
  pfBusManageBtn.addEventListener("click", () => {
    const studentId = String(studentProfileState?.student?.id || studentProfileState?.studentId || "").trim();
    if(!studentId) return;
    manageBusSubscriptionApi(studentId);
  });
}
if(pfTuitionBenefitBtn){
  pfTuitionBenefitBtn.addEventListener("click", () => {
    const studentId = String(studentProfileState?.student?.id || studentProfileState?.studentId || "").trim();
    if(!studentId) return;
    manageTuitionBenefitApi(studentId);
  });
}
if(openStudentProfileFromPayment){
  openStudentProfileFromPayment.addEventListener("click", () => {
    if(!selectedStudentId) return showInAppPopup("Sélectionnez un élève d'abord.");
    loadStudentProfile(selectedStudentId);
  });
}

async function loginWithCredentials(){
  const username = String(loginUsername?.value || "").trim();
  const password = String(loginPassword?.value || "");
  if(!username || !password){
    showLogin("Utilisateur et mot de passe requis.");
    return false;
  }
  try{
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    apiReachable = true;
    updateSyncBadge();
    setAuthState(data.user || null);
    startLiveRefreshLoop();
    if(loginUsername) loginUsername.value = "";
    if(loginPassword) loginPassword.value = "";
    hideLogin();
    return true;
  }catch(err){
    showLogin(`Connexion échouée: ${err.message}`);
    return false;
  }
}

async function bootstrapAuth(){
  const cachedUser = getStoredAuthUser();
  setAuthState(cachedUser || null);
  try{
    const me = await apiFetch("/api/auth/me");
    if(me?.user){
      setAuthState(me.user);
      hideLogin();
      return true;
    }
  }catch(_){}
  clearAuthState();
  showLogin("Session invalide. Veuillez vous reconnecter.");
  return false;
}

/***************
 * Init
 ***************/
async function init(){
  const ok = await bootstrapAuth();
  if(!ok) return;
  loadThemeSetting();
  sanitizeReportTypeOptions();

  validateApiConfigAtRuntime();
  await loadServerAddressInfo();
  await loadSchoolYearSetting();
  loadRateSetting();
  syncSelectEmptyStyle();
  setupStudentLookup();
  initAccordionPersistence();
  await loadFeeTypesFromApi(true);
  restorePaymentSelectionUiState();
  setTopDate();
  setRateLabel();
  syncSettingsView();

  const seq = getReceiptSeq();
  setReceiptSeq(seq);
  setTopReceiptPreview();
  prefetchNextReceiptNo({ force: true }).catch(() => {});
  ensurePendingPaymentsInOutbox();
  pruneOrphanPendingSpendings();

  // These endpoints return the complete active-year collections. Loading all
  // of them concurrently can saturate the local PostgreSQL -> Node result
  // stream on larger schools, making every overlapping request appear hung.
  // Stage read-only hydration; preserve outbox ordering and all data semantics.
  await loadStudents().catch(() => false);
  await loadPaymentsFromApi().catch(() => false);
  await loadSpendingsFromApi().catch(() => false);
  await loadCaisseTransfersFromApi().catch(() => false);
  await loadReceiptsFromApi().catch(() => false);
  await flushOutboxEvents({ ignoreSchedule: true }).catch(() => false);
  refreshStudentsFinancialState();
  startSyncLoop();
  startLiveRefreshLoop();
  updateSyncBadge();

  const selectedFeeMeta = getSelectedFeeTypeMeta();
  updateReceiptPreview({
    receiptNo: getNextReceiptNoForUi(),
    dateTime: new Date(),
    student: null,
    fee: elFee.value,
    feeTypeId: selectedFeeMeta?.id ?? null,
    feeTypeCode: selectedFeeMeta?.code || "",
    month: elMonth.value,
    amount: 0,
    currency: elCurrency.value,
    mode: DEFAULT_PAYMENT_MODE,
    cashier: elCashier.textContent
  });

  applySchoolYearToMonthSelectors({ preserve: true });
  const todayIso = toDateISO(new Date());
  reportConfirmedDateIso = todayIso;
  if(repDateSel){
    const todayDate = new Date(todayIso);
    repDateSel.value = Number.isFinite(todayDate.getTime()) ? fmtDateFrLong(todayDate) : fmtDateFrLong(new Date());
  }
  if(spDate){
    spDate.value = fmtDateFrLong(new Date());
    spDate.readOnly = true;
    spDate.disabled = false;
  }
  refreshPeriodLabels();
  if(repType) repType.value = "summary";
  sanitizeReportTypeOptions();
  setView(getSavedActiveView());
  applyFeeTypeSelectionBehavior();
  renderUsersAdmin();
  [repDateSel, rFrom, rTo, spDate, spFrom, spTo, pfHistoryAddDate].forEach((el) => {
    if(!el) return;
    el.addEventListener("blur", () => normalizeDateInputDisplay(el));
  });
  if(pfDateOfBirth){
    pfDateOfBirth.addEventListener("blur", () => {
      const iso = normalizeProfileDateInput(pfDateOfBirth.value || "");
      if(iso) pfDateOfBirth.value = formatIsoDateToFr(iso);
    });
  }
  if(pfEnrolledAt){
    pfEnrolledAt.addEventListener("blur", () => {
      const iso = normalizeProfileDateInput(pfEnrolledAt.value || "");
      if(iso) pfEnrolledAt.value = formatIsoDateToFr(iso);
    });
  }

  const ui = getUiState();
  if(ui.profileOpen && ui.profileStudentId){
    loadStudentProfile(String(ui.profileStudentId), { open: true }).catch(() => {});
  }
}

init();

window.addEventListener("online", () => {
  apiReachable = true;
  updateSyncBadge();
  loadServerAddressInfo();
  ensurePendingPaymentsInOutbox();
  flushOutboxEvents({ ignoreSchedule: true }).catch(() => {});
  scheduleLiveRefresh({ force: true, debounceMs: 80 });
});
window.addEventListener("offline", () => {
  apiReachable = false;
  updateSyncBadge();
});
window.addEventListener("focus", () => {
  loadServerAddressInfo();
  scheduleLiveRefresh({ force: false, debounceMs: 180 });
});
document.addEventListener("visibilitychange", () => {
  if(!document.hidden){
    scheduleLiveRefresh({ force: false, debounceMs: 180 });
  }
});

/*****************************************************************
 * Payments + printing helpers
 *****************************************************************/

// Helper: convert month label (FR) to YYYY-MM using selected school year (Sept->Juin)
function monthLabelToYYYYMM(label){
  return monthKeyFromLabelFR(label) || "";
}

// API-first payment post (required for multi-machine consistency)
async function postPaymentToApi(payment){
  // month expected by API: "YYYY-MM"
  const apiMonth = String(payment?.paidForMonth || payment?.monthKey || monthLabelToYYYYMM(payment?.month || "")).trim();
  const feeObj = findFeeTypeById(payment.feeTypeId) || findFeeTypeByCode(payment.feeTypeCode) || findFeeTypeByLabel(payment.feeType);
  const device = await ensureReceiptDeviceRegistration();

  // IMPORTANT: payment.studentId must be the API student id (STUxxxx)
  return apiFetch("/api/payments", {
    method: "POST",
    body: JSON.stringify({
      studentId: payment.studentId,
      monthKey: apiMonth,
      paid_for_month: apiMonth,
      schoolYearStartYear: Number.isFinite(Number(payment?.schoolYearStartYear))
        ? Number(payment.schoolYearStartYear)
        : normalizeSchoolYearStartYear(getActiveSchoolYearStartYear()),
      receiptDeviceKey: device.deviceKey,
      receiptDeviceLabel: getReceiptDeviceLabel(),
      feeTypeId: payment.feeTypeId ?? feeObj?.id ?? null,
      feeCode: payment.feeTypeCode || feeObj?.code || null,
      feeType: payment.feeType,
      currency: payment.currency,
      amount: payment.amountEntered,
      amountUSDReceived: payment.amountUSDReceived ?? null,
      amountCDFReceived: payment.amountCDFReceived ?? null,
      fx_rate: payment.rateUsed || USD_TO_CDF,
      note: payment.note || null,
      created_at: payment.createdAtOverride || null,
      clientRequestId: payment.clientRequestId || null
    })
  });
}

async function findPaymentByClientRequestIdFromApi(studentId, clientRequestId){
  const sid = String(studentId || "").trim();
  const cid = String(clientRequestId || "").trim();
  if(!sid || !cid) return null;
  try{
    const rows = await apiFetch(`/api/payments?studentId=${encodeURIComponent(sid)}`);
    if(!Array.isArray(rows)) return null;
    return rows.find((row) => String(row?.clientRequestId || row?.client_request_id || "").trim() === cid) || null;
  }catch(_){
    return null;
  }
}

async function resolveQueuedPaymentFromConflict(payment, err){
  const status = Number(err?.status || 0);
  const payload = err?.payload || {};
  const code = String(payload?.code || "").trim().toUpperCase();
  const reservedId = Number(payment?.reservedPaymentId || 0);
  if(status === 409 && (code === "RESERVED_RECEIPT_CONFLICT" || String(err?.message || "").toLowerCase().includes("réservé"))){
    if(Number.isInteger(reservedId) && reservedId > 0){
      try{
        return await apiFetch(`/api/payments/${encodeURIComponent(String(reservedId))}`);
      }catch(_){
        // Continue with other reconciliation paths.
      }
    }
  }
  const byClientRequest = await findPaymentByClientRequestIdFromApi(payment?.studentId, payment?.clientRequestId);
  if(byClientRequest) return byClientRequest;
  return null;
}

function shouldRetryQueuedPaymentWithFreshReceipt(payment, err){
  const reservedId = Number(payment?.reservedPaymentId || 0);
  if(Number.isInteger(reservedId) && reservedId > 0) return false;
  const message = String(err?.message || err || "").toLowerCase();
  return message.includes("payments_receipt_no_unique_idx")
    || message.includes("duplicate key value");
}

async function syncSinglePaymentCreate(payment){
  const payload = { ...(payment || {}) };
  if(!payload.clientRequestId){
    payload.clientRequestId = crypto?.randomUUID ? crypto.randomUUID() : `PAYREQ-${Date.now()}-${Math.random()}`;
    patchPaymentSyncState(payload, { clientRequestId: payload.clientRequestId });
  }
  try{
    const created = await postPaymentToApi(payload);
    return applySyncedPaymentRecord(payload, created);
  }catch(err){
    const reconciled = await resolveQueuedPaymentFromConflict(payload, err);
    if(reconciled){
      return applySyncedPaymentRecord(payload, reconciled);
    }
    if(shouldRetryQueuedPaymentWithFreshReceipt(payload, err)){
      payload.receiptNo = null;
      payload.reservedPaymentId = null;
      const retried = await postPaymentToApi(payload);
      return applySyncedPaymentRecord(payload, retried);
    }
    throw err;
  }
}

/*****************************************************************
 * Thermal receipt helpers
 *****************************************************************/
const THERMAL_RECEIPT_WIDTH = 48; // 80mm font A width target
const THERMAL_LABEL_WIDTH = 11;
const THERMAL_ALLOW_EXTENDED_CHARS = true;
const THERMAL_ESCPOS_CODE_PAGE = "CP1252";
const THERMAL_ESCPOS_CUT_MODE_DEFAULT = "GSVA";

// Browser preview renders UTF-8 correctly, but thermal printers often depend on
// limited ESC/POS code pages. Keep thermal text safe and deterministic here only.
function normalizeThermalText(text, { allowAccents = THERMAL_ALLOW_EXTENDED_CHARS } = {}){
  let out = String(text == null ? "" : text)
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00BA/g, "\u00B0")
    .replace(/\u0152/g, "OE")
    .replace(/\u0153/g, "oe")
    .replace(/\u00C6/g, "AE")
    .replace(/\u00E6/g, "ae");

  if(!allowAccents){
    // When the printer/code page cannot render accents, fallback to safe ASCII.
    out = out
      .replace(/N\u00B0/g, "No")
      .replace(/n\u00B0/g, "no")
      .replace(/\u00B0/g, "o");
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out = out.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  } else {
    out = out.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, " ");
  }

  return out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function padRight(text, width){
  text = String(text);
  return text + " ".repeat(Math.max(width - text.length, 0));
}

function padLeft(text, width){
  text = String(text);
  return " ".repeat(Math.max(width - text.length, 0)) + text;
}

function wrapThermalText(text, width){
  const maxWidth = Math.max(1, Number(width) || 1);
  const sourceLines = String(text == null ? "" : text).split(/\r?\n/);
  const lines = [];
  for(const srcLine of sourceLines){
    let line = String(srcLine || "").trim();
    if(!line){
      lines.push("");
      continue;
    }
    while(line.length > maxWidth){
      const window = line.slice(0, maxWidth + 1);
      let splitAt = window.lastIndexOf(" ");
      if(splitAt <= 0 || splitAt > maxWidth){
        splitAt = maxWidth;
      }
      lines.push(line.slice(0, splitAt).trimEnd());
      line = line.slice(splitAt).trimStart();
    }
    lines.push(line);
  }
  return lines;
}

// Centering is calculated after thermal sanitization to avoid off-by-one layout
// shifts when accented characters are replaced for ESC/POS compatibility.
function centerText(text, width, options = {}){
  const normalized = normalizeThermalText(text, options);
  return wrapThermalText(normalized, width).map((line) => {
    if(!line) return "";
    const totalSpaces = Math.max(width - line.length, 0);
    const left = Math.floor(totalSpaces / 2);
    return " ".repeat(left) + line;
  });
}

function divider(width, char = "-"){
  const ch = String(char || "-").charAt(0) || "-";
  return ch.repeat(Math.max(1, Number(width) || 1));
}

function padLabelValue(label, value, width, {
  labelWidth = THERMAL_LABEL_WIDTH,
  rightAlignValue = false
} = {}){
  const safeWidth = Math.max(12, Number(width) || THERMAL_RECEIPT_WIDTH);
  const safeLabelWidth = Math.max(4, Math.min(Number(labelWidth) || THERMAL_LABEL_WIDTH, safeWidth - 6));
  const normalizedLabel = normalizeThermalText(label).trim() || "-";
  const normalizedValue = normalizeThermalText(value).trim() || "-";
  const labelCell = normalizedLabel.length > safeLabelWidth
    ? normalizedLabel.slice(0, safeLabelWidth)
    : normalizedLabel;
  const prefix = `${padRight(labelCell, safeLabelWidth)} : `;
  const valueWidth = Math.max(6, safeWidth - prefix.length);
  const valueLines = wrapThermalText(normalizedValue, valueWidth);

  if(rightAlignValue && valueLines.length === 1){
    return [`${prefix}${padLeft(valueLines[0], valueWidth)}`];
  }

  return valueLines.map((line, idx) => {
    if(idx === 0) return `${prefix}${line}`;
    return `${" ".repeat(prefix.length)}${line}`;
  });
}

function formatThermalAmount(value){
  const num = Math.round(Number(value || 0));
  if(!Number.isFinite(num)) return "0";
  return num.toLocaleString("fr-FR").replace(/[\u00a0\u202f]/g, " ");
}

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

function code128BSequence(value){
  const normalized = String(value == null ? "" : value).trim().toUpperCase();
  if(!normalized || normalized.length > 40 || !/^[\x20-\x7E]+$/.test(normalized)) return null;

  const dataCodes = Array.from(normalized, (char) => char.charCodeAt(0) - 32);
  if(dataCodes.some((code) => code < 0 || code > 94)) return null;
  const checksum = (104 + dataCodes.reduce((sum, code, idx) => sum + (code * (idx + 1)), 0)) % 103;
  return { value: normalized, codes: [104, ...dataCodes, checksum, 106] };
}

function buildCode128SvgMarkup(value){
  const sequence = code128BSequence(value);
  if(!sequence || CODE128_PATTERNS.length !== 107) return "";

  const quietZone = 10;
  let x = quietZone;
  const bars = [];
  for(const code of sequence.codes){
    const pattern = CODE128_PATTERNS[code];
    if(!pattern) return "";
    for(let idx = 0; idx < pattern.length; idx += 1){
      const width = Number(pattern[idx]);
      if(idx % 2 === 0){
        bars.push(`<rect x="${x}" y="0" width="${width}" height="56"/>`);
      }
      x += width;
    }
  }
  const totalWidth = x + quietZone;
  const readableValue = esc(sequence.value);
  return `
    <div class="thermal-barcode" aria-label="Code-barres du reçu ${readableValue}">
      <svg viewBox="0 0 ${totalWidth} 56" role="img" aria-hidden="true" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        <g fill="#000">${bars.join("")}</g>
      </svg>
      <div class="thermal-barcode-value">${readableValue}</div>
    </div>
  `;
}

function receiptUsdAmountInCdf(value, data){
  const usd = Math.max(0, Number(value) || 0);
  const storedRate = Number(data?.rateUsed ?? data?.fxRate ?? USD_TO_CDF);
  const rate = Number.isFinite(storedRate) && storedRate > 0 ? storedRate : Number(USD_TO_CDF || 0);
  return Math.round(usd * Math.max(0, rate || 0));
}

function legalReceiptAmountInCdf(data, amountPrimaryValue, isCdf){
  const primary = Math.max(0, Number(amountPrimaryValue) || 0);
  if(data?.amountUSDReceived != null || data?.amountCDFReceived != null){
    return Math.round(Number(data.amountCDFReceived || 0) + receiptUsdAmountInCdf(data.amountUSDReceived || 0, data));
  }
  if(isCdf) return Math.round(primary);

  const storedCdf = Number(data?.amountCDF);
  if(Number.isFinite(storedCdf) && (storedCdf > 0 || primary === 0)){
    return Math.round(storedCdf);
  }

  return receiptUsdAmountInCdf(primary, data);
}

function formatThermalReceiptDate(value, fallbackDate = new Date()){
  const raw = String(value || "").trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const parsed = raw ? new Date(raw) : new Date(fallbackDate);
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date(fallbackDate) : parsed;
  return [
    String(safeDate.getDate()).padStart(2, "0"),
    String(safeDate.getMonth() + 1).padStart(2, "0"),
    safeDate.getFullYear()
  ].join("/");
}

function extractThermalFeeDetails(feeLabel){
  const raw = String(feeLabel || "").trim();
  if(!raw) return { fee: "Minerval", tranche: "", section: "" };

  const sectionMatch = raw.match(/\(([^)]+)\)\s*$/);
  const section = sectionMatch ? sectionMatch[1].trim() : "";
  const withoutSection = sectionMatch ? raw.slice(0, sectionMatch.index).trim() : raw;
  const trancheMatch = withoutSection.match(/\b([123](?:re|e)?\s+tranche)\b/i);
  const tranche = trancheMatch ? trancheMatch[1].replace(/\s+/g, " ") : "";
  let fee = withoutSection;
  if(trancheMatch){
    fee = withoutSection.slice(0, trancheMatch.index).replace(/[—-]\s*$/, "").trim();
  }

  return {
    fee: fee || raw,
    tranche,
    section
  };
}

function thermalReceiptNumber(receiptNo){
  const raw = String(receiptNo || "").trim();
  if(!raw) return "-";
  return raw;
}

function shouldPrintThermalMonthLine(data, feeDetails){
  // Source de vérité : le document de reçu immuable (figé à la finalisation).
  if(data?.receiptDoc && typeof data.receiptDoc.showMonth === "boolean"){
    return data.receiptDoc.showMonth;
  }
  // Cycle explicite prioritaire (frais annuel/paiement unique ou article = pas de mois).
  const explicitCycle = data?.feeBillingCycle || data?.billingCycle || "";
  if(explicitCycle){
    return normalizeFeeBillingCycle(explicitCycle) === "monthly";
  }
  const feeMeta =
    findFeeTypeById(data?.feeTypeId) ||
    findFeeTypeByCode(data?.feeTypeCode) ||
    findFeeTypeByLabel(data?.feeType);
  if(feeMeta){
    return normalizeFeeBillingCycle(feeMeta.billingCycle) === "monthly";
  }

  if(feeDetails?.tranche) return false;

  const feeAscii = normalizeThermalText(feeDetails?.fee || data?.feeType || "", { allowAccents: false }).toLowerCase();
  if(/\b(etat|examen|tenasosp|enrolement|bulletin|formation ipp|frais technique)\b/.test(feeAscii)){
    return false;
  }
  return true;
}

async function hydrateThermalRemainingForPrint(data){
  if(!data || typeof data !== "object") return;
  const paymentCurrency = normalizeCurrencyCode(data.currency || "USD");
  const feeMeta =
    findFeeTypeById(data?.feeTypeId) ||
    findFeeTypeByCode(data?.feeTypeCode) ||
    findFeeTypeByLabel(data?.feeType);
  const feeTypeId = String(feeMeta?.id ?? data?.feeTypeId ?? "").trim();
  const monthKey = String(data?.paidForMonth || data?.monthKey || monthLabelToYYYYMM(data?.month || "") || "").trim();
  const studentId = String(data?.studentId || "").trim();

  let remaining = Number.NaN;
  let remainingCurrency = "";
  let statusPaidSoFar = Number.NaN;

  if(studentId && feeTypeId && monthKey){
    try{
      const qs = new URLSearchParams();
      qs.set("feeTypeId", feeTypeId);
      qs.set("month", monthKey);
      const status = await apiFetch(`/api/students/${encodeURIComponent(studentId)}/status?${qs.toString()}`);
      remaining = Number(status?.remaining);
      remainingCurrency = normalizeCurrencyCode(status?.currency || paymentCurrency);
      statusPaidSoFar = Number(status?.paidSoFar);
    }catch(_){
      // Fallback to locally cached status below.
    }
  }

  if(!Number.isFinite(remaining) && selectedStudentFeeStatus){
    const selectedStatusStudentId = String(selectedStudentFeeStatus?.studentId || "").trim();
    const selectedFeeId = String(selectedStudentFeeStatus?.feeTypeId ?? "").trim();
    const selectedMonth = String(selectedStudentFeeStatus?.selectedMonth || selectedStudentFeeStatus?.nextDueMonth || "").trim();
    const sameStudent = !studentId || !selectedStatusStudentId || selectedStatusStudentId === studentId;
    const sameFee = !feeTypeId || !selectedFeeId || feeTypeId === selectedFeeId;
    const sameMonth = !monthKey || !selectedMonth || monthKey === selectedMonth;
    if(sameStudent && sameFee && sameMonth){
      remaining = Number(selectedStudentFeeStatus?.remaining);
      remainingCurrency = normalizeCurrencyCode(selectedStudentFeeStatus?.currency || paymentCurrency);
      statusPaidSoFar = Number(selectedStudentFeeStatus?.paidSoFar);
    }
  }

  if(Number.isFinite(remaining)){
    const paidNowPrimaryRaw = remainingCurrency === "CDF"
      ? Number(data.amountCDF ?? (paymentCurrency === "CDF" ? data.amountEntered : 0))
      : Number(data.amountUSD ?? (paymentCurrency === "USD" ? data.amountEntered : 0));
    const paidNowPrimary = Number.isFinite(paidNowPrimaryRaw) ? Math.max(0, paidNowPrimaryRaw) : 0;
    const isPendingLocalPayment = Boolean(data?.pendingSync);
    const statusLooksBeforeThisPayment = !isPendingLocalPayment
      && Number.isFinite(statusPaidSoFar)
      && paidNowPrimary > 0
      && (statusPaidSoFar + 0.000001) < paidNowPrimary;
    if(isPendingLocalPayment || statusLooksBeforeThisPayment){
      remaining = Math.max(0, Number(remaining || 0) - paidNowPrimary);
    }

    if(remainingCurrency === "CDF"){
      data.remainingCDF = Math.max(0, Number(remaining));
      data.remainingUSD = Number((data.remainingCDF / Number(data.rateUsed || data.fxRate || USD_TO_CDF || 1)).toFixed(2));
    } else {
      data.remainingUSD = Math.max(0, Number(remaining));
      data.remainingCDF = Math.round(data.remainingUSD * Number(data.rateUsed || data.fxRate || USD_TO_CDF || 1));
    }
    return;
  }

  if(paymentCurrency === "CDF"){
    data.remainingCDF = Number.isFinite(Number(data.remainingCDF)) ? Number(data.remainingCDF) : 0;
  } else {
    data.remainingUSD = Number.isFinite(Number(data.remainingUSD)) ? Number(data.remainingUSD) : 0;
  }
}

function buildThermalReceiptText(data){
  const WIDTH = THERMAL_RECEIPT_WIDTH;
  const lineEq = divider(WIDTH, "=");

  const printedAt = new Date();
  const dd = String(printedAt.getDate()).padStart(2,"0");
  const mm = String(printedAt.getMonth()+1).padStart(2,"0");
  const yyyy = printedAt.getFullYear();
  const hh = String(printedAt.getHours()).padStart(2,"0");
  const mi = String(printedAt.getMinutes()).padStart(2,"0");

  const currency = normalizeCurrencyCode(data.currency || "");
  const isCdf = currency === "CDF";
  const receivedUsd = Math.max(0, Number(data.amountUSDReceived || 0));
  const receivedCdf = Math.max(0, Number(data.amountCDFReceived || 0));
  const isMixed = receivedUsd > 0 && receivedCdf > 0;
  const amountPrimaryValue = Number(data.amountEntered ?? (isCdf ? data.amountCDF : data.amountUSD) ?? 0);
  const amountPrimary = isCdf
    ? `${formatThermalAmount(amountPrimaryValue)} FC`
    : `${formatThermalAmount(amountPrimaryValue)} $`;
  const legalAmountCdfValue = legalReceiptAmountInCdf(data, amountPrimaryValue, isCdf);
  const remainingPrimaryValue = isCdf ? Number(data.remainingCDF || 0) : Number(data.remainingUSD || 0);
  const restePrimary = isCdf
    ? `${formatThermalAmount(remainingPrimaryValue)} FC`
    : `${formatThermalAmount(remainingPrimaryValue)} $`;
  const resteCdfForUsd = `${formatThermalAmount(receiptUsdAmountInCdf(remainingPrimaryValue, data))} FC`;
  const remainingUsdValue = Number.isFinite(Number(data.remainingUSD))
    ? Number(data.remainingUSD)
    : Number((Number(data.remainingCDF || 0) / Number(data.rateUsed || data.fxRate || USD_TO_CDF || 1)).toFixed(2));
  const remainingCdfValue = Number.isFinite(Number(data.remainingCDF))
    ? Number(data.remainingCDF)
    : receiptUsdAmountInCdf(remainingUsdValue, data);
  const paidDateLabel = formatThermalReceiptDate(data.paidAt || data.createdAt, printedAt);
  const classLine = formatClassLevel(data.className || "", data.level || "") || "—";
  const schoolYear = String(
    data.schoolYearLabel
    || schoolYearLabelFromMonthKey(paymentMonthKey(data) || data.paidForMonth || data.monthKey || "")
    || currentSchoolYearLabel()
    || schoolYearLabelFromDateIso(data.createdAt || printedAt.toISOString())
  );
  const feeDetails = extractThermalFeeDetails(data.feeType || "");
  const showMonthPaid = shouldPrintThermalMonthLine(data, feeDetails);

  const lines = [];
  const addCenter = (text) => lines.push(...centerText(text, WIDTH));
  const addKv = (label, value, options = {}) => lines.push(...padLabelValue(label, value, WIDTH, options));

  lines.push(lineEq);

  const school = window.ecoleConfiguration || {};
  addCenter(school['school.name'] || "Etablissement scolaire");
  for(const key of ['school.city','school.address','school.phone','school.email']) {
    if(school[key]) addCenter(school[key]);
  }
  lines.push(lineEq);
  lines.push("");

  addKv("Reçu N°", thermalReceiptNumber(data.receiptNo));
  if(data.isCopy){
    addCenter("COPIE");
  }
  if(data.corrected || data?.receiptDoc?.correction){
    addCenter("CORRIGÉ");
  }
  addKv("Type", data.isCopy ? "Copie" : "Original");
  addKv("Caissier", data.cashier || "-");
  lines.push(lineEq);
  lines.push("");

  addKv("Élève", data.studentName || "-");
  addKv("Matricule", data.matricule || data.studentId || "-");
  addKv("Classe", classLine);
  addKv("Année scolaire", schoolYear);
  lines.push(lineEq);
  lines.push("");

  addKv("Frais", feeDetails.fee || data.feeType || "-");
  if(feeDetails.tranche){
    addKv("Tranche", feeDetails.tranche);
  }
  if(feeDetails.section){
    addKv("Section", feeDetails.section);
  }
  if(showMonthPaid && String(data.month || "").trim()){
    addKv("Mois payé", data.month);
  }
  lines.push(lineEq);
  lines.push("");

  if(isMixed){
    addKv("Reçu USD", `${formatThermalAmount(receivedUsd)} $`, { rightAlignValue: true });
    addKv("Reçu CDF", `${formatThermalAmount(receivedCdf)} FC`, { rightAlignValue: true });
    addKv("Taux", `1 USD = ${formatThermalAmount(Number(data.rateUsed || data.fxRate || USD_TO_CDF))} CDF`);
    addKv(isCdf ? "Total CDF" : "Total USD", amountPrimary, { rightAlignValue: true });
    addKv("Reste USD", `${formatThermalAmount(remainingUsdValue)} $`, { rightAlignValue: true });
    addKv("Reste CDF", `${formatThermalAmount(remainingCdfValue)} FC`, { rightAlignValue: true });
  } else if(isCdf){
    addKv("Montant CDF", amountPrimary, { rightAlignValue: true });
    addKv("Reste CDF", restePrimary, { rightAlignValue: true });
  } else {
    addKv("Montant USD", amountPrimary, { rightAlignValue: true });
    addKv("Reste USD", restePrimary, { rightAlignValue: true });
    addKv("Reste CDF", resteCdfForUsd, { rightAlignValue: true });
  }
  lines.push(lineEq);
  lines.push("");

  addCenter(`${formatThermalAmount(legalAmountCdfValue)} FRANCS CONGOLAIS`);
  lines.push("");
  lines.push(lineEq);
  addCenter("Merci pour votre paiement.");
  addCenter(`Payé le : ${paidDateLabel}`);
  addCenter(`Imprimé le: ${dd}/${mm}/${yyyy} ${hh}:${mi}`);
  lines.push(lineEq);

  return lines.join("\n");
}

let receiptPrintDisplayRestore = null;

function isElectronRuntime(){
  try{
    return /electron/i.test(String(navigator?.userAgent || ""));
  }catch(_){
    return false;
  }
}

function getStylesCssHref(){
  try{
    const link = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
    if(!link) return "";
    const href = String(link.getAttribute("href") || link.href || "").trim();
    if(!href) return "";
    return new URL(href, window.location.href).toString();
  }catch(_){
    return "";
  }
}

function openElectronPrintPreviewWindow({ title = "Aperçu avant impression", subtitle = "", bodyHtml = "", printBodyClass = "" } = {}){
  // In-app preview disabled: always use direct print flow.
  return false;
  if(!isElectronRuntime()) return false;
  const content = String(bodyHtml || "").trim();
  if(!content) return false;

  const previewWin = window.open("", "_blank", "width=1160,height=860");
  if(!previewWin) return false;

  const cssHref = getStylesCssHref();
  const safeTitle = esc(title);
  const safeSubtitle = esc(subtitle);
  const cssLink = cssHref ? `<link rel="stylesheet" href="${esc(cssHref)}" />` : "";
  const subtitleHtml = safeSubtitle ? `<div class="preview-subtitle">${safeSubtitle}</div>` : "";
  const bodyClassValue = String(printBodyClass || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /^[A-Za-z0-9_-]+$/.test(token))
    .join(" ");
  const bodyClassAttr = bodyClassValue ? ` class="${esc(bodyClassValue)}"` : "";
  let previewContent = content;
  if(/\bprint-single-report\b/.test(bodyClassValue)){
    previewContent = previewContent.replace(
      'class="report-doc-wrap"',
      'class="report-doc-wrap report-doc-wrap--first"'
    );
  }

  previewWin.document.open();
  previewWin.document.write(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <base href="${esc(window.location.href)}" />
    ${cssLink}
    <style>
      :root{color-scheme:light}
      html,body{margin:0;padding:0;background:#eef3fb;color:#0f172a;font-family:"Segoe UI",Arial,sans-serif}
      .preview-toolbar{
        position:sticky;top:0;z-index:20;
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:10px 14px;border-bottom:1px solid #dbe5f2;background:#fff;
      }
      .preview-title{font-weight:800;font-size:15px}
      .preview-subtitle{font-size:12px;color:#475569;margin-top:2px}
      .preview-actions{display:flex;gap:8px}
      .preview-btn{
        border:1px solid #c9d7ec;background:#fff;color:#1f4f95;
        padding:8px 12px;border-radius:10px;font-weight:700;cursor:pointer;
      }
      .preview-btn.primary{
        background:#2f6fed;color:#fff;border-color:#2f6fed;
      }
      .preview-main{padding:14px}
      .preview-paper{
        max-width:1100px;margin:0 auto;background:#fff;
        border:1px solid #dbe5f2;border-radius:12px;padding:14px;
        box-shadow:0 10px 28px rgba(14,39,79,.10);
      }
      @media print{
        html,body{background:#fff}
        .preview-toolbar{display:none !important}
        .preview-main{padding:0}
        .preview-paper{
          max-width:none;border:none;border-radius:0;padding:0;box-shadow:none;
        }
      }
    </style>
  </head>
  <body${bodyClassAttr}>
    <header class="preview-toolbar">
      <div>
        <div class="preview-title">${safeTitle}</div>
        ${subtitleHtml}
      </div>
      <div class="preview-actions">
        <button id="previewPrintBtn" class="preview-btn primary" type="button">Imprimer</button>
        <button id="previewCloseBtn" class="preview-btn" type="button">Fermer</button>
      </div>
    </header>
    <main class="preview-main">
      <section class="preview-paper">${previewContent}</section>
    </main>
    <script>
      (function(){
        const printBtn = document.getElementById("previewPrintBtn");
        const closeBtn = document.getElementById("previewCloseBtn");
        if(printBtn){ printBtn.addEventListener("click", () => window.print()); }
        if(closeBtn){ closeBtn.addEventListener("click", () => window.close()); }
      })();
    </script>
  </body>
</html>`);
  previewWin.document.close();
  previewWin.focus();
  return true;
}

function prepareReceiptPrintLayout({ thermal = false } = {}){
  document.body.classList.remove("print-single-report");
  document.body.classList.remove("print-fee-report");
  document.body.classList.remove("print-students-list");
  document.body.classList.remove("print-caisse-history");
  if(thermal){
    document.body.classList.add("print-thermal");
  } else {
    document.body.classList.remove("print-thermal");
  }

  const receiptArea = document.getElementById("receiptArea");
  if(receiptArea){
    if(receiptPrintDisplayRestore === null){
      receiptPrintDisplayRestore = receiptArea.getAttribute("style") || "";
    }
    receiptArea.style.setProperty("display", "block", "important");
  }
}

function cleanupReceiptPrintLayout(){
  const receiptArea = document.getElementById("receiptArea");
  if(receiptArea && receiptPrintDisplayRestore !== null){
    if(receiptPrintDisplayRestore){
      receiptArea.setAttribute("style", receiptPrintDisplayRestore);
    } else {
      receiptArea.removeAttribute("style");
    }
    receiptPrintDisplayRestore = null;
  }
  document.body.classList.remove("print-thermal");
}

async function printInIsolatedFrame({
  title = "Impression",
  bodyHtml = "",
  cssText = ""
} = {}){
  // Electron desktop can fail with "this app doesn't support preview"
  // when printing from a hidden iframe. Let callers fall back to window.print().
  if(isElectronRuntime()){
    return false;
  }

  const content = String(bodyHtml || "").trim();
  if(!content) return false;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  document.body.appendChild(iframe);

  const frameWin = iframe.contentWindow;
  const frameDoc = frameWin?.document;
  if(!frameWin || !frameDoc){
    iframe.remove();
    return false;
  }

  frameDoc.open();
  frameDoc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${esc(title)}</title>
    <style>
      @page { margin: 8mm; }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
      }
      ${cssText || ""}
    </style>
  </head>
  <body>${content}</body>
</html>`);
  frameDoc.close();

  await sleepMs(60);
  frameWin.focus();

  const done = new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if(finished) return;
      finished = true;
      frameWin.removeEventListener("afterprint", finish);
      window.setTimeout(() => {
        iframe.remove();
        resolve(true);
      }, 120);
    };
    frameWin.addEventListener("afterprint", finish, { once: true });
    window.setTimeout(finish, 2500);
  });

  frameWin.print();
  await done;
  return true;
}

async function waitForPrintDomUpdate(){
  // Give the browser one full paint cycle to apply print classes/style changes.
  await sleepMs(40);
  void document.body.offsetHeight;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function receiptCardHtmlSnapshot(){
  const card = document.getElementById("receiptCard");
  if(!card) return "";
  return card.outerHTML;
}

async function printReceiptViaIsolatedPreview(data){
  const cardHtml = receiptCardHtmlSnapshot();
  if(!cardHtml) return false;

  const receiptNo = String(data?.receiptNo || "").trim();
  const copyLabel = data?.isCopy ? `<div class="copy-flag">COPIE</div>` : "";
  const correctedLabel = (data?.corrected || data?.receiptDoc?.correction) ? `<div class="copy-flag">CORRIGÉ</div>` : "";
  const bodyHtml = `
    <main class="print-root">
      <div class="print-title">Reçu ${esc(receiptNo || "—")}</div>
      ${copyLabel}
      ${correctedLabel}
      ${cardHtml}
    </main>
  `;
  const cssText = `
    body{
      font-family:"Segoe UI", Arial, sans-serif;
      font-size:12px;
      line-height:1.35;
    }
    .print-root{
      width:80mm;
      max-width:80mm;
      margin:0 auto;
    }
    .print-title{
      text-align:center;
      font-weight:700;
      margin:0 0 6px 0;
    }
    .copy-flag{
      text-align:center;
      font-weight:800;
      border:1px dashed #000;
      padding:2px 6px;
      margin:0 auto 6px auto;
      width:max-content;
    }
    .receipt{
      margin:0;
      border:1px solid #000;
      border-radius:0;
      padding:8px;
      display:grid;
      grid-template-columns:1fr;
      gap:10px;
      background:#fff;
      color:#000;
    }
    .receipt h4{
      margin:0;
      text-align:center;
      font-size:14px;
    }
    .receipt small{
      color:#222;
      font-weight:600;
    }
    .kv{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
      margin-top:8px;
    }
    .line{
      height:1px;
      background:#000;
      margin:8px 0;
    }
    .qr{
      display:none !important;
    }
    .receipt-deco{
      display:none !important;
    }
    .receipt-band{
      margin:0;
      padding:0;
      background:none;
      color:#000;
    }
    .receipt-cashier-row{
      display:block;
    }
  `;
  return printInIsolatedFrame({
    title: receiptNo ? `Reçu ${receiptNo}` : "Reçu",
    bodyHtml,
    cssText
  });
}

async function printThermal(data){
  document.getElementById("thermalPre").textContent =
    buildThermalReceiptText(data);
  const thermalText = document.getElementById("thermalPre").textContent || "";
  const barcodeHtml = buildCode128SvgMarkup(data?.receiptNo || "");
  const thermalBarcode = document.getElementById("thermalBarcode");
  if(thermalBarcode) thermalBarcode.innerHTML = barcodeHtml;

  const printed = await printInIsolatedFrame({
    title: `Reçu ${esc(String(data?.receiptNo || "").trim() || "")}`.trim(),
    bodyHtml: `<pre class="thermal-pre">${esc(thermalText)}</pre>${barcodeHtml}`,
    cssText: `
      @page { size: 80mm auto; margin: 5mm; }
      html, body{
        margin:0;
        padding:0;
        background:#fff;
        color:#000;
      }
      .thermal-pre{
        margin:0;
        white-space:pre;
        font-size:12px;
        line-height:1.25;
        font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      }
      .thermal-barcode{
        margin:3mm auto 0;
        text-align:center;
        break-inside:avoid;
        page-break-inside:avoid;
      }
      .thermal-barcode svg{
        display:block;
        width:100%;
        max-width:70mm;
        height:18mm;
        margin:0 auto;
      }
      .thermal-barcode-value{
        margin-top:1mm;
        font:700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        letter-spacing:.4px;
      }
    `
  });
  if(printed) return;

  if(isElectronRuntime()){
    const previewHtml = `
      <pre style="margin:0;white-space:pre;font-size:12px;line-height:1.25;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;">${esc(thermalText)}</pre>
      ${barcodeHtml}
    `;
    const opened = openElectronPrintPreviewWindow({
      title: `Apercu avant impression - Recu ${String(data?.receiptNo || "").trim() || ""}`.trim(),
      subtitle: "Format thermique",
      bodyHtml: previewHtml
    });
    if(opened){
      return;
    }
  }

  prepareReceiptPrintLayout({ thermal: true });
  await waitForPrintDomUpdate();
  window.print();
}

function getReceiptDataFromSelectionOrPreview(){
  const selectedPayment = selectedPaymentId
    ? (receiptsApiCache.find(p => String(p.id) === String(selectedPaymentId)) || getPayments().find(p => String(p.id) === String(selectedPaymentId)))
    : null;
  if(selectedPayment) return selectedPayment;
  if(lastReceiptForPrint) return lastReceiptForPrint;

  const s = getStudentById(selectedStudentId);
  const inputCurrency = String(elCurrency.value || "USD").toUpperCase();
  const mixedPayment = inputCurrency === "MIXED";
  const tender = getPaymentTenderInputSplit();
  const currency = mixedPayment
    ? normalizeCurrencyCode(selectedStudentFeeStatus?.currency || getSelectedFeeTypeMeta()?.defaultCurrency || "USD")
    : inputCurrency;
  const fx = mixedPayment
    ? { usd: paymentTenderEquivalent(tender, "USD"), cdf: paymentTenderEquivalent(tender, "CDF") }
    : computeFx(parseInt(onlyDigits(elAmount.value) || "0", 10), currency);
  const amountEntered = mixedPayment ? (currency === "CDF" ? fx.cdf : fx.usd) : parseInt(onlyDigits(elAmount.value) || "0", 10);
  const projectedRemaining = mixedPayment ? projectedPaymentRemaining(selectedStudentFeeStatus, tender) : null;

  return {
    id: "preview",
    receiptNo: rNo.textContent?.trim() || getNextReceiptNoForUi(),
    createdAt: new Date().toISOString(),
    cashier: (rCashier.textContent || elCashier.textContent || "").trim(),
    studentId: s?.id || "N/A",
    studentName: rStudent.textContent?.trim() || s?.name || "—",
    matricule: s?.matricule || s?.id || "—",
    className: s?.className || "—",
    level: s?.level || "",
    feeType: rFee.textContent?.trim() || elFee.value,
    feeTypeId: getSelectedFeeTypeMeta()?.id ?? null,
    feeTypeCode: String(getSelectedFeeTypeMeta()?.code || "").toUpperCase(),
    feeBillingCycle: normalizeFeeBillingCycle(getSelectedFeeTypeMeta()?.billingCycle || ""),
    month: rMonth.textContent?.trim() || elMonth.value,
    monthKey: monthKeyFromLabelFR(rMonth.textContent?.trim() || elMonth.value || ""),
    paidForMonth: monthKeyFromLabelFR(rMonth.textContent?.trim() || elMonth.value || ""),
    currency,
    amountEntered,
    amountUSD: fx.usd,
    amountCDF: fx.cdf,
    amountUSDReceived: mixedPayment ? tender.usd : null,
    amountCDFReceived: mixedPayment ? tender.cdf : null,
    remainingUSD: projectedRemaining?.usd ?? null,
    remainingCDF: projectedRemaining?.cdf ?? null,
    paymentMethod: mixedPayment ? "mixed_cash" : null,
    mode: rMode.textContent?.trim() || DEFAULT_PAYMENT_MODE,
    note: "",
    rateUsed: USD_TO_CDF
  };
}

async function chooseLocalPrinter({ forcePrompt = false } = {}){
  const saved = localStorage.getItem(KEY_LOCAL_PRINTER);
  const printersRes = await apiFetch("/api/print/printers");
  const printers = Array.isArray(printersRes.printers) ? printersRes.printers : [];
  const defaultPrinter = printersRes.defaultPrinter || "";
  const isVirtualPrinter = (name) => {
    const value = String(name || "").trim().toLowerCase();
    if(!value) return false;
    return /(print\s*to\s*pdf|save\s*as\s*pdf|microsoft\s*print\s*to\s*pdf|adobe\s*pdf|pdfcreator|pdf24|foxit\s*pdf|xps|onenote|fax)/i.test(value);
  };
  const printerList = printers.filter((name) => !isVirtualPrinter(name));
  const looksReceiptPrinter = (name) => /tm-|receipt|pos|usb|eco ?250|e-?pos/i.test(String(name || ""));
  const looksEco250 = (name) => /(^|\b)eco\s*250(\b|$)|eco250/i.test(String(name || ""));

  if(!printerList.length){
    return "";
  }

  const exactEco250 =
    printerList.find((p) => /^eco\s*250\s*usb$/i.test(String(p || "").trim())) ||
    printerList.find((p) => /^eco\s*250$/i.test(String(p || "").trim())) ||
    printerList.find((p) => /^usb\s*receipt\s*printer$/i.test(String(p || "").trim()));
  const receiptPreferred = exactEco250 || printerList.find((p) => looksEco250(p)) || printerList.find((p) => looksReceiptPrinter(p)) || "";
  const preferred =
    receiptPreferred ||
    (defaultPrinter && printerList.includes(defaultPrinter) ? defaultPrinter : "") ||
    printerList[0];

  if(!forcePrompt && saved && printerList.includes(saved) && !isVirtualPrinter(saved)){
    const savedLooksStaleThermal = /stmicro|e-58s/i.test(saved) && saved !== preferred;
    const savedLooksReceipt = looksReceiptPrinter(saved);
    const preferredLooksReceipt = looksReceiptPrinter(preferred);
    const savedLooksWrongType = !savedLooksReceipt && preferredLooksReceipt && saved !== preferred;
    if(!savedLooksStaleThermal && !savedLooksWrongType){
      return saved;
    }
  }

  let picked = "";
  if(forcePrompt){
    try{
      if(typeof window !== "undefined" && typeof window.prompt === "function"){
        picked = window.prompt(
          `Imprimantes detectees:\n${printerList.join("\n")}\n\nEntrez le nom de l'imprimante EPOS:`,
          preferred
        ) || "";
      }
    }catch(_){
      picked = "";
    }
  }
  const printer = (picked || preferred).trim();
  if(printer){
    localStorage.setItem(KEY_LOCAL_PRINTER, printer);
  }
  return printer;
}

async function printViaLocalAgent(data, { forcePrompt = false } = {}){
  const printer = await chooseLocalPrinter({ forcePrompt });
  if(!printer){
    const err = new Error("Aucune imprimante thermique detectee. Utilisez l'aperçu puis Imprimer > Microsoft Print to PDF pour creer un PDF.");
    err.status = 400;
    throw err;
  }
  if(/(print\s*to\s*pdf|save\s*as\s*pdf|microsoft\s*print\s*to\s*pdf|adobe\s*pdf|pdfcreator|pdf24|foxit\s*pdf|xps|onenote|fax)/i.test(String(printer || ""))){
    const err = new Error("L'impression locale brute n'est pas compatible avec les imprimantes PDF/XPS/Fax. Utilisez l'aperçu pour generer un PDF valide.");
    err.status = 400;
    throw err;
  }
  const cutMode = /eco\s*250|eco250|usb\s*receipt\s*printer/i.test(String(printer || ""))
    ? "GSVA"
    : THERMAL_ESCPOS_CUT_MODE_DEFAULT;
  const text = buildThermalReceiptText(data);
  return apiFetch("/api/print/receipt", {
    method: "POST",
    body: JSON.stringify({
      text,
      printer,
      copies: 1,
      allowExtendedChars: THERMAL_ALLOW_EXTENDED_CHARS,
      codePage: THERMAL_ESCPOS_CODE_PAGE,
      cutMode,
      barcodeValue: String(data?.receiptNo || "").trim()
    })
  });
}

function persistPrintedReceiptMeta(data, nextPrintCount){
  const count = normalizePrintCount(nextPrintCount);
  const patch = {
    printCount: count,
    isCopy: count >= 1
  };
  Object.assign(data, patch);

  const ref = {
    id: data?.id || null,
    serverId: data?.serverId || null,
    reservedPaymentId: data?.reservedPaymentId || null,
    clientRequestId: data?.clientRequestId || null,
    receiptNo: data?.receiptNo || null
  };

  patchPaymentSyncState(ref, patch);

  if(Array.isArray(receiptsApiCache) && receiptsApiCache.length){
    const match = paymentMatchPredicateFactory(ref);
    let changed = false;
    const next = receiptsApiCache.map((row) => {
      if(!match(row)) return row;
      changed = true;
      return { ...row, ...patch };
    });
    if(changed){
      setReceiptsApiCache(next);
    }
  }

  if(lastReceiptForPrint){
    const match = paymentMatchPredicateFactory(ref);
    if(match(lastReceiptForPrint)){
      lastReceiptForPrint = { ...lastReceiptForPrint, ...patch };
    }
  }
}

function setPrintStatus(message = "", variant = "active"){
  if(!elPrintStatus) return;
  if(printStatusClearTimer){
    clearTimeout(printStatusClearTimer);
    printStatusClearTimer = null;
  }
  const text = String(message || "").trim();
  elPrintStatus.textContent = text;
  elPrintStatus.classList.remove("active", "success", "error");
  if(!text) return;
  const kind = String(variant || "active").toLowerCase();
  if(kind === "success") elPrintStatus.classList.add("success");
  else if(kind === "error") elPrintStatus.classList.add("error");
  else elPrintStatus.classList.add("active");
}

function clearPrintStatusAfter(delayMs = 2800){
  if(!elPrintStatus) return;
  if(printStatusClearTimer){
    clearTimeout(printStatusClearTimer);
    printStatusClearTimer = null;
  }
  printStatusClearTimer = window.setTimeout(() => {
    printStatusClearTimer = null;
    setPrintStatus("");
  }, Math.max(500, Number(delayMs) || 0));
}

function setPrintButtonBusy(isBusy, { label = "Envoi...", statusMessage = "", statusVariant = "active" } = {}){
  printInProgress = Boolean(isBusy);
  if(elPrint){
    elPrint.disabled = printInProgress;
    elPrint.classList.toggle("is-loading", printInProgress);
    elPrint.textContent = printInProgress
      ? (String(label || "Envoi...").trim() || "Envoi...")
      : PRINT_BUTTON_LABEL_DEFAULT;
  }
  if(statusMessage){
    setPrintStatus(statusMessage, statusVariant);
  }
}

async function printCurrentReceipt(forcedData = null, options = {}){
  const isEventArg = forcedData && typeof forcedData === "object" && typeof forcedData.preventDefault === "function";
  const manualData = !isEventArg && forcedData && typeof forcedData === "object" ? forcedData : null;
  const skipServerLookup = Boolean(options?.skipServerLookup);
  const skipRemainingRefresh = Boolean(options?.skipRemainingRefresh);
  const forceCopy = Boolean(options?.forceCopy);

  const baseData = manualData || getReceiptDataFromSelectionOrPreview();
  if(!baseData) return;
  if(baseData.pendingSync || !baseData.id || String(baseData.id) === "preview"){
    showInAppPopup("Ce paiement n'est pas encore confirmé par le serveur. Impression bloquée pour éviter un reçu sans paiement enregistré.");
    showToast("Impression bloquée — paiement non enregistré", { variant: "error", duration: 4200 });
    return;
  }
  if(printInProgress){
    showToast("Impression deja en cours, veuillez patienter.", { duration: 1800 });
    return;
  }

  const data = { ...baseData };
  data.printCount = normalizePrintCount(data.printCount);
  data.isCopy = forceCopy || data.printCount >= 1;

  let markOnServer = false;
  setPrintButtonBusy(true, {
    label: "Envoi...",
    statusMessage: "Envoi du recu a l'imprimante...",
    statusVariant: "active"
  });

  try{
    if(!skipServerLookup && data.id && data.id !== "preview"){
      try{
        const row = await apiFetch(`/api/payments/${encodeURIComponent(data.id)}`);
        const receipt = normalizeReceiptApiRow(row);
        const mergedKnownPrintCount = Math.max(
          normalizePrintCount(data.printCount),
          normalizePrintCount(receipt.printCount)
        );
        Object.assign(data, {
          id: receipt.id,
          receiptNo: receipt.receiptNo,
          createdAt: receipt.createdAt,
          paidAt: receipt.paidAt || receipt.createdAt,
          cashier: receipt.cashier,
          studentId: receipt.studentId,
          studentName: receipt.studentName,
          matricule: receipt.matricule,
          className: receipt.className,
          level: receipt.level,
          feeType: receipt.feeType,
          feeTypeId: receipt.feeTypeId,
          feeTypeCode: receipt.feeTypeCode,
          month: receipt.month,
          monthKey: receipt.monthKey,
          paidForMonth: receipt.paidForMonth,
          currency: receipt.currency,
          amountEntered: receipt.amountEntered,
          amountUSD: receipt.amountUSD,
          amountCDF: receipt.amountCDF,
          amountUSDReceived: receipt.amountUSDReceived,
          amountCDFReceived: receipt.amountCDFReceived,
          mode: receipt.mode,
          receiptDoc: receipt.receiptDoc,
          corrected: receipt.corrected,
          latestCorrection: receipt.latestCorrection,
          printCount: mergedKnownPrintCount,
          isCopy: forceCopy || mergedKnownPrintCount >= 1
        });
      }catch(err){
        const detail = String(err?.message || err || "serveur indisponible");
        throw new Error(`Impossible de vérifier le paiement sur le serveur (${detail}). Impression annulée.`);
      }
    }

    if(!data.pendingSync && data.id && data.id !== "preview"){
      try{
        const mark = await apiFetch(`/api/payments/${encodeURIComponent(data.id)}/print`, { method:"POST" });
        const knownLocal = normalizePrintCount(data.printCount);
        const previousCount = normalizePrintCount(mark?.previousPrintCount);
        const currentCount = normalizePrintCount(mark?.currentPrintCount);
        data.isCopy = forceCopy || Math.max(previousCount, knownLocal) >= 1;
        data.printCount = Math.max(currentCount, knownLocal + 1);
        markOnServer = true;
      }catch(_){
        data.isCopy = forceCopy || normalizePrintCount(data.printCount) >= 1;
      }
    }

    if(forceCopy){
      data.isCopy = true;
      data.printCount = Math.max(1, normalizePrintCount(data.printCount));
    }

    if(!skipRemainingRefresh){
      await hydrateThermalRemainingForPrint(data);
    }

    updateReceiptPreview({
      receiptNo: data.receiptNo,
      dateTime: new Date(data.createdAt || Date.now()),
      student: { name: data.studentName, className: formatClassLevel(data.className, data.level) },
      fee: data.feeType,
      feeTypeId: data.feeTypeId ?? null,
      feeTypeCode: data.feeTypeCode || "",
      month: data.month,
      amount: Number(data.amountEntered || 0),
      currency: String(data.currency || "USD").toUpperCase(),
      amountUSDReceived: data.amountUSDReceived,
      amountCDFReceived: data.amountCDFReceived,
      remainingUSD: data.remainingUSD,
      remainingCDF: data.remainingCDF,
      mode: data.mode || DEFAULT_PAYMENT_MODE,
      cashier: data.cashier || (elCashier?.textContent || "")
    });

    try{
      const localPrintMeta = await printViaLocalAgent(data);
      if(localPrintMeta?.usedAsciiFallback){
        showToast("Impression en mode ASCII (accents limites).", { duration: 3200 });
      }
      const nextCount = markOnServer
        ? normalizePrintCount(data.printCount)
        : normalizePrintCount(data.printCount) + 1;
      persistPrintedReceiptMeta(data, nextCount);
      setPrintStatus("Recu envoye a l'imprimante.", "success");
      clearPrintStatusAfter(3000);
      showToast("Recu envoye a l'imprimante locale.", { variant: "success", duration: 2800 });
      return;
    }catch(localPrintErr){
      const firstMsg = (localPrintErr && localPrintErr.message) ? localPrintErr.message : String(localPrintErr || "");
      console.warn("Impression locale echouee (1er essai):", firstMsg);
      setPrintStatus("Nouvelle tentative d'envoi...", "active");
      localStorage.removeItem(KEY_LOCAL_PRINTER);
      try{
        const retryPrintMeta = await printViaLocalAgent(data, { forcePrompt: true });
        if(retryPrintMeta?.usedAsciiFallback){
          showToast("Impression en mode ASCII (accents limites).", { duration: 3200 });
        }
        const nextCount = markOnServer
          ? normalizePrintCount(data.printCount)
          : normalizePrintCount(data.printCount) + 1;
        persistPrintedReceiptMeta(data, nextCount);
        setPrintStatus("Recu envoye a l'imprimante.", "success");
        clearPrintStatusAfter(3000);
        showToast("Recu envoye a l'imprimante locale.", { variant: "success", duration: 2800 });
        return;
      }catch(retryErr){
        console.warn("Impression locale echouee (2e essai):", retryErr?.message || retryErr);
      }
      console.warn("Impression locale indisponible, bascule vers apercu thermique.", localPrintErr);
      const statusCode = Number(localPrintErr?.status || 0);
      if(statusCode === 401 || statusCode === 403){
        showToast("Session expiree: reconnexion requise pour l'impression directe.", { duration: 3600 });
      } else {
        showToast("Impression locale indisponible, ouverture de l'apercu thermique.", { duration: 3200 });
      }
      setPrintStatus("Impression locale indisponible. Ouverture de l'apercu...", "error");
    }

    await printThermal(data);
    const nextCount = markOnServer
      ? normalizePrintCount(data.printCount)
      : normalizePrintCount(data.printCount) + 1;
    persistPrintedReceiptMeta(data, nextCount);
    setPrintStatus("Apercu d'impression ouvert.", "success");
    clearPrintStatusAfter(3200);
  }catch(err){
    console.error("Echec de l'impression du recu :", err);
    const msg = (err && err.message) ? err.message : String(err || "Erreur inconnue");
    setPrintStatus("Echec de l'impression.", "error");
    clearPrintStatusAfter(4500);
    showInAppPopup(`Impossible d'imprimer le recu: ${msg}`);
  } finally {
    setPrintButtonBusy(false);
  }
}

window.addEventListener("afterprint", () => {
  cleanupReceiptPrintLayout();
});
async function confirmPayment(){
  if(paymentConfirmationInFlight) return;
  if(!hasRole("admin", "caissier", "comptable")){
    showInAppPopup("Action non autorisée pour votre rôle.");
    return;
  }
  const s = getPaymentEligibleStudentById(selectedStudentId);
  if(!s){
    showInAppPopup("Eleve inactif ou introuvable.");
    return;
  }

  if(!isPaymentFeeChoiceConfirmed()){
    showInAppPopup("Choisissez le frais demandé avant de confirmer le paiement.");
    document.getElementById("paymentFeeSearch")?.focus();
    return;
  }
  const feeType = normalizeFeeName(elFee.value);
  const selectedFeeMeta = getSelectedFeeTypeMeta();
  // Use only the already-cached status — no network call here.
  // loadSelectedStudentFeeStatus() fires when the student is selected,
  // so the cache is already warm by the time the cashier clicks Confirm.
  const liveStatus = selectedStudentFeeStatus || null;
  const serverRequiredMonth = monthLabelForActiveSchoolYear(liveStatus?.nextDueMonth || "");
  const feeCycle = normalizeFeeBillingCycle(liveStatus?.feeTypeBillingCycle || selectedFeeMeta?.billingCycle || "monthly");
  if(feeCycle === "annual" && Boolean(liveStatus?.annualPaymentLocked)){
    const lockMonth = monthLabelForActiveSchoolYear(liveStatus?.annualPaymentLockMonth || "");
    const msg = lockMonth
      ? `Ce frais annuel est deja paye pour cette annee scolaire (${lockMonth}).`
      : "Ce frais annuel est deja paye pour cette annee scolaire.";
    showInAppPopup(msg);
    return;
  }
  if(Boolean(liveStatus?.tranchePrerequisiteBlocked)){
    showInAppPopup(tranchePrerequisiteLockMessage(liveStatus));
    return;
  }
  const shouldLockMonth = Boolean(serverRequiredMonth) && (feeCycle === "annual" || Number(liveStatus?.remaining || 0) > 0);
  if(shouldLockMonth){
    if(elMonth.value !== serverRequiredMonth){
      if(feeCycle === "annual"){
        showInAppPopup(`Ce type de frais est annuel. Le mois est verrouillé sur: ${serverRequiredMonth}.`);
      } else {
        showInAppPopup(`Ce paiement doit d'abord couvrir le prochain mois disponible: ${serverRequiredMonth}.`);
      }
      setSchoolMonthSelectValue(elMonth, serverRequiredMonth);
      return;
    }
  }

  const inputCurrency = String(elCurrency.value || "USD").toUpperCase();
  const mixedPayment = inputCurrency === "MIXED";
  const tender = getPaymentTenderInputSplit();
  if(mixedPayment && (!(tender.usd > 0) || !(tender.cdf > 0))){
    showInAppPopup("Pour un paiement mixte, saisissez un montant USD et un montant CDF.");
    return;
  }
  const rawSingleAmount = parseInt(onlyDigits(elAmount.value)||"0",10);
  if(!mixedPayment && !(rawSingleAmount > 0)){
    showInAppPopup("Veuillez saisir un montant valide.");
    return;
  }
  const liveStatusCurrency = normalizeCurrencyCode(liveStatus?.currency || selectedFeeMeta?.defaultCurrency || inputCurrency);
  const currency = mixedPayment ? liveStatusCurrency : inputCurrency;
  const fx = mixedPayment
    ? {
        usd: paymentTenderEquivalent(tender, "USD"),
        cdf: paymentTenderEquivalent(tender, "CDF")
      }
    : computeFx(rawSingleAmount, currency);
  const amountEntered = mixedPayment
    ? (currency === "CDF" ? Number(fx.cdf || 0) : Number(fx.usd || 0))
    : rawSingleAmount;
  const limit = getSelectedFeeAmountLimitForInputCurrency();
  const amountForLimit = mixedPayment ? paymentTenderEquivalent(tender, limit?.statusCurrency || liveStatusCurrency) : amountEntered;
  if(limit && amountForLimit > (Number(limit.maxInputAmount || 0) + 0.000001)){
    const maxLabel = limit.statusCurrency === "USD"
      ? formatUSD(limit.maxInputAmount)
      : formatMoney(limit.maxInputAmount, "CDF");
    showInAppPopup(`Montant trop élevé pour ce mois. Solde maximum: ${maxLabel}.`);
    enforceAmountLimitForSelectedMonth({ notify: false });
    validateForm();
    return;
  }

  const liveRemainingBefore = Number(liveStatus?.remaining);
  const paidInStatusCurrency = liveStatusCurrency === "CDF"
    ? Number(fx.cdf || 0)
    : Number(fx.usd || 0);
  const canEstimateRemaining = Number.isFinite(liveRemainingBefore);
  const estimatedRemainingPrimary = canEstimateRemaining
    ? Math.max(0, liveRemainingBefore - paidInStatusCurrency)
    : Number.NaN;
  let estimatedRemainingUSD = Number.NaN;
  let estimatedRemainingCDF = Number.NaN;
  if(canEstimateRemaining){
    if(liveStatusCurrency === "CDF"){
      estimatedRemainingCDF = estimatedRemainingPrimary;
      estimatedRemainingUSD = +((estimatedRemainingPrimary || 0) / (Number(USD_TO_CDF) || 1)).toFixed(2);
    } else {
      estimatedRemainingUSD = estimatedRemainingPrimary;
      estimatedRemainingCDF = Math.round((estimatedRemainingPrimary || 0) * (Number(USD_TO_CDF) || 1));
    }
  }
  const selectedMonthLabel = String(elMonth?.value || "");
  const selectedMonthKey = monthKeyFromLabelFR(selectedMonthLabel || "");
  consumePrefetchedReceiptReservation();

  let payment = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
    clientRequestId: crypto?.randomUUID ? crypto.randomUUID() : `PAYREQ-${Date.now()}-${Math.random()}`,
    receiptNo: null,
    createdAt: new Date().toISOString(),
    cashier: elCashier.textContent.trim(),
    reservedPaymentId: null,

    // NOTE: this must be the real API id if you want /api/payments to work
    studentId: s.id,
    studentName: s.name,
    matricule: s.matricule || s.id,
    className: s.className,
    level: s.level,

    feeType,
    feeTypeCode: String(selectedFeeMeta?.code || "").toUpperCase(),
    feeTypeId: selectedFeeMeta?.id ?? null,
    month: selectedMonthLabel,
    monthKey: selectedMonthKey,
    paidForMonth: selectedMonthKey,
    schoolYearStartYear: normalizeSchoolYearStartYear(getActiveSchoolYearStartYear()),
    pendingSync: true,
    syncError: "",
    syncAttempts: 0,
    syncLastErrorAt: null,

    currency,
    amountEntered,
    amountUSD: fx.usd,
    amountCDF: fx.cdf,
    amountUSDReceived: mixedPayment ? tender.usd : null,
    amountCDFReceived: mixedPayment ? tender.cdf : null,
    paymentMethod: mixedPayment ? "mixed_cash" : null,
    printCount: 0,
    isCopy: false,
    ...(Number.isFinite(estimatedRemainingUSD) ? { remainingUSD: estimatedRemainingUSD } : {}),
    ...(Number.isFinite(estimatedRemainingCDF) ? { remainingCDF: estimatedRemainingCDF } : {}),

    mode: DEFAULT_PAYMENT_MODE,
    note: elNote.value.trim(),
    rateUsed: USD_TO_CDF
  };

  // Keep a durable local copy for recovery, but never print it until the API
  // has returned the server payment row. This prevents a paper receipt from
  // existing for a payment that the central database rejected or never saw.
  setPaymentConfirmationBusy(true);
  upsertPaymentCache(payment);
  upsertPaymentCreateOutboxEvent(payment);
  syncReceiptSeqFromPaymentsCache();
  setTopReceiptPreview();

  try{
    const registeredPayment = await syncSinglePaymentCreate(payment);
    payment = {
      ...payment,
      ...registeredPayment,
      pendingSync: false,
      syncError: "",
      ...(Number.isFinite(estimatedRemainingUSD) ? { remainingUSD: estimatedRemainingUSD } : {}),
      ...(Number.isFinite(estimatedRemainingCDF) ? { remainingCDF: estimatedRemainingCDF } : {})
    };
  }catch(err){
    const message = String(err?.message || err || "Erreur inconnue");
    patchPaymentSyncState(payment, {
      pendingSync: true,
      syncError: message,
      syncAttempts: Number(payment.syncAttempts || 0) + 1,
      syncLastErrorAt: new Date().toISOString()
    });
    setPaymentConfirmationBusy(false);
    showInAppPopup(
      `Paiement non confirmé par le serveur. Aucun reçu n'a été imprimé. La tentative reste en attente de synchronisation; ne saisissez pas ce paiement une deuxième fois. Détail: ${message}`
    );
    showToast("Paiement non enregistré — reçu non imprimé", { variant: "error", duration: 5000 });
    updateSyncBadge();
    return;
  }

  setPaymentConfirmationBusy(false);
  prefetchNextReceiptNo({ force: true }).catch(() => {});

  lastReceiptForPrint = payment;
  if(canEstimateRemaining){
    const nextStatus = {
      ...(liveStatus || {}),
      remaining: estimatedRemainingPrimary,
      currency: liveStatusCurrency,
      paidSoFar: Number(liveStatus?.paidSoFar || 0) + paidInStatusCurrency
    };
    if(feeCycle === "annual"){
      const lockMonthKey = monthKeyFromLabelFR(elMonth?.value || "") || String(liveStatus?.annualPaymentLockMonth || "").trim() || null;
      nextStatus.annualPaymentLocked = Number(estimatedRemainingPrimary || 0) <= 0.000001;
      nextStatus.annualPaymentLockMonth = nextStatus.annualPaymentLocked ? lockMonthKey : (lockMonthKey || null);
    }
    selectedStudentFeeStatus = nextStatus;
    updatePaymentStatusHint(nextStatus);
    if(elSelBal){
      elSelBal.textContent = mixedPayment
        ? `${formatUSD(estimatedRemainingUSD)} / ${formatMoney(estimatedRemainingCDF, "CDF")}`
        : (liveStatusCurrency === "CDF"
            ? formatMoney(estimatedRemainingPrimary, "CDF")
            : formatUSD(estimatedRemainingPrimary));
    }
    syncMonthSelectAvailability(s);
  }

  updateReceiptPreview({
    receiptNo: payment.receiptNo,
    dateTime: new Date(payment.createdAt),
    student: { name: payment.studentName, className: formatClassLevel(payment.className, payment.level) },
    fee: getLiveFeeLabel(payment),
    feeTypeId: payment.feeTypeId ?? null,
    feeTypeCode: payment.feeTypeCode || "",
    month: payment.month,
    amount: payment.amountEntered,
    currency: payment.currency,
    amountUSDReceived: payment.amountUSDReceived,
    amountCDFReceived: payment.amountCDFReceived,
    remainingUSD: payment.remainingUSD,
    remainingCDF: payment.remainingCDF,
    mode: payment.mode || DEFAULT_PAYMENT_MODE,
    cashier: payment.cashier
  });

  elAmount.value = "";
  if(elMixedCdfAmount) elMixedCdfAmount.value = "";
  elNote.value = "";
  validateForm();

  resetPaymentFeeChoice();
  validateForm();

  showToast(`Paiement enregistré (Reçu ${payment.receiptNo})`, { variant: "success", duration: 2200 });

  // Printing is allowed only after the API returned the registered payment.
  const skipAutoPrintForFee = Boolean(selectedFeeMeta?.skipAutoPrint || selectedFeeMeta?.skip_auto_print);
  if(skipAutoPrintForFee){
    showToast("Impression automatique ignorée pour ce frais.", { variant: "info", duration: 2200 });
  }else{
    setTimeout(() => {
      printCurrentReceipt(payment, {
        skipRemainingRefresh: canEstimateRemaining
      }).catch((err) => {
        console.error("Auto-print failed:", err?.message || err);
      });
    }, 0);
  }

  // The payment is already registered. Refresh the dependent views without
  // delaying the cashier's next operation.
  setTimeout(async () => {
    if(!isPaymentUiInteractionActive()){
      renderTopDailyBalance();
      if(viewDashboard?.classList?.contains("active")) renderDashboard();
      if(viewReports?.classList?.contains("active")) scheduleReportsRender(120);
    } else if(viewReports?.classList?.contains("active")){
      scheduleReportsRender(260);
    }

    if(String(selectedStudentId || "") === String(s.id || "") && viewPayment?.classList?.contains("active")){
      loadSelectedStudentFeeStatus({ applyMonthDefault: false }).catch(() => null);
    }

    if(studentProfileModal && studentProfileModal.style.display !== "none" && String(studentProfileState?.studentId || "") === String(s.id || "")){
      loadStudentProfile(s.id, { open: false }).catch(() => {});
    }
    if(viewReceipts?.classList?.contains("active")){
      loadReceiptsFromApi().finally(() => renderReceiptsTable());
    }

    scheduleLiveRefresh({ force: false, debounceMs: 450 });
  }, 0);
}
