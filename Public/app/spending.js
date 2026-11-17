/***************
 * Spending events
 ***************/
const DEFAULT_SPENDING_CATEGORY = "Depense";
const COLLECTION_SPENDING_CATEGORY = `${STATE_PAID_SPENDING_PREFIX}Collection DG`;
async function createSpendingEntry({
  dateIso,
  category,
  description,
  amount,
  currency,
  appliesToMonth = null,
  caisseBoxKey = "",
  availableByCurrency = null
} = {}){
  const date = normalizeLooseDateToISO(dateIso) || toDateISO(new Date());
  const cleanCategory = String(category || DEFAULT_SPENDING_CATEGORY).trim() || DEFAULT_SPENDING_CATEGORY;
  const cleanDescription = String(description || "").trim();
  const amountValue = Number(amount);
  const cur = normalizeCurrencyCode(currency || "USD");
  const activeSchoolYearStartYear = normalizeSchoolYearStartYear(getActiveSchoolYearStartYear());
  const selectedMonthValue = String(appliesToMonth || "").trim();
  const selectedMonthLabel = isSchoolMonthLabel(selectedMonthValue)
    ? selectedMonthValue
    : String(spMonth?.value || dashMonth?.value || repMonthSel?.value || getDefaultSchoolMonthLabel());
  const appliesToMonthKey = (/^\d{4}-\d{2}$/.test(selectedMonthValue) ? selectedMonthValue : "")
    || monthKeyFromLabelFR(selectedMonthLabel)
    || spendingTargetMonthKey({ schoolYearStartYear: activeSchoolYearStartYear, date });

  if(!cleanDescription){
    showInAppPopup("Description requise.");
    return false;
  }
  if(!Number.isFinite(amountValue) || amountValue <= 0){
    showInAppPopup("Montant invalide.");
    return false;
  }
  if(!appliesToMonthKey || !monthKeyBelongsToSchoolYear(appliesToMonthKey, activeSchoolYearStartYear)){
    showInAppPopup("Mois imputé invalide pour l'année scolaire active.");
    return false;
  }

  if(availableByCurrency && typeof availableByCurrency === "object"){
    const available = cur === "CDF"
      ? Number(availableByCurrency.cdf || 0)
      : Number(availableByCurrency.usd || 0);
    if(!(available > 0)){
      const curLabel = cur === "CDF" ? "CDF" : "USD";
      showInAppPopup(`Depense refusee: solde ${curLabel} insuffisant (0).`);
      return false;
    }
    if(amountValue > (available + 1e-9)){
      const maxLabel = cur === "CDF"
        ? `${formatIntSpaced(Math.max(0, Math.round(available)))} CDF`
        : formatUSD(Math.max(0, available));
      showInAppPopup(`Depense refusee: montant superieur au solde caisse. Maximum disponible: ${maxLabel}.`);
      return false;
    }
  }

  // In offline mode, we can only validate against local cached balance.
  // Generic spendings use the minerval caisse; explicit caisse spendings use their selected box.
  if(!apiReachable || !navigator.onLine){
    const safeCaisseBoxKey = String(caisseBoxKey || "").trim();
    const localBalance = safeCaisseBoxKey
      ? (() => {
          const snapshot = getCaisseBoxSnapshots(date).find((row) => row.key === safeCaisseBoxKey);
          return {
            netUSD: Number(snapshot?.net?.usd || 0),
            netCDF: Number(snapshot?.net?.cdf || 0)
          };
        })()
      : getLocalTuitionBalanceUpToDate(date);
    const available = cur === "CDF"
      ? Number(localBalance.netCDF || 0)
      : Number(localBalance.netUSD || 0);
    if(!(available > 0)){
      const curLabel = cur === "CDF" ? "CDF" : "USD";
      showInAppPopup(`Depense refusee: solde ${curLabel} insuffisant (0).`);
      return false;
    }
    if(amountValue > (available + 1e-9)){
      const maxLabel = cur === "CDF"
        ? `${formatIntSpaced(Math.max(0, Math.round(available)))} CDF`
        : formatUSD(Math.max(0, available));
      showInAppPopup(`Depense refusee: montant superieur au solde. Maximum disponible: ${maxLabel}.`);
      return false;
    }
  }

  const tempId = crypto?.randomUUID ? crypto.randomUUID() : `SP-${Date.now()}`;
  const item = {
    id: tempId,
    date,
    month: monthLabelFromDateISO(date),
    appliesToMonth: appliesToMonthKey,
    category: cleanCategory,
    description: cleanDescription,
    amount: amountValue,
    currency: cur,
    fxRate: USD_TO_CDF,
    caisseBoxKey: String(caisseBoxKey || "").trim() || null,
    schoolYearStartYear: activeSchoolYearStartYear,
    createdByUsername: currentUser?.username || null,
    cashier: currentUser?.username || "-",
    createdAt: new Date().toISOString(),
    pendingSync: true
  };
  upsertSpendingCache(item);

  spendingVisibleCount = SPENDING_LIST_STEP;
  renderSpendingTable();
  renderReports();
  renderDashboard();
  if(viewCaisse?.classList?.contains("active")) renderCaisse();

  try{
    const serverItem = await apiFetch("/api/spending", {
      method: "POST",
      body: JSON.stringify({
        clientTempId: tempId,
        date,
        category: cleanCategory,
        amount: amountValue,
        currency: cur,
        note: cleanDescription,
        fxRate: USD_TO_CDF,
        caisseBoxKey: String(caisseBoxKey || "").trim() || null,
        appliesToMonth: appliesToMonthKey,
        schoolYearStartYear: activeSchoolYearStartYear
      })
    });
    removeSpendingFromCache(tempId);
    upsertSpendingCache({
      ...serverItem,
      description: serverItem.description || serverItem.note || cleanDescription,
      appliesToMonth: serverItem.appliesToMonth || appliesToMonthKey,
      cashier: serverItem.createdByUsername || serverItem.cashier || "-",
      month: monthLabelFromDateISO(serverItem.date),
      pendingSync: false
    });
    renderSpendingTable();
    renderReports();
    renderDashboard();
    if(viewCaisse?.classList?.contains("active")) renderCaisse();
  }catch(err){
    const status = Number(err?.status || 0);
    const code = String(err?.payload?.code || "");
    const isPermanent = status === 400 || status === 403 || status === 404 || status === 409 || status === 422;
    const isBalanceError = status === 409 && code === "SPENDING_INSUFFICIENT_BALANCE";
    if(isPermanent){
      removeSpendingFromCache(tempId);
      spendingVisibleCount = SPENDING_LIST_STEP;
      renderSpendingTable();
      renderReports();
      renderDashboard();
      if(viewCaisse?.classList?.contains("active")) renderCaisse();
      if(isBalanceError){
        const avail = Number(err?.payload?.available || 0);
        const errorCurrency = String(err?.payload?.currency || cur || "USD").toUpperCase();
        const maxLabel = errorCurrency === "CDF"
          ? `${formatIntSpaced(Math.max(0, Math.round(avail)))} CDF`
          : formatUSD(Math.max(0, avail));
        showInAppPopup(`Depense refusee: solde insuffisant. Maximum disponible: ${maxLabel}.`);
      }else{
        showInAppPopup(String(err?.message || err?.payload?.error || "Depense refusee."));
      }
      return false;
    }
    queueOutboxEvent("SPENDING_CREATE", {
      clientTempId: tempId,
      date,
      category: cleanCategory,
      amount: amountValue,
      currency: cur,
      note: cleanDescription,
      fxRate: USD_TO_CDF,
      caisseBoxKey: String(caisseBoxKey || "").trim() || null,
      appliesToMonth: appliesToMonthKey,
      schoolYearStartYear: activeSchoolYearStartYear
    });
  }
  return true;
}

function restoreSpendingEntryFormState({ focus = "amount" } = {}){
  if(spDate){
    if(!String(spDate.value || "").trim()){
      spDate.value = fmtDateFrLong(new Date());
    }
    spDate.readOnly = true;
    spDate.disabled = false;
  }
  if(spMonth) spMonth.disabled = false;
  if(spCurrency) spCurrency.disabled = false;
  if(spAmount) spAmount.disabled = false;
  if(spDesc) spDesc.disabled = false;
  requestAnimationFrame(() => {
    const target = focus === "description" ? spDesc : spAmount;
    if(target && viewSpending?.classList?.contains("active")){
      target.focus();
    }
  });
}

spAddBtn.addEventListener("click", async () => {
  const date = toDateISO(new Date());
  const category = DEFAULT_SPENDING_CATEGORY;
  const description = String(spDesc.value || "").trim();
  const amount = Number(String(spAmount.value || "").replace(/\s+/g, "").replace(",", "."));
  const currency = spCurrency.value || "USD";
  const appliesToMonth = String(spMonth?.value || dashMonth?.value || repMonthSel?.value || getDefaultSchoolMonthLabel());

  if(spDate){
    const dateObj = new Date(date);
    if(Number.isFinite(dateObj.getTime())) spDate.value = fmtDateFrLong(dateObj);
  }

  const done = await createSpendingEntry({
    dateIso: date,
    category,
    description,
    amount,
    currency,
    appliesToMonth
  });
  if(!done){
    restoreSpendingEntryFormState({
      focus: !String(spDesc?.value || "").trim() ? "description" : "amount"
    });
    return;
  }

  spAmount.value = "";
  spDesc.value = "";
  if(spDate){
    const dateObj = new Date(date);
    if(Number.isFinite(dateObj.getTime())) spDate.value = fmtDateFrLong(dateObj);
  }
  restoreSpendingEntryFormState({ focus: "amount" });
});

if(spCollectionBtn){
  spCollectionBtn.addEventListener("click", async () => {
    const date = toDateISO(new Date());
    const descriptionInput = String(spDesc.value || "").trim();
    const description = descriptionInput || "Collection DG";
    const amount = Number(String(spAmount.value || "").replace(/\s+/g, "").replace(",", "."));
    const currency = spCurrency.value || "USD";
    const appliesToMonth = String(spMonth?.value || dashMonth?.value || repMonthSel?.value || getDefaultSchoolMonthLabel());

    if(spDate){
      const dateObj = new Date(date);
      if(Number.isFinite(dateObj.getTime())) spDate.value = fmtDateFrLong(dateObj);
    }

    const confirmed = await showAppConfirm({
      title: "Collection DG",
      message: "Enregistrer cette sortie comme collection DG ? Elle diminuera la caisse, mais ne comptera pas comme dépense dans les rapports.",
      okText: "Enregistrer collection",
      cancelText: "Annuler",
      okClass: "primary"
    });
    if(!confirmed){
      restoreSpendingEntryFormState({ focus: "amount" });
      return;
    }

    const done = await createSpendingEntry({
      dateIso: date,
      category: COLLECTION_SPENDING_CATEGORY,
      description,
      amount,
      currency,
      appliesToMonth
    });
    if(!done){
      restoreSpendingEntryFormState({
        focus: !String(spDesc?.value || "").trim() ? "description" : "amount"
      });
      return;
    }

    spAmount.value = "";
    spDesc.value = "";
    restoreSpendingEntryFormState({ focus: "amount" });
  });
}

spSearch.addEventListener("input", debounce(() => {
  spendingVisibleCount = SPENDING_LIST_STEP;
  renderSpendingTable();
}, 120));
if(spFilterCategory){
  spFilterCategory.addEventListener("change", () => {
    spendingVisibleCount = SPENDING_LIST_STEP;
    renderSpendingTable();
  });
}
spFrom.addEventListener("change", () => {
  spendingVisibleCount = SPENDING_LIST_STEP;
  renderSpendingTable();
});
spTo.addEventListener("change", () => {
  spendingVisibleCount = SPENDING_LIST_STEP;
  renderSpendingTable();
});
async function deleteSpendingEntryById(id, { restoreFocus = true } = {}){
  if(!canDeleteSpending()){
    showInAppPopup("Suppression de depense reservee a admin.");
    if(restoreFocus) restoreSpendingEntryFormState({ focus: "amount" });
    return false;
  }
  const current = getSpendings().find(s => String(s.id) === String(id));
  if(!current) return false;
  const confirmed = await showAppConfirm({
    title: "Supprimer depense",
    message: "Supprimer cette depense ?",
    okText: "Supprimer",
    cancelText: "Annuler",
    okClass: "danger"
  });
  if(!confirmed){
    if(restoreFocus) restoreSpendingEntryFormState({ focus: "amount" });
    return false;
  }
  const spendingSchoolYear = normalizeSchoolYearStartYear(current?.schoolYearStartYear);
  const deletePath = spendingSchoolYear
    ? `/api/spending/${encodeURIComponent(id)}?schoolYearStartYear=${encodeURIComponent(String(spendingSchoolYear))}`
    : `/api/spending/${encodeURIComponent(id)}`;
  removeSpendingFromCache(id);
  // If it was only local/pending, also remove its pending create event.
  const nextQueue = getOutboxEvents().filter((evt) => {
    if(evt.type !== "SPENDING_CREATE") return true;
    return String(evt.payload?.clientTempId || evt.payload?.id || "") !== String(id);
  });
  saveOutboxEvents(nextQueue);
  if(!current.pendingSync){
    apiFetch(deletePath, { method:"DELETE" })
      .catch(() => queueOutboxEvent("SPENDING_DELETE", { id, schoolYearStartYear: spendingSchoolYear || null }));
  }
  renderSpendingTable();
  renderReports();
  renderDashboard();
  renderTopDailyBalance();
  if(viewCaisse?.classList?.contains("active")) renderCaisse();
  if(restoreFocus) restoreSpendingEntryFormState({ focus: "amount" });
  return true;
}
spTbody.addEventListener("click", async (e) => {
  const del = e.target.closest("button[data-sp-delete]");
  if(del){
    const id = del.getAttribute("data-sp-delete");
    await deleteSpendingEntryById(id, { restoreFocus: true });
    return;
  }
  const more = e.target.closest("button[data-sp-more]");
  if(more){
    spendingVisibleCount += SPENDING_LIST_STEP;
    renderSpendingTable();
    return;
  }
  const less = e.target.closest("button[data-sp-less]");
  if(less){
    spendingVisibleCount = SPENDING_LIST_STEP;
    renderSpendingTable();
  }
});

if(caisseHistoryTbody){
  caisseHistoryTbody.addEventListener("click", async (e) => {
    const del = e.target.closest("button[data-caisse-sp-delete]");
    if(!del) return;
    const id = del.getAttribute("data-caisse-sp-delete");
    await deleteSpendingEntryById(id, { restoreFocus: false });
  });
}

if(caisseGrid){
  caisseGrid.addEventListener("click", (e) => {
    const boxBtn = e.target.closest("button[data-caisse-box]");
    if(!boxBtn) return;
    const key = String(boxBtn.getAttribute("data-caisse-box") || "").trim();
    if(!key) return;
    openCaisseSpendModal(key);
  });
}
if(caisseSpendSubmit){
  caisseSpendSubmit.addEventListener("click", () => {
    submitCaisseSpendFromModal();
  });
}
if(caisseSpendClose){
  caisseSpendClose.addEventListener("click", closeCaisseSpendModal);
}
if(caisseSpendModal){
  caisseSpendModal.addEventListener("click", (e) => {
    if(e.target === caisseSpendModal) closeCaisseSpendModal();
  });
}
if(caisseSpendAmount){
  caisseSpendAmount.addEventListener("input", () => {
    const digits = onlyDigits(caisseSpendAmount.value);
    caisseSpendAmount.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const statusText = String(caisseSpendStatus?.textContent || "").trim();
    if(statusText === "Description requise." || statusText === "Montant invalide."){
      restoreCaisseSpendStatusHint();
    }
  });
}
if(caisseSpendKind){
  caisseSpendKind.addEventListener("change", () => {
    restoreCaisseSpendStatusHint();
  });
}
if(caisseSpendDescription){
  caisseSpendDescription.addEventListener("input", () => {
    const statusText = String(caisseSpendStatus?.textContent || "").trim();
    if(statusText === "Description requise." || statusText === "Montant invalide."){
      restoreCaisseSpendStatusHint();
    }
  });
}

if(caisseTransferTbody){
  caisseTransferTbody.addEventListener("click", async (e) => {
    const del = e.target.closest("button[data-caisse-transfer-delete]");
    if(!del) return;
    const id = del.getAttribute("data-caisse-transfer-delete");
    await deleteCaisseTransferById(id);
  });
}

[caisseTransferMode, caisseTransferSourceBox, caisseTransferCounterpartyBox, caisseTransferSourceCurrency, caisseTransferCounterCurrency, caisseTransferMonth].forEach((el) => {
  if(!el) return;
  el.addEventListener("change", () => {
    refreshCaisseTransferPreview();
  });
});

if(caisseTransferAmount){
  caisseTransferAmount.addEventListener("input", () => {
    const digits = onlyDigits(caisseTransferAmount.value);
    caisseTransferAmount.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    refreshCaisseTransferPreview();
  });
}

if(caisseTransferRate){
  caisseTransferRate.addEventListener("input", () => {
    const digits = onlyDigits(caisseTransferRate.value);
    caisseTransferRate.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    refreshCaisseTransferPreview();
  });
}

if(caisseTransferNote){
  caisseTransferNote.addEventListener("input", refreshCaisseTransferPreview);
}

if(caisseTransferSubmit){
  caisseTransferSubmit.addEventListener("click", () => {
    submitCaisseTransferEntry();
  });
}

