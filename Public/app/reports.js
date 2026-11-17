/***************
 * Reports logic (offline)
 ***************/
function toCDF(amount, currency){
  const fx = computeFx(amount, currency);
  return fx.cdf;
}
function toUSD(amount, currency){
  const fx = computeFx(amount, currency);
  return fx.usd;
}

function parseCDFInput(el){
  const digits = onlyDigits(el.value);
  el.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return parseInt(digits || "0", 10);
}

function expectedForStudent(s, scope){
  if(scope !== "level-fee") return 0;
  const defaultDueUSD = Number(defaultDueForLevelClass(s?.level, s?.className) || 0);
  // CAS SOCIAL = 0$ (exonération totale, tous niveaux).
  if(hasCasSocialMarker(s)) return 0;

  // per-student override if present (USD)
  if (typeof s.monthlyDueUSD === "number") return s.monthlyDueUSD;
  if (typeof s.monthlyDue === "number") return s.monthlyDue;

  // fallback by level/class (USD)
  return defaultDueUSD;
}

function hasCasSocialMarker(student){
  if(!student) return false;
  const note = String(student.studentNote || "").trim();
  if(/cas\s*social/i.test(note)) return true;
  const due = Number(student.monthlyDueUSD ?? student.monthlyDue ?? NaN);
  return Number.isFinite(due) && due <= 0;
}

function isCasSocialStudent(student){
  return hasCasSocialMarker(student);
}

function buildOweRows(month, feeType, scope){
  const payments = getPayments();
  const targetMonthKey = monthKeyFromLabelFR(month || "");
  const targetIsTuition = isTuitionFeeValue(feeType) || String(feeType || "").toUpperCase() === "TUITION";
  const relevant = payments.filter((p) => {
    if(String(paymentMonthKey(p) || "") !== String(targetMonthKey || "")) return false;
    if(targetIsTuition){
      return isTuitionPaymentRecord(p);
    }
    return normalizeFeeName(p?.feeType) === normalizeFeeName(feeType);
  });

  const paidUSDByStudent = new Map();
  for(const p of relevant){
    const usd = Number(p.amountUSD ?? toUSD(p.amountEntered, p.currency) ?? 0);
    paidUSDByStudent.set(p.studentId, (paidUSDByStudent.get(p.studentId) || 0) + usd);
  }

  const rows = [];
  for(const s of students){
    if(!isValidClassForReports(s.level, s.className)) continue;
    const dueUSD = expectedForStudent(s, scope);
    const paidUSD = paidUSDByStudent.get(s.id) || 0;
    const remainingUSD = Math.max(0, dueUSD - paidUSD);

    rows.push({
      studentId: s.id,
      name: s.name,
      matricule: s.matricule || s.id,
      className: s.className,
      level: s.level,
      dueUSD,
      paidUSD,
      remainingUSD
    });
  }
  return rows;
}

function getDashboardPayments(month){
  const all = getPayments().filter((p) => isTuitionPaymentRecord(p));
  const mk = monthKeyFromLabelFR(month || "");
  return all.filter(p => String(paymentMonthKey(p) || "") === String(mk || ""));
}

function buildDashboardRevenueSeries(){
  const monthKeys = SCHOOL_MONTH_LABELS_FR
    .map((label) => monthKeyFromLabelFR(label))
    .filter((mk) => /^\d{4}-\d{2}$/.test(String(mk || "")));
  const totals = new Map(monthKeys.map((mk) => [mk, 0]));
  for(const p of getPayments()){
    const mk = paymentMonthKey(p) || paymentCreatedMonthKey(p);
    if(!totals.has(mk)) continue;
    const usd = Number(p.amountUSD ?? toUSD(p.amountEntered, p.currency) ?? 0);
    if(!Number.isFinite(usd)) continue;
    totals.set(mk, Number(totals.get(mk) || 0) + usd);
  }
  return monthKeys.map((mk) => ({
    monthKey: mk,
    label: `${monthLabelShortFrFromMonthKey(mk)} ${String(mk).slice(2, 4)}`,
    totalUSD: Number(totals.get(mk) || 0)
  }));
}

function formatUSDCompact(value){
  return `$${formatIntSpaced(Math.round(Number(value || 0)))}`;
}

function setDashRevenueCollapsed(next){
  dashRevenueCollapsed = Boolean(next);
  if(dashRevenuePanel){
    dashRevenuePanel.classList.toggle("is-collapsed", dashRevenueCollapsed);
  }
  if(dashRevenueToggle){
    dashRevenueToggle.setAttribute("aria-expanded", dashRevenueCollapsed ? "false" : "true");
    dashRevenueToggle.textContent = dashRevenueCollapsed ? "Afficher" : "Masquer";
  }
}

function renderDashboardRevenueChart(){
  if(!dashRevenueChart) return;
  const series = buildDashboardRevenueSeries();
  if(!series.length){
    dashRevenueChart.innerHTML = `<div class="tiny">Aucune donnée disponible.</div>`;
    return;
  }

  const schoolYearLabel = schoolYearLabelFromStartYear(getActiveSchoolYearStartYear());
  const totalSchoolYear = series.reduce((sum, r) => sum + Number(r.totalUSD || 0), 0);
  const maxValue = Math.max(...series.map((r) => Number(r.totalUSD || 0)), 0);
  const yMax = maxValue > 0 ? maxValue : 100;
  const yTicks = 5;
  const width = 920;
  const height = 290;
  const margin = { top: 16, right: 16, bottom: 44, left: 86 };
  const plotW = Math.max(1, width - margin.left - margin.right);
  const plotH = Math.max(1, height - margin.top - margin.bottom);
  const stepX = series.length > 1 ? plotW / (series.length - 1) : plotW;
  const points = series.map((r, idx) => {
    const ratio = Math.max(0, Math.min(1, Number(r.totalUSD || 0) / yMax));
    return {
      ...r,
      x: margin.left + (idx * stepX),
      y: margin.top + ((1 - ratio) * plotH)
    };
  });
  const areaPath = points.length
    ? `M ${margin.left} ${margin.top + plotH} L ${points.map((p) => `${p.x} ${p.y}`).join(" L ")} L ${margin.left + plotW} ${margin.top + plotH} Z`
    : "";
  const linePath = points.length
    ? `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`
    : "";
  dashRevenueChart.innerHTML = `
    <div class="dash-revenue-meta">Année scolaire ${esc(schoolYearLabel)} • Total: <strong>${esc(formatUSD(totalSchoolYear))}</strong></div>
    <svg class="dash-revenue-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Graphique des revenus mensuels">
      ${Array.from({ length: yTicks + 1 }).map((_, i) => {
        const ratio = i / yTicks;
        const y = margin.top + (plotH * ratio);
        const value = yMax * (1 - ratio);
        return `
          <line class="dash-revenue-grid" x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}"></line>
          <text class="dash-revenue-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${esc(formatUSDCompact(value))}</text>
        `;
      }).join("")}
      <line class="dash-revenue-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}"></line>
      <line class="dash-revenue-axis" x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}"></line>
      ${areaPath ? `<path class="dash-revenue-area" d="${areaPath}"></path>` : ""}
      ${linePath ? `<path class="dash-revenue-line" d="${linePath}"></path>` : ""}
      ${points.map((p) => `
        <circle
          class="dash-revenue-point"
          cx="${p.x}"
          cy="${p.y}"
          r="4"
          tabindex="0"
          role="button"
          data-month-label="${esc(monthLabelFromMonthKeyWithYear(p.monthKey))}"
          data-amount-label="${esc(formatUSD(p.totalUSD))}"
          aria-label="${esc(`${monthLabelFromMonthKeyWithYear(p.monthKey)}: ${formatUSD(p.totalUSD)}`)}"
        >
          <title>${esc(monthLabelFromMonthKeyWithYear(p.monthKey))}: ${esc(formatUSD(p.totalUSD))}</title>
        </circle>
      `).join("")}
      ${points.map((p) => {
        return `<text class="dash-revenue-label x" x="${p.x}" y="${margin.top + plotH + 18}" text-anchor="middle">${esc(p.label)}</text>`;
      }).join("")}
    </svg>
    <div class="dash-revenue-tooltip" hidden></div>
  `;

  const tooltip = dashRevenueChart.querySelector(".dash-revenue-tooltip");
  const pointEls = Array.from(dashRevenueChart.querySelectorAll(".dash-revenue-point"));
  if(!tooltip || !pointEls.length) return;

  const hideTooltip = () => {
    tooltip.hidden = true;
    tooltip.classList.remove("is-visible");
    tooltip.textContent = "";
  };

  const showTooltipForPoint = (el) => {
    const monthLabel = String(el.getAttribute("data-month-label") || "").trim();
    const amountLabel = String(el.getAttribute("data-amount-label") || "").trim();
    const cx = Number(el.getAttribute("cx") || 0);
    const cy = Number(el.getAttribute("cy") || 0);
    const leftPct = Math.max(5, Math.min(95, (cx / width) * 100));
    const topPct = Math.max(8, Math.min(94, (cy / height) * 100));
    tooltip.textContent = `${monthLabel}: ${amountLabel}`;
    tooltip.style.left = `${leftPct}%`;
    tooltip.style.top = `${topPct}%`;
    tooltip.hidden = false;
    tooltip.classList.add("is-visible");
  };

  for(const pointEl of pointEls){
    pointEl.addEventListener("mouseenter", () => showTooltipForPoint(pointEl));
    pointEl.addEventListener("mouseleave", hideTooltip);
    pointEl.addEventListener("focus", () => showTooltipForPoint(pointEl));
    pointEl.addEventListener("blur", hideTooltip);
    pointEl.addEventListener("click", (e) => {
      e.stopPropagation();
      showTooltipForPoint(pointEl);
    });
    pointEl.addEventListener("keydown", (e) => {
      if(e.key === "Escape") hideTooltip();
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        showTooltipForPoint(pointEl);
      }
    });
  }

  // Replace the handler on refresh instead of accumulating listeners.
  dashRevenueChart.onclick = (e) => {
    if(e.target && e.target.closest && e.target.closest(".dash-revenue-point")) return;
    hideTooltip();
  };
}

function renderDashboard(){
  if(!dashMonth) return;
  const month = dashMonth.value;
  const relevant = getDashboardPayments(month);
  const activeStudents = (Array.isArray(students) ? students : [])
    .filter((student) => isStudentActiveRecord(student));
  const paidUSDByStudent = new Map();
  for(const p of relevant){
    const usd = Number(p.amountUSD ?? toUSD(p.amountEntered, p.currency) ?? 0);
    paidUSDByStudent.set(p.studentId, (paidUSDByStudent.get(p.studentId) || 0) + usd);
  }

  const levels = ["Maternelle", "Primaire", "Secondaire"];
  const levelAgg = {};
  for(const lvl of levels){
    levelAgg[lvl] = { total: 0, paid: 0, dueUSD: 0, paidUSD: 0, remainingUSD: 0 };
  }

  let paidCount = 0;
  let totalDueUSD = 0;
  let totalRemainUSD = 0;

  for(const s of activeStudents){
    const dueUSD = expectedForStudent(s, "level-fee");
    const paidUSD = paidUSDByStudent.get(s.id) || 0;
    const remainingUSD = Math.max(0, dueUSD - paidUSD);
    if(remainingUSD <= 0) paidCount += 1;

    totalDueUSD += dueUSD;
    totalRemainUSD += remainingUSD;

    const lvl = levels.includes(s.level) ? s.level : "Secondaire";
    levelAgg[lvl].total += 1;
    if(remainingUSD <= 0) levelAgg[lvl].paid += 1;
    levelAgg[lvl].dueUSD += dueUSD;
    levelAgg[lvl].paidUSD += paidUSD;
    levelAgg[lvl].remainingUSD += remainingUSD;
  }

  dashTotalStudents.textContent = String(activeStudents.length);
  dashPaidStudents.textContent = String(paidCount);
  dashExpectedUSD.textContent = formatUSD(totalDueUSD);
  dashExpectedCDF.textContent = `${formatIntSpaced(Math.round(totalDueUSD * USD_TO_CDF))} CDF`;
  dashRemainUSD.textContent = formatUSD(totalRemainUSD);
  dashRemainCDF.textContent = `${formatIntSpaced(Math.round(totalRemainUSD * USD_TO_CDF))} CDF`;

  dashBars.innerHTML = levels.map(lvl => {
    const a = levelAgg[lvl];
    const pct = a.dueUSD > 0 ? Math.max(0, Math.min(100, Math.round((a.paidUSD / a.dueUSD) * 100))) : 0;
    return `
        <div class="bar-row">
          <div><strong>${esc(lvl)}</strong></div>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <div>${formatUSD(a.paidUSD)}</div>
        </div>
      `;
  }).join("");

  dashLevelTbody.innerHTML = "";
  for(const lvl of levels){
    const a = levelAgg[lvl];
    const pct = a.total ? Math.round((a.paid / a.total) * 100) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${esc(lvl)}</strong></td>
      <td>${a.total}</td>
      <td>${a.paid}</td>
      <td>${formatPctBadge(pct)}</td>
      <td><strong>${formatUSD(a.remainingUSD)}</strong></td>
    `;
    dashLevelTbody.appendChild(tr);
  }

  if(typeof window.renderDashboardOverview === "function"){
    window.renderDashboardOverview({ activeStudents, paidCount, totalDueUSD, totalRemainUSD, month });
  }
  renderDashboardRevenueChart();
  setDashRevenueCollapsed(dashRevenueCollapsed);

  if(elTopPeriod){
    const activeMonthKey = monthKeyFromLabelFR(dashMonth?.value || getDefaultSchoolMonthLabel());
    elTopPeriod.textContent = monthLabelFromMonthKeyWithYear(activeMonthKey || currentCalendarMonthKey());
  }
  renderTopDailyBalance();
}
function reportDataForSelectedType(){
  const monthKey = selectedReportMonthKey();
  const month = monthLabelFromMonthKey(monthKey || "") || getCurrentMonthLabel();
  const tuitionLabel = getTuitionFeeDisplayLabel();
  const rows = buildOweRows(month, "TUITION", "level-fee");
  const monthReceipts = getPayments().filter((p) =>
    isCashPaymentRecord(p) && String(paymentMonthKey(p) || "") === String(monthKey || "")
  );
  const tuitionReceipts = monthReceipts.filter((p) => isTuitionPaymentRecord(p));
  const monthSpendings = getSchoolYearScopedSpendings().filter((s) => String(spendingTargetMonthKey(s) || "") === String(monthKey || ""));
  const minervalSpendings = monthSpendings.filter((s) =>
    caisseBoxKeyFromSpending(s, { includeImplicitMinerval: true }) === "minerval"
  );
  const tuitionReceiptTotals = tuitionReceipts.reduce((sum, p) => {
    const part = paymentAmountSplit(p);
    sum.usd += Number(part.usd || 0);
    sum.cdf += Number(part.cdf || 0);
    return sum;
  }, { usd: 0, cdf: 0 });
  // Résumé du mois : on EXCLUT les dépenses de type "Paid" (catégorie « Paid - … »),
  // comme la clôture de caisse. Seules les dépenses en espèces (type "Depense") sont comptées.
  const monthSpendingTotals = minervalSpendings.reduce((sum, s) => {
    if(isStatePaidSpending(s)) return sum;
    const part = spendingAmountSplit(s);
    sum.usd += Number(part.usd || 0);
    sum.cdf += Number(part.cdf || 0);
    return sum;
  }, { usd: 0, cdf: 0 });
  const totalReceivedUSD = tuitionReceiptTotals.usd;
  const totalReceivedCDF = tuitionReceiptTotals.cdf;
  const totalSpendingUSD = monthSpendingTotals.usd;
  const totalSpendingCDF = monthSpendingTotals.cdf;
  const levels = ["Maternelle", "Primaire", "Secondaire"];
  const levelAgg = {};
  for(const lvl of levels){
    levelAgg[lvl] = { total: 0, paidCount: 0, dueUSD: 0, paidUSD: 0, remainUSD: 0 };
  }
  for(const r of rows){
    const lvl = levels.includes(r.level) ? r.level : "Secondaire";
    levelAgg[lvl].total += 1;
    if(r.paidUSD > 0) levelAgg[lvl].paidCount += 1;
    levelAgg[lvl].dueUSD += r.dueUSD;
    levelAgg[lvl].paidUSD += r.paidUSD;
    levelAgg[lvl].remainUSD += r.remainingUSD;
  }
  const totalDueUSD = rows.reduce((s, r) => s + r.dueUSD, 0);
  const totalPaidUSD = rows.reduce((s, r) => s + r.paidUSD, 0);
  const totalRemainUSD = rows.reduce((s, r) => s + r.remainingUSD, 0);
  const netUSD = totalReceivedUSD - totalSpendingUSD;
  const netCDF = totalReceivedCDF - totalSpendingCDF;
  return {
    month,
    monthKey,
    tuitionLabel,
    rows,
    levels,
    levelAgg,
    totalDueUSD,
    totalPaidUSD,
    totalReceivedUSD,
    totalReceivedCDF,
    totalTuitionReceivedUSD: tuitionReceiptTotals.usd,
    totalTuitionReceivedCDF: tuitionReceiptTotals.cdf,
    totalRemainUSD,
    totalSpendingUSD,
    totalSpendingCDF,
    netUSD,
    netCDF
  };
}

function buildLevelReportDataFromDashboardMonth(monthKey, baseData = null){
  const monthLabel = monthLabelFromMonthKey(monthKey || "") || getCurrentMonthLabel();
  const relevant = getDashboardPayments(monthLabel);
  const paidUSDByStudent = new Map();
  for(const p of relevant){
    const usd = Number(p.amountUSD ?? toUSD(p.amountEntered, p.currency) ?? 0);
    paidUSDByStudent.set(p.studentId, (paidUSDByStudent.get(p.studentId) || 0) + usd);
  }

  const levels = ["Maternelle", "Primaire", "Secondaire"];
  const levelAgg = {};
  for(const lvl of levels){
    levelAgg[lvl] = { total: 0, paidCount: 0, dueUSD: 0, paidUSD: 0, remainUSD: 0 };
  }

  const rows = [];
  for(const s of students){
    const dueUSD = Number(expectedForStudent(s, "level-fee") || 0);
    const paidUSD = Number(paidUSDByStudent.get(s.id) || 0);
    const remainingUSD = Math.max(0, dueUSD - paidUSD);
    const lvl = levels.includes(s.level) ? s.level : "Secondaire";

    rows.push({
      studentId: s.id,
      name: s.name || s.fullName || "—",
      matricule: s.matricule || s.id || "—",
      className: s.className || "—",
      level: lvl,
      dueUSD,
      paidUSD,
      remainingUSD,
      status: remainingUSD <= 0 ? "À jour" : (paidUSD > 0 ? "Partiel" : "En retard")
    });

    levelAgg[lvl].total += 1;
    if(remainingUSD <= 0) levelAgg[lvl].paidCount += 1;
    levelAgg[lvl].dueUSD += dueUSD;
    levelAgg[lvl].paidUSD += paidUSD;
    levelAgg[lvl].remainUSD += remainingUSD;
  }

  const totalDueUSD = rows.reduce((s, r) => s + Number(r.dueUSD || 0), 0);
  const totalPaidUSD = rows.reduce((s, r) => s + Number(r.paidUSD || 0), 0);
  const totalRemainUSD = rows.reduce((s, r) => s + Number(r.remainingUSD || 0), 0);
  const totalReceivedUSD = Number(baseData?.totalReceivedUSD || 0);
  const totalReceivedCDF = Number(baseData?.totalReceivedCDF || 0);
  const totalTuitionReceivedUSD = Number(baseData?.totalTuitionReceivedUSD || 0);
  const totalTuitionReceivedCDF = Number(baseData?.totalTuitionReceivedCDF || 0);
  const totalSpendingUSD = Number(baseData?.totalSpendingUSD || 0);
  const totalSpendingCDF = Number(baseData?.totalSpendingCDF || 0);

  return {
    ...(baseData || {}),
    month: monthLabel,
    monthKey: monthKeyFromLabelFR(monthLabel) || String(monthKey || ""),
    tuitionLabel: baseData?.tuitionLabel || getTuitionFeeDisplayLabel(),
    rows,
    levels,
    levelAgg,
    totalDueUSD,
    totalPaidUSD,
    totalReceivedUSD,
    totalReceivedCDF,
    totalTuitionReceivedUSD,
    totalTuitionReceivedCDF,
    totalRemainUSD,
    totalSpendingUSD,
    totalSpendingCDF,
    netUSD: totalReceivedUSD - totalSpendingUSD,
    netCDF: totalReceivedCDF - totalSpendingCDF
  };
}

function applySummaryApiRowsToReportData(baseData, summaryApi){
  if(!summaryApi || !Array.isArray(summaryApi.rows)) return baseData;
  const rows = summaryApi.rows.map((r) => ({
    studentId: r.id,
    name: r.fullName || "—",
    matricule: r.matricule || r.id || "—",
    className: r.className || "—",
    level: fmtReportLevelLabel(r.level || ""),
    dueUSD: Number(r.due || 0),
    paidUSD: Number(r.paid || 0),
    remainingUSD: Number(r.remaining || 0),
    status: String(r.status || "")
  }));
  const levels = ["Maternelle", "Primaire", "Secondaire"];
  const levelAgg = {};
  for(const lvl of levels){
    levelAgg[lvl] = { total: 0, paidCount: 0, dueUSD: 0, paidUSD: 0, remainUSD: 0 };
  }
  for(const row of rows){
    const lvl = levels.includes(row.level) ? row.level : "Secondaire";
    const dueUSD = Number(row.dueUSD || 0);
    const paidUSD = Number(row.paidUSD || 0);
    const remainingUSD = Math.max(0, Number(row.remainingUSD || 0));
    levelAgg[lvl].total += 1;
    if(dueUSD > 0 && paidUSD > 0) levelAgg[lvl].paidCount += 1;
    levelAgg[lvl].dueUSD += dueUSD;
    levelAgg[lvl].paidUSD += paidUSD;
    levelAgg[lvl].remainUSD += remainingUSD;
  }
  const totalDueUSD = rows.reduce((s, r) => s + Number(r.dueUSD || 0), 0);
  const totalPaidUSD = rows.reduce((s, r) => s + Number(r.paidUSD || 0), 0);
  const totalRemainUSD = rows.reduce((s, r) => s + Number(r.remainingUSD || 0), 0);
  const totalReceivedUSD = Number(baseData?.totalReceivedUSD || 0);
  const totalReceivedCDF = Number(baseData?.totalReceivedCDF || 0);
  const totalTuitionReceivedUSD = Number(summaryApi?.tuition?.receivedUSD ?? baseData?.totalTuitionReceivedUSD ?? 0);
  const totalTuitionReceivedCDF = Number(summaryApi?.tuition?.receivedCDF ?? baseData?.totalTuitionReceivedCDF ?? 0);
  const totalSpendingUSD = Number(baseData?.totalSpendingUSD || 0);
  const totalSpendingCDF = Number(baseData?.totalSpendingCDF || 0);
  return {
    ...baseData,
    rows,
    levels,
    levelAgg,
    totalDueUSD,
    totalPaidUSD,
    totalReceivedUSD,
    totalReceivedCDF,
    totalTuitionReceivedUSD,
    totalTuitionReceivedCDF,
    totalRemainUSD,
    totalSpendingUSD,
    totalSpendingCDF,
    netUSD: totalReceivedUSD - totalSpendingUSD,
    netCDF: totalReceivedCDF - totalSpendingCDF
  };
}

function schoolYearLabelFromMonthKey(monthKey){
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m){
    return currentSchoolYearLabel();
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const startYear = month >= 9 ? year : (year - 1);
  return `${startYear}-${startYear + 1}`;
}

function schoolYearLabelFromDateIso(dateIso){
  const m = String(dateIso || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  if(!m) return schoolYearLabelFromMonthKey(selectedReportMonthKey());
  return schoolYearLabelFromMonthKey(`${m[1]}-${m[2]}`);
}

function normalizeEnrollmentSchoolYearStart(student){
  const direct = Number(student?.schoolYearStartYear);
  if(Number.isFinite(direct)) return Math.floor(direct);
  const monthKey = getStudentEnrollmentMonthKey(student);
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if(!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if(!(Number.isFinite(year) && Number.isFinite(month))) return null;
  return month >= 9 ? year : (year - 1);
}

function compareEnrollmentClassMeta(a, b){
  const rankA = classOrderRankForLateReport(a?.level || "", a?.baseClass || "");
  const rankB = classOrderRankForLateReport(b?.level || "", b?.baseClass || "");
  if(rankA.levelRank !== rankB.levelRank) return rankA.levelRank - rankB.levelRank;
  if(rankA.classRank !== rankB.classRank) return rankA.classRank - rankB.classRank;
  const codeA = String(a?.classCode || "").trim();
  const codeB = String(b?.classCode || "").trim();
  if(codeA && codeB && codeA !== codeB){
    return codeA.localeCompare(codeB, "fr", { numeric: true, sensitivity: "base" });
  }
  if(codeA && !codeB) return -1;
  if(!codeA && codeB) return 1;
  const classCmp = String(a?.classDisplay || a?.className || "").localeCompare(String(b?.classDisplay || b?.className || ""), "fr", { numeric: true, sensitivity: "base" });
  if(classCmp !== 0) return classCmp;
  return String(a?.level || "").localeCompare(String(b?.level || ""), "fr", { numeric: true, sensitivity: "base" });
}

function buildEnrolledStudentsReportRows(targetStartYear = getActiveSchoolYearStartYear(), sourceStudents = null){
  const rows = [];
  const list = Array.isArray(sourceStudents) ? sourceStudents : (Array.isArray(students) ? students : []);
  for(const student of list){
    if(!student) continue;
    const rawClassName = String(student.className || "").trim();
    const className = rawClassName || "-";
    const level = fmtReportLevelLabel(student.level || "") || "-";
    const enrolledAtIso = toDateISO(student.createdAt || student.created_at || "");
    const enrollmentMonthKey = getStudentEnrollmentMonthKey(student);
    const schoolYearStartYear = normalizeEnrollmentSchoolYearStart(student);
    if(Number.isFinite(Number(targetStartYear)) && Number.isFinite(Number(schoolYearStartYear)) && Number(schoolYearStartYear) !== Number(targetStartYear)){
      continue;
    }
    const parsedClass = rawClassName ? splitReportClassBaseCode(rawClassName) : { baseClass: "-", code: "" };
    rows.push({
      studentId: student.id,
      matricule: student.matricule || student.id || "-",
      name: student.name || student.fullName || "-",
      className,
      classDisplay: rawClassName ? reportClassDisplayFromClassName(rawClassName, level, { includeCode: true }) : "-",
      baseClass: String(parsedClass.baseClass || className || "-").trim() || "-",
      classCode: String(parsedClass.code || "").trim(),
      level,
      enrolledAtIso,
      enrollmentMonthKey,
      schoolYearStartYear,
      isActive: isStudentActiveRecord(student),
      isReturningStudent: Boolean(student.isReturningStudent),
      inactiveReasonCategory: String(student.inactiveReasonCategory || ""),
      inactiveReasonNote: String(student.inactiveReasonNote || ""),
      inactiveAt: student.inactiveAt || "",
      inactiveByUsername: String(student.inactiveByUsername || "")
    });
  }
  return rows.sort((a, b) => {
    const metaCmp = compareEnrollmentClassMeta(a, b);
    if(metaCmp !== 0) return metaCmp;
    return String(a.name || "").localeCompare(String(b.name || ""), "fr", { numeric: true, sensitivity: "base" });
  });
}
function buildEntryTotalsByLevelRows(rows){
  const levelOrder = ["Maternelle", "Primaire", "Secondaire"];
  const agg = new Map(levelOrder.map((lvl) => [lvl, { level: lvl, count: 0, totalUSD: 0, totalCDF: 0 }]));
  for(const r of Array.isArray(rows) ? rows : []){
    const lvl = levelOrder.includes(fmtReportLevelLabel(r?.level || "")) ? fmtReportLevelLabel(r?.level || "") : "Secondaire";
    const current = agg.get(lvl) || { level: lvl, count: 0, totalUSD: 0, totalCDF: 0 };
    current.count += 1;
    current.totalUSD += Number(r?.usd || r?.totalUSD || 0);
    current.totalCDF += Number(r?.cdf || r?.totalCDF || 0);
    agg.set(lvl, current);
  }
  return levelOrder.map((lvl) => agg.get(lvl)).filter((r) => Number(r?.count || 0) > 0);
}

function sleepMs(ms){
  const delay = Math.max(0, Number(ms || 0));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function splitReportClassBaseCode(className){
  const raw = String(className || "—").trim();
  let baseClass = raw;
  let code = "—";
  const m = raw.match(/^(.*)\s([A-Z])$/i);
  if(m){
    baseClass = m[1].trim();
    code = m[2].toUpperCase();
  }
  return { baseClass, code };
}
function classOrdinalWord(n){
  const byRank = {
    1: "Première",
    2: "Deuxième",
    3: "Troisième",
    4: "Quatrième",
    5: "Cinquième",
    6: "Sixième",
    7: "Septième",
    8: "Huitième",
    9: "Neuvième",
    10: "Dixième",
    11: "Onzième",
    12: "Douzième"
  };
  return byRank[Number(n)] || String(n);
}
function classLabelWithWords(baseClass){
  const base = String(baseClass || "").trim();
  if(!base || base === "—") return "—";
  const m = base.match(/^(\d{1,2})(?:re|er|e)?\b(.*)$/i);
  if(!m) return base;
  const word = classOrdinalWord(Number(m[1]));
  const rest = String(m[2] || "").trim();
  return rest ? `${word} ${rest}` : word;
}
function reportClassDisplayName(baseClass, levelLabel){
  const lvl = fmtReportLevelLabel(levelLabel || "");
  const base = classLabelWithWords(baseClass);
  if(!base || base === "—") return "—";
  if(!lvl) return base;
  const baseNorm = normalizeTextAscii(base);
  const lvlNorm = normalizeTextAscii(lvl);
  if(baseNorm.includes(lvlNorm)) return base;
  return `${base} ${lvl}`.trim();
}
function reportClassDisplayFromClassName(className, levelLabel, { includeCode = false } = {}){
  const { baseClass, code } = splitReportClassBaseCode(className);
  const baseLabel = reportClassDisplayName(baseClass, levelLabel);
  if(includeCode && code && code !== "—" && baseLabel !== "—"){
    return `${baseLabel} ${code}`;
  }
  return baseLabel;
}
function optionLabelForLateReport({ baseClass, levelLabel, code } = {}){
  const lvl = fmtReportLevelLabel(levelLabel || "");
  const base = String(baseClass || "").trim();
  if(lvl !== "Secondaire"){
    return "---";
  }
  if(/^7e\s*EB\b/i.test(base) || /^8e\s*EB\b/i.test(base)){
    return "Général";
  }
  const m = base.match(/\-\s*([^-]+)$/);
  if(m && m[1]){
    return normalizeFeeName(m[1]);
  }
  return "---";
}
function optionDisplayForLateReport({ baseClass, levelLabel, code } = {}){
  return optionLabelForLateReport({ baseClass, levelLabel, code });
}

function secondaryGradeEquivalentFromClass(baseClass){
  const c = String(baseClass || "").trim();
  if(/^7e\s+EB\b/i.test(c)) return 7;
  if(/^8e\s+EB\b/i.test(c)) return 8;
  if(/^1re\s+H\b/i.test(c)) return 9;
  if(/^2e\s+H\b/i.test(c)) return 10;
  if(/^3e\s+H\b/i.test(c)) return 11;
  if(/^4e\s+H\b/i.test(c)) return 12;
  return null;
}

function classOrderRankForLateReport(levelLabel, baseClass){
  const lvl = fmtReportLevelLabel(levelLabel || "");
  const levelRank = lvl === "Maternelle" ? 0 : (lvl === "Primaire" ? 1 : 2);
  let classRank = 999;
  if(lvl === "Secondaire"){
    const secGrade = secondaryGradeEquivalentFromClass(baseClass);
    if(Number.isFinite(secGrade)) classRank = secGrade;
  } else {
    const m = String(baseClass || "").match(/^(\d+)/);
    if(m) classRank = Number(m[1]);
  }
  return { levelRank, classRank };
}

function buildReportDocHeaderHtml({ title = "", subtitle = "", stats = [], meta = [], fraisLabel = "" } = {}){
  const rawStats = Array.isArray(stats) ? stats : [];
  const rawMeta = Array.isArray(meta) ? meta : [];
  let inferredFrais = "";
  const cleanedMeta = [];
  for(const item of rawMeta){
    const labelKey = normalizeTextAscii(item?.label || "");
    const valueText = String(item?.value ?? "").trim();
    if(labelKey === "type de frais" || labelKey === "frais"){
      if(!inferredFrais && valueText) inferredFrais = valueText;
      continue;
    }
    cleanedMeta.push(item);
  }
  const finalFrais = String(fraisLabel || "").trim() || inferredFrais || "Tous frais";
  const finalStats = rawStats.slice();
  if(finalFrais){
    finalStats.push({ label: "Frais", value: String(finalFrais).toUpperCase() });
  }
  const statRows = finalStats
    .filter((item) => item && item.label && item.value != null && String(item.value).trim() !== "")
    .map((item) => `<div class="report-doc-stat-row"><span>${esc(item.label)}</span><strong>${esc(String(item.value))}</strong></div>`)
    .join("");
  const metaRows = cleanedMeta
    .filter((item) => item && item.label && item.value != null && String(item.value).trim() !== "")
    .map((item) => `<div class="report-doc-meta-item"><small>${esc(item.label)}</small><strong>${esc(String(item.value))}</strong></div>`)
    .join("");
  return `
    <div class="report-doc-wrap">
      <div class="report-doc-head">
        <div class="report-doc-school" style="display:flex;align-items:center;gap:14px;flex-wrap:nowrap;">
          <img src="${esc(window.ecoleConfiguration?.["school.logo"] || "data:,")}" alt="Logo GSC" style="height:80px;width:80px;object-fit:contain;flex-shrink:0;" />
          <div>
            <div class="report-doc-school-name">${esc(window.ecoleConfiguration?.["school.name"] || "Etablissement scolaire")}</div>
            <div class="report-doc-school-address">N°: AV: Rte CONTOURNEMENT,<br>Réf OVD Q/ PLATEAU KARAVIA C/<br>ANNEXE</div>
            <div class="report-doc-school-city">LUBUMBASHI</div>
          </div>
        </div>
        <div class="report-doc-stats">
          <div class="report-doc-stats-title">Statistiques</div>
          ${statRows || `<div class="tiny">Aucune statistique.</div>`}
        </div>
      </div>
      <div class="report-doc-divider"></div>
      <div class="report-doc-title">${esc(title)}</div>
      ${metaRows ? `<div class="report-doc-meta">${metaRows}</div>` : ""}
    </div>
  `;
}

function reportLevelSortRank(levelValue){
  const lvl = fmtReportLevelLabel(levelValue || "");
  if(lvl === "Maternelle") return 0;
  if(lvl === "Primaire") return 1;
  if(lvl === "Secondaire") return 2;
  return 9;
}

function sortFeeReportRows(rows){
  return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const la = reportLevelSortRank(a?.level);
    const lb = reportLevelSortRank(b?.level);
    if(la !== lb) return la - lb;
    const classCmp = String(a?.className || "").localeCompare(String(b?.className || ""), "fr");
    if(classCmp !== 0) return classCmp;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr");
  });
}

async function loadFeeStatusesByMonthApi({ feeTypeId, monthKey }){
  const id = String(feeTypeId || "").trim();
  const mk = String(monthKey || "").trim();
  if(!id || !mk) return [];
  const qs = new URLSearchParams();
  qs.set("feeTypeId", id);
  qs.set("month", mk);
  const data = await apiFetch(`/api/students/statuses?${qs.toString()}`);
  return Array.isArray(data?.rows) ? data.rows : [];
}

function buildFeeReportRowsTableHtml(rows){
  const list = sortFeeReportRows(rows);
  if(!list.length){
    return `<tr><td colspan="7" class="tiny">Aucun élève.</td></tr>`;
  }
  return list.map((r, idx) => {
    const statusLabel = String(r.status || (Number(r.remaining || 0) > 0 ? "En retard" : "À jour"));
    const statusClass = Number(r.remaining || 0) <= 0
      ? "ok"
      : (/part/i.test(statusLabel) ? "partial" : "late");
    const classDisplay = reportClassDisplayFromClassName(r.className || "—", r.level || "", { includeCode: true });
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td><strong>${esc(r.name || "—")}</strong></td>
        <td>${esc(r.matricule || r.studentId || "—")}</td>
        <td>${esc(classDisplay)}</td>
        <td>${esc(fmtReportLevelLabel(r.level || "—"))}</td>
        <td><strong>${formatMoney(Number(r.remaining || 0), r.currency || "USD")}</strong></td>
        <td><span class="badge ${statusClass}">${esc(statusLabel)}</span></td>
      </tr>
    `;
  }).join("");
}

function buildFeeReportSectionHtml({ title, rows, open = true, emptyLabel = "Aucune donnée." }){
  const list = Array.isArray(rows) ? rows : [];
  return `
    <details class="settings-accordion fee-report-subsection" ${open ? "open" : ""}>
      <summary>${esc(title || "Section")}</summary>
      <div class="body">
        <div class="table-wrap">
          <table style="width:100%">
            <thead>
              <tr>
                <th>N°</th>
                <th>Élève</th>
                <th>Matricule</th>
                <th>Classe</th>
                <th>Niveau</th>
                <th>Reste</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${list.length ? buildFeeReportRowsTableHtml(list) : `<tr><td colspan="7" class="tiny">${esc(emptyLabel)}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  `;
}

function buildStudentLookupMapForFeeReports(){
  const out = new Map();
  for(const s of Array.isArray(students) ? students : []){
    if(!s?.id) continue;
    out.set(String(s.id), s);
  }
  return out;
}

function buildFeeReportRowsFromStatuses(statuses, feeType, studentMap){
  return (Array.isArray(statuses) ? statuses : []).map((st) => {
    const sid = String(st?.studentId || "").trim();
    const info = studentMap.get(sid) || null;
    const dueAmount = Number(st?.dueAmount || 0);
    const paidSoFar = Number(st?.paidSoFar || 0);
    const remaining = Number(st?.remaining || 0);
    let status = String(st?.status || (remaining > 0 ? (paidSoFar > 0 ? "Partiel" : "En retard") : "À jour")).trim();
    if(remaining > 0 && !/part/i.test(status) && !/retard/i.test(status) && !/impay/i.test(status)){
      status = paidSoFar > 0 ? "Partiel" : "Impayé";
    }
    if(!status) status = remaining > 0 ? (paidSoFar > 0 ? "Partiel" : "Impayé") : "À jour";
    const lastPaidAtRaw = String(st?.lastPaidAt || "").trim();
    const lastPaidAt = lastPaidAtRaw && Number.isFinite(Date.parse(lastPaidAtRaw))
      ? new Date(lastPaidAtRaw).toISOString()
      : "";
    return {
      studentId: sid,
      name: String(info?.name || sid || "—"),
      matricule: String(info?.matricule || sid || "—"),
      className: String(info?.className || "—"),
      level: fmtReportLevelLabel(info?.level || ""),
      dueAmount,
      paidSoFar,
      remaining,
      currency: String(st?.currency || feeType?.defaultCurrency || "USD").toUpperCase(),
      status,
      casSocial: isCasSocialStudent(info),
      lastPaidAt
    };
  });
}

function mergeFeeStatusesByStudent(statusLists){
  const byStudent = new Map();
  for(const rows of Array.isArray(statusLists) ? statusLists : []){
    for(const st of Array.isArray(rows) ? rows : []){
      const studentId = String(st?.studentId || "").trim();
      if(!studentId) continue;
      const dueAmount = Number(st?.dueAmount || 0);
      const paidSoFar = Number(st?.paidSoFar || 0);
      const remaining = Number(st?.remaining || 0);
      const currency = String(st?.currency || "").toUpperCase();
      const status = String(st?.status || "").trim();
      const lastPaidAtRaw = String(st?.lastPaidAt || "").trim();
      const lastPaidAtMs = Number.isFinite(Date.parse(lastPaidAtRaw)) ? Date.parse(lastPaidAtRaw) : 0;
      const current = byStudent.get(studentId) || {
        studentId,
        dueAmount: 0,
        paidSoFar: 0,
        remaining: 0,
        currency: "",
        statuses: [],
        lastPaidAtMs: 0
      };
      current.dueAmount += dueAmount;
      current.paidSoFar += paidSoFar;
      current.remaining += remaining;
      if(currency && (!current.currency || dueAmount > 0)) current.currency = currency;
      if(status) current.statuses.push(status);
      if(lastPaidAtMs > current.lastPaidAtMs) current.lastPaidAtMs = lastPaidAtMs;
      byStudent.set(studentId, current);
    }
  }
  return Array.from(byStudent.values()).map((row) => {
    const remaining = Number(row.remaining || 0);
    const paidSoFar = Number(row.paidSoFar || 0);
    let status = "À jour";
    if(remaining > 0){
      if(paidSoFar > 0) status = "Partiel";
      else if(row.statuses.some((s) => /retard/i.test(String(s || "")))) status = "En retard";
      else status = "Impayé";
    }
    return {
      studentId: row.studentId,
      dueAmount: Number(row.dueAmount || 0),
      paidSoFar,
      remaining,
      currency: row.currency || "USD",
      status,
      lastPaidAt: row.lastPaidAtMs > 0 ? new Date(row.lastPaidAtMs).toISOString() : ""
    };
  });
}
async function loadAggregatedFeeStatusesByMonthApi({ feeTypeIds, monthKey } = {}){
  const ids = [...new Set((Array.isArray(feeTypeIds) ? feeTypeIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  const mk = String(monthKey || "").trim();
  if(!ids.length || !mk) return [];
  const statusLists = await Promise.all(ids.map((id) => loadFeeStatusesByMonthApi({ feeTypeId: id, monthKey: mk })));
  return mergeFeeStatusesByStudent(statusLists);
}
async function loadAggregatedFeeStatusesBySchoolYearApi({ feeTypeIds } = {}){
  const ids = [...new Set((Array.isArray(feeTypeIds) ? feeTypeIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  if(!ids.length) return [];
  const schoolMonthKeys = SCHOOL_MONTH_LABELS_FR
    .map((label) => monthKeyFromLabelFR(label))
    .filter((mk) => /^\d{4}-\d{2}$/.test(String(mk || "")));
  if(!schoolMonthKeys.length) return [];
  const requests = [];
  for(const id of ids){
    for(const mk of schoolMonthKeys){
      requests.push(loadFeeStatusesByMonthApi({ feeTypeId: id, monthKey: mk }));
    }
  }
  const statusLists = await Promise.all(requests);
  return mergeFeeStatusesByStudent(statusLists);
}

function buildCollectedFeeRowsFromPayments({ feeTypes, studentMap, monthKey = "" }){
  const list = Array.isArray(feeTypes) ? feeTypes.filter(Boolean) : [];
  if(!list.length) return [];
  const ids = new Set(list.map((ft) => String(ft?.id ?? "").trim()).filter(Boolean));
  const codes = new Set(list.map((ft) => String(ft?.code || "").trim().toUpperCase()).filter(Boolean));
  const labels = new Set(list.map((ft) => normalizeFeeName(ft?.labelFr || "")).filter(Boolean));
  const activeYear = Number(getActiveSchoolYearStartYear());
  const exactMonthKey = String(monthKey || "").trim();
  const grouped = new Map();
  for(const payment of getPayments()){
    const paymentId = String(payment?.feeTypeId ?? payment?.fee_type_id ?? "").trim();
    const paymentCode = String(paymentFeeCode(payment) || "").trim().toUpperCase();
    const paymentLabel = normalizeFeeName(payment?.feeType || payment?.feeTypeLabel || "");
    if(!(ids.has(paymentId) || codes.has(paymentCode) || labels.has(paymentLabel))) continue;
    const paymentMk = paymentMonthKey(payment);
    if(exactMonthKey){
      if(paymentMk !== exactMonthKey) continue;
    }else if(Number.isFinite(activeYear) && paymentMk && !monthKeyBelongsToSchoolYear(paymentMk, activeYear)){
      continue;
    }
    const studentId = String(payment?.studentId || "").trim();
    if(!studentId) continue;
    const amount = Number(payment?.amountEntered ?? payment?.amount ?? 0);
    const currency = String(payment?.currency || "USD").toUpperCase() === "CDF" ? "CDF" : "USD";
    if(!(amount > 0)) continue;
    const info = studentMap?.get(studentId) || null;
    const current = grouped.get(studentId) || {
      studentId,
      name: String(info?.name || payment?.studentName || studentId),
      matricule: String(info?.matricule || payment?.matricule || studentId),
      className: String(info?.className || payment?.className || "—"),
      level: info?.level || payment?.level || "",
      dueAmount: 0,
      paidUSD: 0,
      paidCDF: 0,
      remaining: 0,
      status: "Encaissé",
      paymentCount: 0,
      lastPaidAt: ""
    };
    if(currency === "CDF") current.paidCDF += amount;
    else current.paidUSD += amount;
    current.paymentCount += 1;
    const paidAtRaw = payment?.paidAt || payment?.createdAt || "";
    if(Number.isFinite(Date.parse(paidAtRaw)) && (!current.lastPaidAt || Date.parse(paidAtRaw) > Date.parse(current.lastPaidAt))){
      current.lastPaidAt = new Date(paidAtRaw).toISOString();
    }
    grouped.set(studentId, current);
  }
  return Array.from(grouped.values());
}

// Récapitulatif des ventes d'un article sur l'année scolaire active.
function buildItemFeeReportCardHtml({ reportKey, reportName, primaryFee, rows }){
  const price = Number(primaryFee?.defaultAmount || 0);
  const defCur = String(primaryFee?.defaultCurrency || "USD").toUpperCase();
  const buyers = (Array.isArray(rows) ? rows : [])
    .filter((r) => Number(r?.paymentCount || 0) > 0)
    .map((r) => {
      const paidUSD = Number(r.paidUSD || 0);
      const paidCDF = Number(r.paidCDF || 0);
      const matchingAmount = defCur === "CDF" ? paidCDF : paidUSD;
      const otherAmount = defCur === "CDF" ? paidUSD : paidCDF;
      return {
        name: r.name || r.fullName || "—",
        className: String(r.className || "—").trim() || "—",
        level: r.level || "",
        paidUSD,
        paidCDF,
        qty: price > 0 && otherAmount <= 0 ? Math.round(matchingAmount / price) : null
      };
    })
    .sort((a, b) => {
      const c = String(a.className).localeCompare(String(b.className), "fr", { numeric: true, sensitivity: "base" });
      if (c !== 0) return c;
      return String(a.name).localeCompare(String(b.name), "fr", { numeric: true, sensitivity: "base" });
    });
  const nbBuyers = buyers.length;
  const totalUSD = buyers.reduce((sum, buyer) => sum + buyer.paidUSD, 0);
  const totalCDF = buyers.reduce((sum, buyer) => sum + buyer.paidCDF, 0);
  const totalQty = price > 0 && buyers.every((buyer) => buyer.qty != null)
    ? buyers.reduce((sum, buyer) => sum + buyer.qty, 0)
    : null;
  const schoolYearLabel = schoolYearLabelFromStartYear(getActiveSchoolYearStartYear()) || currentSchoolYearLabel();

  const statBox = (label, value) =>
    `<div style="flex:1 1 130px;min-width:120px;border:1px solid #d8e0ec;border-radius:10px;padding:8px 12px;background:#f6f9fd">
       <div style="font-size:11px;color:#5b6777;text-transform:uppercase;letter-spacing:.3px">${esc(label)}</div>
       <div style="font-size:17px;font-weight:800;color:#12355b">${esc(value)}</div>
     </div>`;
  const statsHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px">
      ${statBox("Article", reportName)}
      ${statBox("Prix unitaire", price > 0 ? formatMoney(price, defCur) : "Libre")}
      ${statBox("Articles vendus", totalQty == null ? "—" : String(totalQty))}
      ${statBox("Acheteurs", String(nbBuyers))}
      ${statBox("Total USD", formatMoney(totalUSD, "USD"))}
      ${statBox("Total CDF", formatMoney(totalCDF, "CDF"))}
    </div>`;
  const rowsHtml = buyers.map((b, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td><strong>${esc(b.name)}</strong></td>
      <td style="text-align:center">${esc(b.className)}</td>
      <td style="text-align:center">${b.qty == null ? "—" : b.qty}</td>
      <td style="text-align:right">${b.paidUSD > 0 ? formatMoney(b.paidUSD, "USD") : "—"}</td>
      <td style="text-align:right">${b.paidCDF > 0 ? formatMoney(b.paidCDF, "CDF") : "—"}</td>
    </tr>`).join("") || `<tr><td colspan="6" class="tiny">Aucun encaissement pour ce frais durant l'année scolaire ${esc(schoolYearLabel)}.</td></tr>`;
  const footHtml = nbBuyers > 0 ? `
    <tr style="background:#eef3fa;font-weight:800">
      <td colspan="3" style="text-align:right">TOTAL</td>
      <td style="text-align:center">${totalQty == null ? "—" : totalQty}</td>
      <td style="text-align:right">${formatMoney(totalUSD, "USD")}</td>
      <td style="text-align:right">${formatMoney(totalCDF, "CDF")}</td>
    </tr>` : "";
  return `
    <details class="card settings-accordion fee-report-card" data-fee-report-card data-fee-report-card-id="${esc(reportKey)}" open>
      <summary>${esc(reportName)} • Article vendu</summary>
      <div class="body">
        <div class="row fee-report-actions" style="justify-content:flex-end;margin-bottom:8px">
          <button class="btn" type="button" data-fee-report-print="${esc(reportKey)}">Imprimer ce rapport</button>
        </div>
        <div class="tiny" style="margin-bottom:4px">Ce frais est un <strong>article vendu</strong> — récapitulatif des ventes de l'année scolaire ${esc(schoolYearLabel)} (pas de mois dû ; un élève peut en acheter plusieurs).</div>
        ${statsHtml}
        <div class="table-wrap">
          <table style="width:100%">
            <thead>
              <tr><th>No</th><th>Élève</th><th>Classe</th><th>Quantité</th><th>Montant USD</th><th>Montant CDF</th></tr>
            </thead>
            <tbody>${rowsHtml}${footHtml}</tbody>
          </table>
        </div>
      </div>
    </details>`;
}

function buildOpenPriceFeeStatusReportCardHtml({ reportKey, reportName, primaryFee, rows, monthKey }){
  const list = sortFeeReportRows(Array.isArray(rows) ? rows : []);
  const paidRows = list.filter((row) => Number(row?.paymentCount || 0) > 0);
  const unpaidRows = list.filter((row) => Number(row?.paymentCount || 0) <= 0);
  const totalPaidUSD = paidRows.reduce((sum, row) => sum + Number(row?.paidUSD || 0), 0);
  const totalPaidCDF = paidRows.reduce((sum, row) => sum + Number(row?.paidCDF || 0), 0);
  const dueMonthLabel = monthLabelFromMonthKeyWithYear(monthKey) || monthKey;
  const headerHtml = buildReportDocHeaderHtml({
    title: reportName,
    subtitle: "Listes séparées des élèves en ordre et pas en ordre",
    stats: [
      { label: "Année scolaire", value: schoolYearLabelFromMonthKey(monthKey) },
      { label: "Mois dû", value: dueMonthLabel },
      { label: "Nb concernés", value: String(list.length) }
    ],
    meta: [
      { label: "En ordre", value: String(paidRows.length) },
      { label: "Pas en ordre", value: String(unpaidRows.length) },
      { label: "Payé USD", value: formatMoney(totalPaidUSD, "USD") },
      { label: "Payé CDF", value: formatMoney(totalPaidCDF, "CDF") }
    ],
    fraisLabel: reportName
  });
  const buildStatusSection = ({ sectionRows, paid, open }) => {
    const sectionId = `${reportKey}:${paid ? "paid" : "unpaid"}`;
    const title = paid ? "En ordre" : "Pas en ordre";
    const classGroups = new Map();
    for(const row of sectionRows){
      const level = fmtReportLevelLabel(row.level || "—");
      const className = String(row.className || "—").trim() || "—";
      const key = `${level}||${className}`;
      if(!classGroups.has(key)) classGroups.set(key, { level, className, rows: [] });
      classGroups.get(key).rows.push(row);
    }
    const groups = Array.from(classGroups.values()).sort((a, b) => {
      const levelDiff = reportLevelSortRank(a.level) - reportLevelSortRank(b.level);
      if(levelDiff !== 0) return levelDiff;
      return a.className.localeCompare(b.className, "fr", { numeric: true, sensitivity: "base" });
    });
    const classSectionsHtml = groups.map((group, groupIndex) => {
      const classDisplay = reportClassDisplayFromClassName(group.className, group.level, { includeCode: true });
      const classPaidUSD = group.rows.reduce((sum, row) => sum + Number(row?.paidUSD || 0), 0);
      const classPaidCDF = group.rows.reduce((sum, row) => sum + Number(row?.paidCDF || 0), 0);
      const classHeaderHtml = buildReportDocHeaderHtml({
        title: `${reportName} — ${title}`,
        subtitle: `Classe ${classDisplay}`,
        stats: [
          { label: "Année scolaire", value: schoolYearLabelFromMonthKey(monthKey) },
          { label: "Mois dû", value: dueMonthLabel },
          { label: "Nb élèves", value: String(group.rows.length) }
        ],
        meta: [
          { label: "Niveau", value: group.level },
          { label: "Classe", value: classDisplay },
          paid ? { label: "Payé USD", value: formatMoney(classPaidUSD, "USD") } : null,
          paid ? { label: "Payé CDF", value: formatMoney(classPaidCDF, "CDF") } : null
        ].filter(Boolean),
        fraisLabel: reportName
      });
      const bodyRows = group.rows.map((row, index) => `
        <tr>
          <td style="text-align:center">${index + 1}</td>
          <td><strong>${esc(row.name || "—")}</strong></td>
          <td>${esc(row.matricule || row.studentId || "—")}</td>
          <td style="text-align:right"><strong>${Number(row.paidUSD || 0) > 0 ? formatMoney(Number(row.paidUSD || 0), "USD") : "—"}</strong></td>
          <td style="text-align:right"><strong>${Number(row.paidCDF || 0) > 0 ? formatMoney(Number(row.paidCDF || 0), "CDF") : "—"}</strong></td>
          <td>${esc(formatIsoDateToFr(row.lastPaidAt || "") || "—")}</td>
        </tr>`).join("");
      return `
        <section ${reportPrintClassAttributes(group.level, classDisplay)} class="report-late-class-section ${groupIndex > 0 ? "report-late-class-section--new-page" : ""}">
          ${classHeaderHtml}
          <section class="report-late-group-section">
            <div class="report-late-code-title">Classe ${esc(classDisplay)} — ${esc(title)} (${group.rows.length})</div>
            <div class="table-wrap">
              <table style="width:100%">
                <thead><tr><th>N°</th><th>Élève</th><th>Matricule</th><th>Montant USD</th><th>Montant CDF</th><th>Date</th></tr></thead>
                <tbody>${bodyRows}</tbody>
              </table>
            </div>
          </section>
        </section>`;
    }).join("");
    const emptyHtml = `
      <section class="report-late-class-section">
        ${buildReportDocHeaderHtml({
          title: `${reportName} — ${title}`,
          subtitle: `Aucun élève ${paid ? "en ordre" : "pas en ordre"} pour ce frais`,
          stats: [
            { label: "Année scolaire", value: schoolYearLabelFromMonthKey(monthKey) },
            { label: "Mois dû", value: dueMonthLabel },
            { label: "Nb élèves", value: "0" }
          ],
          fraisLabel: reportName
        })}
      </section>`;
    return `
      <details class="card settings-accordion fee-report-card" data-fee-report-card data-fee-report-card-id="${esc(sectionId)}" ${open ? "open" : ""}>
        <summary>${title} (${sectionRows.length})</summary>
        <div class="body">
          <div class="row fee-report-actions" style="justify-content:flex-end;margin-bottom:8px">
            <button class="btn" type="button" data-fee-report-print="${esc(sectionId)}">Imprimer liste ${title}</button>
          </div>
          <div class="report-late-groups-wrap">${classSectionsHtml || emptyHtml}</div>
        </div>
      </details>`;
  };
  return `
    <section class="card fee-report-card">
      <div class="body">
        ${headerHtml}
        <div class="fee-reports-wrap" style="margin-top:12px">
          ${buildStatusSection({ sectionRows: unpaidRows, paid: false, open: true })}
          ${buildStatusSection({ sectionRows: paidRows, paid: true, open: false })}
        </div>
      </div>
    </section>`;
}

async function buildFeeReportCardHtml({ reportId, reportLabel, feeTypes, monthKey, studentMap } = {}){
  const reportKey = String(reportId || "").trim();
  const reportName = String(reportLabel || "").trim() || "Frais";
  const feeList = Array.isArray(feeTypes) ? feeTypes.filter(Boolean) : [];
  const primaryFee = feeList[0] || null;
  const mk = String(monthKey || "").trim();
  if(!reportKey || !primaryFee || !mk){
    return `<div class="tiny">Paramètres de rapport invalides.</div>`;
  }
  let rows = [];
  let loadError = "";
  const cycleKeys = [...new Set(feeList.map((ft) => normalizeFeeBillingCycle(ft?.billingCycle || "monthly")))];
  const isItemCycle = cycleKeys.length === 1 && cycleKeys[0] === "item";
  const isOpenPrice = !isItemCycle && feeList.every((ft) => ft?.hasFixedPrice === false);
  const openPriceMonthKey = normalizeFeeDueMonthValue(primaryFee?.dueMonth || "") || mk;
  try{
    if(isItemCycle){
      rows = buildCollectedFeeRowsFromPayments({ feeTypes: feeList, studentMap: studentMap || new Map() });
    }else if(isOpenPrice){
      const statuses = await loadAggregatedFeeStatusesByMonthApi({
        feeTypeIds: feeList.map((ft) => ft.id),
        monthKey: openPriceMonthKey
      });
      const collectedByStudent = new Map(
        buildCollectedFeeRowsFromPayments({
          feeTypes: feeList,
          studentMap: studentMap || new Map(),
          monthKey: openPriceMonthKey
        }).map((row) => [String(row.studentId || ""), row])
      );
      rows = buildFeeReportRowsFromStatuses(statuses, primaryFee, studentMap || new Map())
        .filter((row) => {
          const student = studentMap?.get(String(row.studentId || ""));
          return student && feeList.some((feeType) => isFeeTypeApplicableForStudent(feeType, student));
        })
        .map((row) => ({
          ...row,
          paidUSD: Number(collectedByStudent.get(String(row.studentId || ""))?.paidUSD || 0),
          paidCDF: Number(collectedByStudent.get(String(row.studentId || ""))?.paidCDF || 0),
          paymentCount: Number(collectedByStudent.get(String(row.studentId || ""))?.paymentCount || 0),
          lastPaidAt: collectedByStudent.get(String(row.studentId || ""))?.lastPaidAt || row.lastPaidAt || "",
          dueAmount: 0,
          paidSoFar: 0,
          remaining: 0,
          status: Number(collectedByStudent.get(String(row.studentId || ""))?.paymentCount || 0) > 0 ? "En ordre" : "Pas en ordre"
        }));
    }else{
      // Les frais annuels se totalisent sur l'année scolaire, pas par mois.
      const useYearScope = cycleKeys.length === 1 && cycleKeys[0] === "annual";
      const statuses = useYearScope
        ? await loadAggregatedFeeStatusesBySchoolYearApi({ feeTypeIds: feeList.map((ft) => ft.id) })
        : await loadAggregatedFeeStatusesByMonthApi({ feeTypeIds: feeList.map((ft) => ft.id), monthKey: mk });
      rows = buildFeeReportRowsFromStatuses(statuses, primaryFee, studentMap || new Map());
    }
  }catch(err){
    loadError = String(err?.message || "API indisponible");
  }

  if(loadError){
    return `
      <details class="card settings-accordion fee-report-card" data-fee-report-card data-fee-report-card-id="${esc(reportKey)}" open>
        <summary>${esc(reportName)} • Erreur chargement</summary>
        <div class="body">
          <div class="row fee-report-actions" style="justify-content:flex-end;margin-bottom:8px">
            <button class="btn" type="button" data-fee-report-print="${esc(reportKey)}">Imprimer ce rapport</button>
          </div>
          <div class="tiny">Impossible de charger ce rapport: ${esc(loadError)}</div>
        </div>
      </details>
    `;
  }

  if(isItemCycle){
    return buildItemFeeReportCardHtml({ reportKey, reportName, primaryFee, rows });
  }
  if(isOpenPrice){
    return buildOpenPriceFeeStatusReportCardHtml({
      reportKey,
      reportName,
      primaryFee,
      rows,
      monthKey: openPriceMonthKey
    });
  }
  const isAnnualCycle = cycleKeys.length === 1 && cycleKeys[0] === "annual";
  const cycleLabel = cycleKeys.length === 1 ? feeCycleLabelFr(cycleKeys[0]) : "Mixte";
  const isTuitionReport = feeList.some((ft) => String(ft?.code || "").toUpperCase() === "TUITION")
    || isTuitionFeeValue(reportName);
  const isBulletinReport = feeList.some((ft) => String(ft?.code || "").toUpperCase() === "ETAT_BULLETIN")
    || /\bbulletin\b/.test(normalizeTextAscii(reportName));
  const bulletinDefaultDue = Number(primaryFee?.defaultAmount || 0);
  const effectiveRows = isBulletinReport
    ? rows.map((r) => {
        const paid = Math.max(0, Number(r?.paidSoFar || 0));
        const originalDue = Math.max(0, Number(r?.dueAmount || 0));
        const dueAmount = originalDue > 0 ? originalDue : Math.max(0, bulletinDefaultDue);
        const remaining = Math.max(0, dueAmount - paid);
        const status = remaining <= 0 ? "À jour" : (paid > 0 ? "Partiel" : "Impayé");
        return {
          ...r,
          dueAmount,
          paidSoFar: paid,
          remaining,
          status
        };
      })
    : rows;
  const FEE_REPORT_MONEY_EPSILON = 0.0049;
  const dueRows = effectiveRows.filter((r) =>
    Number(r.dueAmount || 0) > FEE_REPORT_MONEY_EPSILON
    || (isTuitionReport && Boolean(r?.casSocial))
  );
  const classifyAsPaid = (r) => {
    if(isTuitionReport && Boolean(r?.casSocial)) return true;
    const paidSoFar = Number(r?.paidSoFar || 0);
    return paidSoFar > FEE_REPORT_MONEY_EPSILON;
  };
  const paidRows = dueRows.filter((r) => classifyAsPaid(r));
  const unpaidRows = dueRows.filter((r) => !classifyAsPaid(r));
  const notDueRows = isBulletinReport
    ? []
    : effectiveRows.filter((r) =>
        Number(r.dueAmount || 0) <= 0
        && !(isTuitionReport && Boolean(r?.casSocial))
      );
  const classDueCountMap = new Map();
  for(const r of dueRows){
    const className = String(r?.className || "—").trim();
    const { baseClass } = splitReportClassBaseCode(className);
    const levelLabel = fmtReportLevelLabel(r?.level || "");
    const classKey = `${levelLabel}||${baseClass}`;
    classDueCountMap.set(classKey, Number(classDueCountMap.get(classKey) || 0) + 1);
  }
  const classPaidCountMap = new Map();
  for(const r of paidRows){
    const className = String(r?.className || "—").trim();
    const { baseClass } = splitReportClassBaseCode(className);
    const levelLabel = fmtReportLevelLabel(r?.level || "");
    const classKey = `${levelLabel}||${baseClass}`;
    classPaidCountMap.set(classKey, Number(classPaidCountMap.get(classKey) || 0) + 1);
  }
  const displayCurrency = String(unpaidRows[0]?.currency || paidRows[0]?.currency || dueRows[0]?.currency || primaryFee.defaultCurrency || "USD").toUpperCase();
  const totalDue = dueRows.reduce((sum, r) => sum + Number(r.dueAmount || 0), 0);
  const totalPaid = dueRows.reduce((sum, r) => sum + Number(r.paidSoFar || 0), 0);
  const totalRemain = dueRows.reduce((sum, r) => sum + Number(r.remaining || 0), 0);
  const sortSectionCodes = (codes) => codes.slice().sort((a, b) => {
    const aa = String(a || "—");
    const bb = String(b || "—");
    if(aa === bb) return 0;
    if(aa === "—") return 1;
    if(bb === "—") return -1;
    return aa.localeCompare(bb, "fr");
  });
  const buildGroupedLateBlock = ({
    listRows,
    title,
    subtitle,
    emptyLabel,
    countLabel,
    detailsId,
    detailsSummary,
    printButtonLabel,
    defaultOpen = true
  }) => {
    const isUnpaidList = /:unpaid$/i.test(String(detailsId || ""));
    const rowsList = Array.isArray(listRows) ? listRows : [];
    const blockDue = rowsList.reduce((sum, r) => sum + Number(r.dueAmount || 0), 0);
    const blockPaid = rowsList.reduce((sum, r) => sum + Number(r.paidSoFar || 0), 0);
    const blockRemain = rowsList.reduce((sum, r) => sum + Number(r.remaining || 0), 0);
    const classGroups = {};
    for(const r of rowsList){
      const className = String(r.className || "—").trim();
      const { baseClass, code } = splitReportClassBaseCode(className);
      const levelLabel = fmtReportLevelLabel(r.level || "");
      const classKey = `${levelLabel}||${baseClass}`;
      if(!classGroups[classKey]){
        classGroups[classKey] = {
          levelLabel,
          baseClass,
          rows: [],
          totalDue: 0,
          totalPaid: 0,
          totalRemain: 0,
          sections: {}
        };
      }
      const classGroup = classGroups[classKey];
      const sectionCode = code || "—";
      if(!classGroup.sections[sectionCode]){
        classGroup.sections[sectionCode] = {
          code: sectionCode,
          rows: [],
          totalDue: 0,
          totalPaid: 0,
          totalRemain: 0
        };
      }
      classGroup.rows.push(r);
      classGroup.totalDue += Number(r.dueAmount || 0);
      classGroup.totalPaid += Number(r.paidSoFar || 0);
      classGroup.totalRemain += Number(r.remaining || 0);
      classGroup.sections[sectionCode].rows.push(r);
      classGroup.sections[sectionCode].totalDue += Number(r.dueAmount || 0);
      classGroup.sections[sectionCode].totalPaid += Number(r.paidSoFar || 0);
      classGroup.sections[sectionCode].totalRemain += Number(r.remaining || 0);
    }
    const classKeys = Object.keys(classGroups).sort((a,b) => {
      const ga = classGroups[a];
      const gb = classGroups[b];
      const ra = classOrderRankForLateReport(ga?.levelLabel, ga?.baseClass);
      const rb = classOrderRankForLateReport(gb?.levelLabel, gb?.baseClass);
      if(ra.levelRank !== rb.levelRank) return ra.levelRank - rb.levelRank;
      if(ra.classRank !== rb.classRank) return ra.classRank - rb.classRank;
      return String(ga?.baseClass || "").localeCompare(String(gb?.baseClass || ""), "fr");
    });
    const blockStats = [
      { label: "Année scolaire", value: schoolYearLabelFromMonthKey(mk) },
      isAnnualCycle ? null : { label: "Mois", value: monthLabelFromMonthKeyWithYear(mk) },
      { label: countLabel, value: String(rowsList.length) },
      { label: "Classes", value: String(classKeys.length) }
    ].filter(Boolean);
    const blockMeta = [
      isAnnualCycle ? null : { label: "Fréquence", value: cycleLabel },
      isUnpaidList ? null : { label: "Dû total", value: formatMoney(blockDue, displayCurrency) },
      { label: "Reste total", value: formatMoney(blockRemain, displayCurrency) }
    ].filter(Boolean);
    const blockHeaderHtml = buildReportDocHeaderHtml({
      title,
      subtitle,
      stats: blockStats,
      meta: blockMeta,
      fraisLabel: reportName
    });

    const groupSummaryHtml = classKeys.length ? `
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            ${isUnpaidList ? `
              <tr>
                <th>Niveau</th>
                <th>Classe</th>
                <th>Code</th>
                <th>${esc(countLabel)}</th>
                <th>Reste total (${esc(displayCurrency)})</th>
              </tr>
            ` : `
              <tr>
                <th>Niveau</th>
                <th>Classe</th>
                <th>Code</th>
                <th>${esc(countLabel)}</th>
                <th>Dû total (${esc(displayCurrency)})</th>
                <th>Reste total (${esc(displayCurrency)})</th>
              </tr>
            `}
          </thead>
          <tbody>
            ${classKeys.map((k) => {
              const g = classGroups[k];
              const sectionCodes = sortSectionCodes(Object.keys(g.sections || {}));
              const classDisplayName = reportClassDisplayName(g.baseClass, g.levelLabel);
              if(isUnpaidList){
                return `
                  <tr>
                    <td><strong>${esc(g.levelLabel || "—")}</strong></td>
                    <td>${esc(classDisplayName)}</td>
                    <td>${esc(sectionCodes.join(", ") || "—")}</td>
                    <td>${g.rows.length}</td>
                    <td><strong>${formatMoney(g.totalRemain, displayCurrency)}</strong></td>
                  </tr>
                `;
              }
              return `
                <tr>
                  <td><strong>${esc(g.levelLabel || "—")}</strong></td>
                  <td>${esc(classDisplayName)}</td>
                  <td>${esc(sectionCodes.join(", ") || "—")}</td>
                  <td>${g.rows.length}</td>
                  <td>${formatMoney(g.totalDue, displayCurrency)}</td>
                  <td><strong>${formatMoney(g.totalRemain, displayCurrency)}</strong></td>
                </tr>
              `;
            }).join("")}
            ${isUnpaidList ? `
              <tr style="background:#eef2ff">
                <td colspan="4"><strong>Total général</strong></td>
                <td><strong>${formatMoney(blockRemain, displayCurrency)}</strong></td>
              </tr>
            ` : `
              <tr style="background:#eef2ff">
                <td colspan="4"><strong>Total général</strong></td>
                <td><strong>${formatMoney(blockDue, displayCurrency)}</strong></td>
                <td><strong>${formatMoney(blockRemain, displayCurrency)}</strong></td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    ` : "";

    const classSectionsHtml = classKeys.map((k, idx) => {
      const g = classGroups[k];
      const sectionCodes = sortSectionCodes(Object.keys(g.sections || {}));
      const options = [...new Set(sectionCodes.map((code) => optionLabelForLateReport({ baseClass: g.baseClass, levelLabel: g.levelLabel, code })))];
      const classDisplayName = reportClassDisplayName(g.baseClass, g.levelLabel);
      const dueClassCount = Number(classDueCountMap.get(k) || 0);
      const paidClassCount = Number(classPaidCountMap.get(k) || 0);
      const remainingClassCount = Math.max(0, dueClassCount - paidClassCount);
      const unitAmountCdf = String(displayCurrency).toUpperCase() === "CDF"
        ? Number(primaryFee?.defaultAmount || 0)
        : Number(toCDF(Number(primaryFee?.defaultAmount || 0), primaryFee?.defaultCurrency || "USD") || 0);
      const useClassCdfAmounts = isAnnualCycle && String(primaryFee?.defaultCurrency || displayCurrency).toUpperCase() === "CDF";
      const dueClassValue = useClassCdfAmounts
        ? formatMoney(dueClassCount * unitAmountCdf, "CDF")
        : String(dueClassCount);
      const paidClassValue = useClassCdfAmounts
        ? formatMoney(paidClassCount * unitAmountCdf, "CDF")
        : formatMoney(g.totalPaid, displayCurrency);
      const remainingClassValue = useClassCdfAmounts
        ? formatMoney(remainingClassCount * unitAmountCdf, "CDF")
        : formatMoney(g.totalRemain, displayCurrency);
      const classStats = [
        { label: "Année scolaire", value: schoolYearLabelFromMonthKey(mk) },
        isAnnualCycle ? null : { label: "Mois", value: monthLabelFromMonthKeyWithYear(mk) },
        { label: "Niveau", value: g.levelLabel || "—" },
        { label: "Nb total", value: String(g.rows.length) }
      ].filter(Boolean);
      const classHeaderHtml = buildReportDocHeaderHtml({
        title,
        subtitle: `Classe ${classDisplayName}`,
        stats: classStats,
        meta: isUnpaidList
          ? [
              { label: "Classe", value: classDisplayName },
              { label: "Option", value: options.join(", ") || "—" },
              { label: "Reste classe", value: remainingClassValue }
            ]
          : [
              { label: "Classe", value: classDisplayName },
              { label: "Option", value: options.join(", ") || "—" },
              { label: "Dû classe", value: dueClassValue },
              { label: "Reste classe", value: remainingClassValue }
            ],
        fraisLabel: reportName
      });
      const combinedRows = [];
      for(const codeKey of sectionCodes){
        const sec = g.sections[codeKey];
        const optDisplay = optionDisplayForLateReport({ baseClass: g.baseClass, levelLabel: g.levelLabel, code: codeKey });
        const sortedRows = sec.rows
          .slice()
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
        combinedRows.push(`
          <tr style="background:#f8fafc">
            <td colspan="${isUnpaidList ? 5 : 7}"><strong>Code ${esc(codeKey || "—")} • Option ${esc(optDisplay || "---")} • ${isUnpaidList ? `Reste: ${formatMoney(sec.totalRemain, displayCurrency)}` : `Dû: ${formatMoney(sec.totalDue, displayCurrency)} • Reste: ${formatMoney(sec.totalRemain, displayCurrency)}`}</strong></td>
          </tr>
        `);
        if(isUnpaidList){
          combinedRows.push(...sortedRows.map((r, rowIdx) => `
            <tr>
              <td style="text-align:center">${rowIdx + 1}</td>
              <td style="text-align:center">${esc(codeKey || "—")}</td>
              <td><strong>${esc(r.name || "—")}</strong></td>
              <td>${esc(r.matricule || r.studentId || "—")}</td>
              <td><strong>${formatMoney(Number(r.remaining || 0), displayCurrency)}</strong></td>
            </tr>
          `));
        } else {
          combinedRows.push(...sortedRows.map((r, rowIdx) => `
            <tr>
              <td style="text-align:center">${rowIdx + 1}</td>
              <td style="text-align:center">${esc(codeKey || "—")}</td>
              <td><strong>${esc(r.name || "—")}</strong></td>
              <td>${esc(r.matricule || r.studentId || "—")}</td>
              <td>${formatMoney(Number(r.dueAmount || 0), displayCurrency)}</td>
              <td><strong>${formatMoney(Number(r.remaining || 0), displayCurrency)}</strong></td>
              <td>${esc(formatIsoDateToFr(r.lastPaidAt || "") || "—")}</td>
            </tr>
          `));
        }
      }
      return `
        <section ${reportPrintClassAttributes(g.levelLabel, classDisplayName)} class="report-late-class-section ${idx > 0 ? "report-late-class-section--new-page" : ""}">
          ${classHeaderHtml}
          <section class="report-late-group-section report-late-code-section">
            <div class="report-late-code-title">Classe ${esc(classDisplayName)}</div>
            <div class="table-wrap">
              <table style="width:100%">
                <thead>
                  ${isUnpaidList ? `
                    <tr>
                      <th>N°</th>
                      <th>Code</th>
                      <th>Élève</th>
                      <th>Matricule</th>
                      <th>Reste</th>
                    </tr>
                  ` : `
                    <tr>
                      <th>N°</th>
                      <th>Code</th>
                      <th>Élève</th>
                      <th>Matricule</th>
                      <th>Dû (${esc(displayCurrency)})</th>
                      <th>Reste</th>
                      <th>Date</th>
                    </tr>
                  `}
                </thead>
                <tbody>
                  ${combinedRows.join("") || `<tr><td colspan="${isUnpaidList ? 5 : 7}" class="tiny">Aucun élève concerné dans cette classe.</td></tr>`}
                  ${isUnpaidList ? `
                    <tr style="background:#eef2ff">
                      <td colspan="4"><strong>Total classe ${esc(classDisplayName)}</strong></td>
                      <td><strong>${formatMoney(g.totalRemain, displayCurrency)}</strong></td>
                    </tr>
                  ` : `
                    <tr style="background:#eef2ff">
                      <td colspan="4"><strong>Total classe ${esc(classDisplayName)}</strong></td>
                      <td><strong>${formatMoney(g.totalDue, displayCurrency)}</strong></td>
                      <td><strong>${formatMoney(g.totalRemain, displayCurrency)}</strong></td>
                      <td></td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      `;
    }).join("");

    const bodyHtml = `
      <section class="report-print-overview">
        ${blockHeaderHtml}
        ${groupSummaryHtml}
      </section>
      <div class="report-late-groups-wrap" style="margin-top:12px">
        ${classSectionsHtml || `<div class="table-wrap"><table style="width:100%"><tbody><tr><td class="tiny">${esc(emptyLabel)}</td></tr></tbody></table></div>`}
      </div>
    `;

    if(detailsId){
      return `
        <details class="card settings-accordion fee-report-card" data-fee-report-card data-fee-report-card-id="${esc(detailsId)}" ${defaultOpen ? "open" : ""}>
          <summary>${esc(detailsSummary || title)}</summary>
          <div class="body">
            <div class="row fee-report-actions" style="justify-content:flex-end;margin-bottom:8px">
              <button class="btn" type="button" data-fee-report-print="${esc(detailsId)}">${esc(printButtonLabel || "Imprimer")}</button>
            </div>
            ${bodyHtml}
          </div>
        </details>
      `;
    }
    return bodyHtml;
  };

  const headerStats = [
    { label: "Année scolaire", value: schoolYearLabelFromMonthKey(mk) },
    isAnnualCycle ? null : { label: "Mois", value: monthLabelFromMonthKeyWithYear(mk) },
    { label: "Nb concernés", value: String(dueRows.length) },
    isAnnualCycle ? null : {
      label: "Classes (impayés)",
      value: String(
        (() => {
          const m = new Set(unpaidRows.map((r) => `${fmtReportLevelLabel(r.level || "")}||${splitReportClassBaseCode(r.className || "").baseClass}`));
          return m.size;
        })()
      )
    }
  ].filter(Boolean);
  const headerMeta = [
    isAnnualCycle ? null : { label: "Fréquence", value: cycleLabel },
    { label: "En ordre", value: String(paidRows.length) },
    { label: "Pas en ordre", value: String(unpaidRows.length) },
    isBulletinReport ? null : { label: "Non concernés", value: String(notDueRows.length) },
    { label: "Dû total", value: formatMoney(totalDue, displayCurrency) },
    { label: "Payé total", value: formatMoney(totalPaid, displayCurrency) },
    { label: "Reste total", value: formatMoney(totalRemain, displayCurrency) }
  ].filter(Boolean);
  const headerHtml = buildReportDocHeaderHtml({
    title: reportName,
    subtitle: "Listes séparées des élèves en ordre et pas en ordre",
    stats: headerStats,
    meta: headerMeta,
    fraisLabel: reportName
  });

  const unpaidSubtitle = isBulletinReport
    ? "Liste des élèves qui n'ont pas encore payé le Bulletin"
    : `Liste des élèves qui n'ont pas encore payé ${reportName}`;
  const paidSubtitle = isBulletinReport
    ? "Liste des élèves qui ont déjà payé le Bulletin"
    : `Liste des élèves qui ont déjà payé ${reportName}`;
  const unpaidSectionHtml = buildGroupedLateBlock({
    listRows: unpaidRows,
    title: `${reportName} — Pas en ordre`,
    subtitle: unpaidSubtitle,
    emptyLabel: "Aucun élève pas en ordre pour ce frais sur cette période.",
    countLabel: "Nb pas en ordre",
    detailsId: `${reportKey}:unpaid`,
    detailsSummary: `Pas en ordre (${unpaidRows.length})`,
    printButtonLabel: "Imprimer liste Pas en ordre",
    defaultOpen: true
  });
  const paidSectionHtml = buildGroupedLateBlock({
    listRows: paidRows,
    title: `${reportName} — En ordre`,
    subtitle: paidSubtitle,
    emptyLabel: "Aucun élève en ordre pour ce frais sur cette période.",
    countLabel: "Nb en ordre",
    detailsId: `${reportKey}:paid`,
    detailsSummary: `En ordre (${paidRows.length})`,
    printButtonLabel: "Imprimer liste En ordre",
    defaultOpen: false
  });
  return `
    <section class="card fee-report-card">
      <div class="body">
        ${headerHtml}
        <div class="fee-reports-wrap" style="margin-top:12px">
          ${unpaidSectionHtml}
          ${paidSectionHtml}
        </div>
      </div>
    </section>
  `;
}

async function renderFeeReportByType({ monthKey, feeReportKey } = {}){
  const mk = String(monthKey || "").trim();
  const reportKey = String(feeReportKey || "").trim();
  if(!mk){
    return `<div class="tiny">Mois de rapport invalide.</div>`;
  }
  if(!reportKey){
    return `<div class="tiny">Type de frais invalide.</div>`;
  }
  const reportDef = getFeeReportDefinitionByKey(reportKey);
  if(!reportDef){
    return `<div class="tiny">Type de frais introuvable.</div>`;
  }
  const studentMap = buildStudentLookupMapForFeeReports();
  const cardHtml = await buildFeeReportCardHtml({
    reportId: reportDef.key,
    reportLabel: reportDef.label,
    feeTypes: reportDef.feeTypes,
    monthKey: mk,
    studentMap
  });
  return `<div class="fee-reports-wrap">${cardHtml}</div>`;
}

// Class print scope follows the existing class grouping (including its codes/options).
function reportPrintClassAttributes(level, label){
  const key = JSON.stringify([String(level || ""), String(label || "")]);
  return `data-report-class="${esc(key)}" data-report-class-label="${esc([level, label].filter(Boolean).join(" — "))}"`;
}

let reportPrintScopeType = "";
let reportPrintRestoreNodes = null;

function syncReportPrintClassOptions(){
  const select = document.getElementById("repPrintClass");
  const control = document.getElementById("repPrintClassControl");
  if(!select || !control || !repSingleBody) return;
  const type = String(repType?.value || "");
  const previous = type === reportPrintScopeType ? select.value : "";
  reportPrintScopeType = type;
  const classes = new Map();
  if(type !== "custom"){
    repSingleBody.querySelectorAll("[data-report-class]").forEach(section => {
      classes.set(section.dataset.reportClass, section.dataset.reportClassLabel);
    });
  }
  select.replaceChildren(new Option("Toutes les classes", ""));
  classes.forEach((label, key) => select.add(new Option(label, key)));
  select.value = classes.has(previous) ? previous : "";
  control.hidden = classes.size === 0;
}

function buildClassScopedReportHtml(root, classKey){
  if(!classKey) return root.innerHTML;
  const sections = Array.from(root.querySelectorAll("[data-report-class]"))
    .filter(section => section.dataset.reportClass === classKey);
  if(!sections.length) return null;
  // Each section already contains its own heading, counts and financial totals.
  // Omit the all-school summary and open any enclosing paid/unpaid groups.
  return `<div class="report-late-groups-wrap">${sections.map(section => {
    const copy = section.cloneNode(true);
    copy.classList.remove("report-late-class-section--new-page");
    return copy.outerHTML;
  }).join("")}</div>`;
}

function restoreClassPrintContent(){
  if(!reportPrintRestoreNodes) return;
  repSingleBody.replaceChildren(...reportPrintRestoreNodes);
  reportPrintRestoreNodes = null;
}

function printClassScopedReport(html){
  reportPrintRestoreNodes = Array.from(repSingleBody.childNodes);
  repSingleBody.innerHTML = html;
  document.body.classList.add("print-single-report");
  try{
    window.print();
  }catch(error){
    // A synchronous print failure has no afterprint event to clean up the view.
    resetPrintUiStateAfterPrint();
    throw error;
  }
  // Safari returns from window.print() before it builds the PDF. Keep the scoped
  // report in the DOM until afterprint; otherwise receipt-only print CSS wins.
}

function printFeeReportCard(feeTypeId){
  if(!repSingleBody) return;
  const targetId = String(feeTypeId || "").trim();
  if(!targetId) return;
  const cards = Array.from(repSingleBody.querySelectorAll("[data-fee-report-card-id]"));
  const target = cards.find((el) => String(el.getAttribute("data-fee-report-card-id") || "").trim() === targetId);
  if(!target) return;
  const classKey = document.getElementById("repPrintClass")?.value || "";
  const scopedHtml = classKey ? buildClassScopedReportHtml(target, classKey) : null;
  if(classKey && scopedHtml === null){
    showInAppPopup("Cette classe ne figure plus dans ce rapport. Choisissez une classe à imprimer.");
    return;
  }

  if(isElectronRuntime()){
    const label = target.querySelector("summary")?.textContent?.trim() || "Rapport";
    const subtitle = String(repHint?.textContent || "").trim();
    const opened = openElectronPrintPreviewWindow({
      title: `Aperçu avant impression - ${label}`,
      subtitle,
      bodyHtml: scopedHtml ?? target.outerHTML,
      printBodyClass: "print-single-report"
    });
    if(opened){
      return;
    }
  }

  if(classKey){
    printClassScopedReport(scopedHtml);
    return;
  }
  cards.forEach((el) => el.removeAttribute("data-print-target"));
  target.setAttribute("data-print-target", "1");
  if(target.tagName === "DETAILS") target.open = true;
  document.body.classList.add("print-single-report");
  document.body.classList.add("print-fee-report");
  window.print();
}

// Filtre de catégorie pour le rapport "Bus — abonnés". "__ALL__" = toutes.
function formatReportCDF(value){
  return `${formatIntSpaced(Math.round(Number(value || 0)))} CDF`;
}

function renderFeeDistributionTable({ title = "", rows = [], columns = [] } = {}){
  const bodyRows = Array.isArray(rows) ? rows : [];
  const header = columns.map((col) => `<th${col.align === "right" ? ` style="text-align:right"` : ""}>${esc(col.label)}</th>`).join("");
  const htmlRows = bodyRows.map((row) => {
    const isTotal = String(row?.key || "").toLowerCase() === "total";
    const cells = columns.map((col) => {
      let value = col.render ? col.render(row) : row?.[col.key];
      if(value == null || value === "") value = "â€”";
      return `<td${col.align === "right" ? ` style="text-align:right"` : ""}>${isTotal ? `<strong>${value}</strong>` : value}</td>`;
    }).join("");
    return `<tr${isTotal ? ` style="background:#eef2ff"` : ""}>${cells}</tr>`;
  }).join("");
  return `
    <h3 style="margin:18px 0 8px">${esc(title)}</h3>
    <div class="table-wrap">
      <table style="min-width:980px">
        <thead><tr>${header}</tr></thead>
        <tbody>${htmlRows || `<tr><td colspan="${columns.length}" class="tiny">Aucune donnée.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderFeeDistributionReportHtml(payload = {}){
  const tables = payload.tables || {};
  const settings = payload.settings || {};
  const admissionPrices = settings.admissionPricesUSD || {};
  const minervalSettings = settings.minerval || {};
  const admissionTotals = tables.admission?.totals || {};
  const minervalTotals = tables.minerval?.totals || {};
  const scope = String(payload.scope || feeDistributionScope || "year") === "month" ? "month" : "year";
  const monthLabel = payload.month ? monthLabelFromMonthKeyWithYear(payload.month) : "";
  const schoolYearLabel = payload.schoolYearLabel || currentSchoolYearLabel();
  const rateText = `1 USD = ${formatIntSpaced(Number(settings.exchangeRateCDFPerUSD || 0))} CDF`;
  const periodText = scope === "month"
    ? (monthLabel || payload.month || "Mois sélectionné")
    : (payload.startMonth && payload.endMonth ? `${payload.startMonth} à ${payload.endMonth}` : schoolYearLabel);
  const scopeControls = `
    <div class="report-controls" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:0 0 12px 0">
      <div class="field" style="min-width:230px;max-width:280px">
        <label for="feeDistributionScopeSel">Période du rapport</label>
        <select id="feeDistributionScopeSel" class="input">
          <option value="year" ${scope === "year" ? "selected" : ""}>Année scolaire complète</option>
          <option value="month" ${scope === "month" ? "selected" : ""}>Mois sélectionné</option>
        </select>
      </div>
      <div class="tiny" style="padding-bottom:10px">
        ${scope === "month" ? `Mois: ${esc(monthLabel || payload.month || "")}` : `Année: ${esc(schoolYearLabel)}`}
      </div>
    </div>
  `;
  const header = buildReportDocHeaderHtml({
    title: scope === "month" ? "Rapport mensuel de répartition des frais" : "Rapport annuel de répartition des frais",
    subtitle: schoolYearLabel,
    fraisLabel: "RÉPARTITION DES FRAIS",
    stats: [
      { label: "Année scolaire", value: schoolYearLabel },
      { label: "Mode", value: scope === "month" ? "Mois sélectionné" : "Année complète" },
      { label: "Taux", value: rateText },
      { label: "Admission reçue", value: formatUSD(Number(admissionTotals.totalEqUSD || 0)) },
      { label: "Minerval reçu", value: formatUSD(Number(minervalTotals.recuEqUSD || 0)) }
    ],
    meta: [
      { label: "Période", value: periodText },
      { label: "Admission réf.", value: `Mat. ${formatUSD(admissionPrices.maternelle)} / Pri. ${formatUSD(admissionPrices.primaire)} / Sec. ${formatUSD(admissionPrices.secondaire)} / 4e H ${formatUSD(admissionPrices.secondaire4eHLow)}-${formatUSD(admissionPrices.secondaire4eHHigh)}` },
      { label: "Minerval attendu", value: `${formatUSD(minervalSettings.monthlyPriceUSD)} x ${Number(minervalSettings.months || 0)} mois (4e H: ${Number(minervalSettings.fourthHMonths || 9)} mois)` }
    ]
  });
  const admissionColumns = [
    { key: "label", label: "Niveau" },
    { key: "nbEleves", label: "nb élèves", align: "right", render: (r) => formatIntSpaced(Number(r.nbEleves || 0)) },
    { key: "recuUSD", label: "reçu USD", align: "right", render: (r) => formatUSD(r.recuUSD) },
    { key: "recuCDF", label: "reçu CDF", align: "right", render: (r) => formatReportCDF(r.recuCDF) },
    { key: "totalEqUSD", label: "total (éq. USD)", align: "right", render: (r) => formatUSD(r.totalEqUSD) },
    { key: "uniforme", label: "uniforme", align: "right", render: (r) => formatUSD(r.uniforme) },
    { key: "promo", label: "promo", align: "right", render: (r) => formatUSD(r.promo) },
    { key: "journalEcusson", label: "journal & écusson", align: "right", render: (r) => formatUSD(r.journalEcusson) },
    { key: "reste", label: "reste", align: "right", render: (r) => formatUSD(r.reste) }
  ];
  const minervalColumns = [
    { key: "label", label: "Niveau" },
    { key: "nbEleves", label: "nb élèves", align: "right", render: (r) => formatIntSpaced(Number(r.nbEleves || 0)) },
    { key: "nbMois", label: "nb mois", align: "right", render: (r) => r.nbMoisLabel ? esc(String(r.nbMoisLabel)) : formatIntSpaced(Number(r.nbMois || 0)) },
    { key: "minervalAttendu", label: "minerval attendu", align: "right", render: (r) => formatUSD(r.minervalAttendu) },
    { key: "recuUSD", label: "reçu USD", align: "right", render: (r) => formatUSD(r.recuUSD) },
    { key: "recuCDF", label: "reçu CDF", align: "right", render: (r) => formatReportCDF(r.recuCDF) },
    { key: "recuEqUSD", label: "reçu (éq. USD)", align: "right", render: (r) => formatUSD(r.recuEqUSD) },
    { key: "ecart", label: "écart", align: "right", render: (r) => formatUSD(r.ecart) }
  ];
  return `
    ${scopeControls}
    ${header}
    ${renderFeeDistributionTable({ title: tables.admission?.title || "Répartition Frais d'admission", rows: tables.admission?.rows || [], columns: admissionColumns })}
    ${renderFeeDistributionTable({ title: tables.minerval?.title || "Minerval", rows: tables.minerval?.rows || [], columns: minervalColumns })}
    <div class="tiny" style="margin-top:12px">
      Les montants CDF restent séparés; les colonnes équivalent USD utilisent uniquement le taux enregistré pour ce rapport.
    </div>
  `;
}

let feeDistributionScope = "year";
let busSubscribersCategoryFilter = "__ALL__";

function groupDGCollectionHistory(rows){
  const ordered = rows.filter(row =>
    normalizeTextAscii(stripStatePaidSpendingPrefix(String(row?.category || "").trim())).toLowerCase() === "collection dg"
  ).slice().sort((a, b) => {
    const dateOrder = spendingEffectiveDateISO(b).localeCompare(spendingEffectiveDateISO(a));
    if(dateOrder) return dateOrder;
    const timeOrder = (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    return timeOrder || String(b.id || "").localeCompare(String(a.id || ""), "fr", { numeric: true });
  });
  const months = new Map();
  const totals = { usd: 0, cdf: 0 };
  for(const row of ordered){
    const date = spendingEffectiveDateISO(row);
    const key = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : "";
    if(!months.has(key)) months.set(key, { monthKey: key, rows: [], usd: 0, cdf: 0 });
    const group = months.get(key);
    const part = spendingAmountSplit(row);
    group.rows.push(row);
    group.usd += Number(part.usd || 0); group.cdf += Number(part.cdf || 0);
    totals.usd += Number(part.usd || 0); totals.cdf += Number(part.cdf || 0);
  }
  return { months: Array.from(months.values()), totals, count: ordered.length };
}

async function renderReports(){
  if(reportsRenderInFlight){
    reportsRenderQueued = true;
    return;
  }
  reportsRenderInFlight = true;
  try{
  if(!repSingleBody || !repType) return;
  sanitizeReportTypeOptions();
  const t = String(repType.value || "summary");
  viewReports.classList.toggle("cr-active", t === "custom");
  if(t === "custom"){
    if(repHint) repHint.textContent = "Rapport personnalisé · les périodes sont définies dans chaque condition.";
    if(typeof window.renderCustomReport === "function") window.renderCustomReport();
    return;
  }
  if(!canAccessReportTypeValue(t)){
    if(repHint) repHint.textContent = t === "feeDistribution" ? "Accès réservé: admin." : "Acces reserve: admin/comptable.";
    repSingleBody.innerHTML = `<div class="tiny">${t === "feeDistribution" ? "Ce rapport est réservé aux administrateurs." : "Ce rapport est reserve a admin/comptable."}</div>`;
    return;
  }
  const selectedFeeReportKey = parseFeeReportTypeFeeId(t);
  if(repPrintOne){
    repPrintOne.style.display = "";
  }
  let d = reportDataForSelectedType();
  const reportMonthKey = selectedReportMonthKey();
  const reportMonthLabelWithYear = monthLabelFromMonthKeyWithYear(reportMonthKey || d.monthKey || "");
  let summaryApi = null;
  const needsSummaryApi = reportMonthKey && !selectedFeeReportKey && !["daily","dailyEntriesLevel","dailyEntriesCaisse","dailyCaisseArticlesSummary","bus","busSubscribers","tuitionBenefits","spending","collectionDG","feeDistribution","late","casSocial","level","enrolledStudents","inactiveStudents","enrolledImpayes","duplicateStudents","studentContinuity","families"].includes(t);
  if(needsSummaryApi){
    summaryApi = await loadReportsSummaryApi(reportMonthKey, { force: true });
    if(!summaryApi || !Array.isArray(summaryApi.rows)){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger le résumé serveur pour ${esc(monthLabelFromMonthKeyWithYear(reportMonthKey))}. Vérifiez la période sélectionnée puis réessayez.</div>`;
      return;
    }
    d = applySummaryApiRowsToReportData(d, summaryApi);
  } else if((t === "summary" || t === "bus") && reportMonthKey){
    if(t === "bus"){
      repSingleBody.innerHTML = `<div class="tiny">Chargement rapport bus...</div>`;
    }
  }
  if(t === "level"){
    d = buildLevelReportDataFromDashboardMonth(reportMonthKey, d);
  }
  const selectedDateIso = getSelectedReportDateISO();
  if(repHint){
    if(t === "daily"){
      repHint.textContent = `Période utilisée: ${fmtDateShort(new Date(selectedDateIso))} (journalier)`;
    } else if(t === "dailyEntriesLevel"){
      repHint.textContent = `Période utilisée: ${fmtDateShort(new Date(selectedDateIso))} (entrées par jour / niveau)`;
    } else if(t === "dailyEntriesCaisse" || t === "dailyCaisseArticlesSummary"){
      repHint.textContent = `Periode utilisee: ${fmtDateShort(new Date(selectedDateIso))} (entrees du jour par caisse)`;
    } else if(t === "inactiveStudents"){
      repHint.textContent = `Liste utilisee: eleves inactifs (radies) de l'annee scolaire ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())}`;
    } else if(t === "enrolledStudents"){
      repHint.textContent = `Liste utilisee: eleves actifs de l'annee scolaire ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())}`;
    } else if(t === "duplicateStudents"){
      repHint.textContent = `Contrôle des noms identiques ou proches pour ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())}`;
    } else if(t === "studentContinuity"){
      const currentStartYear = getActiveSchoolYearStartYear();
      repHint.textContent = `Comparaison ${schoolYearLabelFromStartYear(currentStartYear - 1)} → ${schoolYearLabelFromStartYear(currentStartYear)}, avec correspondances probables à vérifier`;
    } else if(t === "families"){
      repHint.textContent = `Familles et fratries actives — ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())}`;
    } else if(t === "enrolledImpayes"){
      repHint.textContent = `Liste utilisee: eleves actifs ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())} — mois impayes (${getTuitionFeeDisplayLabel()}) jusqu'au mois courant`;
    } else if(t === "bus"){
      repHint.textContent = `Période utilisée: ${reportMonthLabelWithYear || d.month} (Bus)`;
    } else if(t === "busSubscribers"){
      repHint.textContent = "Liste utilisée: tous les abonnés au bus (par catégorie), paiement non pris en compte";
    } else if(t === "tuitionBenefits"){
      repHint.textContent = "Liste utilisée: élèves dont le minerval est pris en charge (personnel) — réglé hors caisse";
    } else if(t === "spending"){
      repHint.textContent = `Période utilisée: ${fmtDateShort(new Date(selectedDateIso))} (dépenses journalières)`;
    } else if(t === "collectionDG"){
      repHint.textContent = `Historique de l’année scolaire ${currentSchoolYearLabel()} — par mois de mouvement, du plus récent au plus ancien`;
    } else if(t === "feeDistribution"){
      repHint.textContent = feeDistributionScope === "month"
        ? `Période utilisée: ${reportMonthLabelWithYear || selectedReportMonthKey()} (répartition mensuelle des frais)`
        : `Période utilisée: année scolaire ${schoolYearLabelFromStartYear(getActiveSchoolYearStartYear())} (répartition annuelle des frais)`;
    } else if(t === "casSocial"){
      repHint.textContent = "Liste utilisée: élèves CAS SOCIAL (mensuel = 0 ou note CAS SOCIAL)";
    } else if(selectedFeeReportKey){
      const selectedFee = getFeeReportDefinitionByKey(selectedFeeReportKey);
      repHint.textContent = `Période utilisée: ${reportMonthLabelWithYear || d.month} (${normalizeFeeName(selectedFee?.label || "frais")})`;
    } else {
      repHint.textContent = `Période utilisée: ${reportMonthLabelWithYear || d.month} (${d.tuitionLabel || getTuitionFeeDisplayLabel()})`;
    }
  }

  if(selectedFeeReportKey){
    const mk = reportMonthKey || monthKeyFromDateISO(selectedDateIso) || d.monthKey || selectedReportMonthKey();
    repSingleBody.innerHTML = `<div class="tiny">Chargement rapport frais...</div>`;
    repSingleBody.innerHTML = await renderFeeReportByType({ monthKey: mk, feeReportKey: selectedFeeReportKey });
    return;
  }

  if(t === "feeDistribution"){
    repSingleBody.innerHTML = `<div class="tiny">Chargement de la répartition des frais...</div>`;
    try{
      const params = new URLSearchParams();
      params.set("scope", feeDistributionScope === "month" ? "month" : "year");
      if(feeDistributionScope === "month"){
        const mk = reportMonthKey || selectedReportMonthKey();
        if(mk) params.set("month", mk);
      }
      const payload = await apiFetch(`/api/reports/fee-distribution?${params.toString()}`);
      repSingleBody.innerHTML = renderFeeDistributionReportHtml(payload || {});
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger la répartition des frais (${esc(String(err?.message || "erreur"))}).</div>`;
    }
    return;
  }

  if(t === "families"){
    const targetYear = Number(getActiveSchoolYearStartYear());
    const activeStudents = (Array.isArray(students) ? students : []).filter((student) =>
      isStudentActiveRecord(student) && (!Number.isFinite(targetYear) || Number(student.schoolYearStartYear) === targetYear)
    );
    const families = new Map();
    activeStudents.forEach((student) => {
      const familyId = String(student.familyId || "").trim();
      const key = familyId || `UNLINKED:${student.id}`;
      const family = families.get(key) || {
        id: key,
        confirmed: Boolean(familyId),
        name: String(student.familyName || student.parentName || "").trim(),
        parentName: String(student.parentName || "").trim(),
        parentPhone: String(student.parentPhone || "").trim(),
        children: []
      };
      family.children.push(student);
      if(!family.parentName && student.parentName) family.parentName = String(student.parentName);
      if(!family.parentPhone && student.parentPhone) family.parentPhone = String(student.parentPhone);
      families.set(key, family);
    });
    const rows = Array.from(families.values()).sort((a, b) =>
      (b.children.length - a.children.length) || String(a.name || a.children[0]?.name || "").localeCompare(String(b.name || b.children[0]?.name || ""), "fr")
    );
    const siblingFamilies = rows.filter((family) => family.children.length > 1);
    const linkedChildren = siblingFamilies.reduce((sum, family) => sum + family.children.length, 0);
    const unlinkedCount = rows.filter((family) => !family.confirmed).length;
    const reportHead = buildReportDocHeaderHtml({
      title: "Familles et fratries",
      subtitle: "Foyers représentés dans l'école",
      stats: [
        { label: "Familles", value: String(rows.length) },
        { label: "Élèves actifs", value: String(activeStudents.length) },
        { label: "Familles avec fratrie", value: String(siblingFamilies.length) }
      ],
      meta: [
        { label: "Année scolaire", value: schoolYearLabelFromStartYear(targetYear) },
        { label: "Élèves en fratrie", value: String(linkedChildren) }
      ],
      fraisLabel: "Dossiers familiaux"
    });
    const bodyRows = rows.map((family, index) => {
      const children = family.children.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
      const familyName = family.name || (family.confirmed ? "Famille" : `À confirmer — ${children[0]?.name || "élève"}`);
      const childList = children.map((child) => `${esc(child.name || "—")} <small>${esc(formatClassLevel(child.className, child.level))}</small>`).join("<br>");
      return `<tr><td>${index + 1}</td><td><strong>${esc(familyName)}</strong>${family.confirmed ? "" : '<br><span class="badge partial">Lien à confirmer</span>'}</td><td>${esc(family.parentName || "—")}</td><td>${esc(family.parentPhone || "—")}</td><td class="num"><strong>${children.length}</strong></td><td>${childList}</td></tr>`;
    }).join("");
    repSingleBody.innerHTML = `${reportHead}<div class="grade-report-kpis"><div><span>Familles</span><strong>${rows.length}</strong></div><div><span>Avec plusieurs enfants</span><strong>${siblingFamilies.length}</strong></div><div><span>Élèves en fratrie</span><strong>${linkedChildren}</strong></div><div><span>Liens à confirmer</span><strong>${unlinkedCount}</strong></div></div><div class="table-wrap"><table style="width:100%;min-width:820px"><thead><tr><th>#</th><th>Famille</th><th>Parent / tuteur</th><th>Téléphone</th><th class="num">Enfants</th><th>Élèves et classes</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="6" class="tiny">Aucune famille pour cette année scolaire.</td></tr>'}</tbody></table></div><div class="tiny" style="margin-top:12px">Chaque élève sans lien familial confirmé est compté comme un foyer distinct. Rattachez les frères et sœurs lors de l'inscription pour consolider ce total.</div>`;
    return;
  }

  if(t === "enrolledStudents"){
    const targetStartYear = getActiveSchoolYearStartYear();
    const schoolYearLabel = schoolYearLabelFromStartYear(targetStartYear) || currentSchoolYearLabel();
    const schoolYearRangeLabel = Number.isFinite(Number(targetStartYear))
      ? `Septembre ${targetStartYear} - Juin ${Number(targetStartYear) + 1}`
      : schoolYearLabel;
    const rows = buildEnrolledStudentsReportRows(targetStartYear)
      .filter((row) => row.isActive)
      .sort((a, b) => {
        const metaCmp = compareEnrollmentClassMeta(a, b);
        if(metaCmp !== 0) return metaCmp;
        const codeA = String(a.classCode || "").trim();
        const codeB = String(b.classCode || "").trim();
        if(codeA !== codeB){
          if(!codeA) return 1;
          if(!codeB) return -1;
          const codeCmp = codeA.localeCompare(codeB, "fr", { numeric: true, sensitivity: "base" });
          if(codeCmp !== 0) return codeCmp;
        }
        return String(a.name || "").localeCompare(String(b.name || ""), "fr", { numeric: true, sensitivity: "base" });
      });

    const classGroups = new Map();
    for(const row of rows){
      const classKey = `${row.level}||${row.baseClass}`;
      const current = classGroups.get(classKey) || {
        level: row.level,
        baseClass: row.baseClass,
        rows: []
      };
      current.rows.push(row);
      classGroups.set(classKey, current);
    }
    const classRows = Array.from(classGroups.values()).sort(compareEnrollmentClassMeta);
    const returningCount = rows.filter((row) => row.isReturningStudent).length;
    const newCount = rows.length - returningCount;

    const classSectionsHtml = classRows.map((group, idx) => {
      const classLabel = reportClassDisplayName(group.baseClass, group.level);
      const groupRows = group.rows.slice().sort((a, b) => {
        const codeA = String(a.classCode || "").trim();
        const codeB = String(b.classCode || "").trim();
        if(codeA !== codeB){
          if(!codeA) return 1;
          if(!codeB) return -1;
          const codeCmp = codeA.localeCompare(codeB, "fr", { numeric: true, sensitivity: "base" });
          if(codeCmp !== 0) return codeCmp;
        }
        return String(a.name || "").localeCompare(String(b.name || ""), "fr", { numeric: true, sensitivity: "base" });
      });
      const classHeaderHtml = buildReportDocHeaderHtml({
        title: "Liste des élèves inscrits",
        subtitle: `Classe ${classLabel}`,
        stats: [
          { label: "Annee scolaire", value: schoolYearLabel },
          { label: "Classe", value: classLabel },
          { label: "Nb total", value: String(groupRows.length) },
          { label: "Nouveaux", value: String(groupRows.filter((row) => !row.isReturningStudent).length) },
          { label: "Anciens", value: String(groupRows.filter((row) => row.isReturningStudent).length) }
        ],
        meta: [
          { label: "Periode", value: schoolYearRangeLabel },
          { label: "Niveau", value: group.level || "-" }
        ],
        fraisLabel: "Inscriptions"
      });
      const codeSectionsHtml = `
        <section class="report-late-group-section report-late-code-section">
          <div class="report-late-code-title">Classe ${esc(classLabel)}</div>
          <div class="table-wrap">
            <table style="width:100%">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Code</th>
                  <th>Matricule</th>
                  <th>Eleve</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                ${groupRows.map((row, studentIdx) => `
                  <tr>
                    <td style="text-align:center">${studentIdx + 1}</td>
                    <td style="text-align:center">${esc(row.classCode || "-")}</td>
                    <td>${esc(row.matricule || row.studentId || "-")}</td>
                    <td><strong>${esc(row.name || "-")}</strong></td>
                    <td><span class="badge ${row.isReturningStudent ? "partial" : "ok"}">${row.isReturningStudent ? "Ancien" : "Nouveau"}</span></td>
                  </tr>
                `).join("") || `<tr><td colspan="5" class="tiny">Aucun eleve dans cette classe.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      `;
      return `
        <section ${reportPrintClassAttributes(group.level, classLabel)} class="report-late-class-section ${idx > 0 ? "report-late-class-section--new-page" : ""}">
          ${classHeaderHtml}
          ${codeSectionsHtml}
        </section>
      `;
    }).join("");

    repSingleBody.innerHTML = classSectionsHtml
      ? `${buildReportDocHeaderHtml({
          title: "Liste des élèves inscrits",
          subtitle: "Répartition des nouveaux et anciens élèves",
          stats: [
            { label: "Année scolaire", value: schoolYearLabel },
            { label: "Total inscrits", value: String(rows.length) },
            { label: "Nouveaux élèves", value: String(newCount) },
            { label: "Anciens élèves", value: String(returningCount) }
          ],
          meta: [{ label: "Période", value: schoolYearRangeLabel }],
          fraisLabel: "Inscriptions"
        })}<div class="report-late-groups-wrap" style="margin-top:12px">${classSectionsHtml}</div>`
      : `
        ${buildReportDocHeaderHtml({
          title: "Liste des élèves inscrits",
          subtitle: "Liste des eleves actifs regroupes par classe",
          stats: [
            { label: "Annee scolaire", value: schoolYearLabel },
            { label: "Nb total eleves", value: "0" },
            { label: "Classes", value: "0" }
          ],
          meta: [
            { label: "Periode", value: schoolYearRangeLabel }
          ],
          fraisLabel: "Inscriptions"
        })}
        <div class="report-late-groups-wrap" style="margin-top:12px">
          <div class="table-wrap"><table style="width:100%"><tbody><tr><td class="tiny">Aucun eleve inscrit pour cette annee scolaire.</td></tr></tbody></table></div>
        </div>
      `;
    return;
  }
  if(t === "studentContinuity"){
    const targetStartYear = getActiveSchoolYearStartYear();
    repSingleBody.innerHTML = `<div class="tiny">Comparaison des élèves entre les deux années scolaires...</div>`;
    try{
      const payload = await apiFetch(`/api/reports/student-continuity?schoolYearStartYear=${encodeURIComponent(targetStartYear)}`);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const previousLabel = payload?.previousSchoolYearLabel || schoolYearLabelFromStartYear(targetStartYear - 1);
      const currentLabel = payload?.schoolYearLabel || schoolYearLabelFromStartYear(targetStartYear);
      const reasonLabel = (reason) => ({
        same_matricule: "Même matricule",
        verified_matricule_link: "Lien confirmé entre les deux matricules",
        same_name: "Même nom",
        name_contained: "Nom complet / prénom ajouté",
        similar_name_identity: "Nom proche + identité confirmée",
        similar_name: "Orthographe proche",
        no_match: "Aucune correspondance"
      }[String(reason || "")] || "Correspondance calculée");
      const statusMeta = (row) => {
        if(row?.status === "returning"){
          return row?.confidence === "certain"
            ? { label: "Ancien", badge: "partial" }
            : { label: "Ancien probable", badge: "partial" };
        }
        if(row?.status === "review") return { label: "À vérifier", badge: "late" };
        return { label: "Nouveau", badge: "ok" };
      };
      const headerHtml = buildReportDocHeaderHtml({
        title: "Rapport nouveaux et anciens élèves",
        subtitle: `${previousLabel} comparé à ${currentLabel}`,
        stats: [
          { label: "Élèves actuels", value: String(Number(payload?.totalStudents || 0)) },
          { label: "Anciens", value: String(Number(payload?.returningStudents || 0)) },
          { label: "Nouveaux", value: String(Number(payload?.newStudents || 0)) },
          { label: "À vérifier", value: String(Number(payload?.reviewStudents || 0)) }
        ],
        fraisLabel: "Continuité des élèves"
      });
      repSingleBody.innerHTML = `${headerHtml}
        <div class="tiny" style="margin:10px 0">
          Les matricules peuvent changer entre les années. Le rapprochement utilise aussi les noms (ordre et petites différences d’orthographe), la date de naissance et le téléphone lorsqu’ils sont disponibles. Les cas moins sûrs restent visibles comme « À vérifier ».
        </div>
        <div class="table-wrap"><table style="width:100%;min-width:1250px">
          <thead><tr>
            <th>No</th><th>Statut</th><th>Confiance</th>
            <th>Nom ${esc(previousLabel)}</th><th>Matricule / classe ${esc(previousLabel)}</th>
            <th>Nom ${esc(currentLabel)}</th><th>Matricule / classe ${esc(currentLabel)}</th><th>Motif</th>
          </tr></thead>
          <tbody>${rows.map((row, index) => {
            const status = statusMeta(row);
            const confidence = Number(row?.similarity || 0);
            return `<tr>
              <td style="text-align:center">${index + 1}</td>
              <td><span class="badge ${status.badge}">${status.label}</span></td>
              <td><strong>${confidence > 0 ? `${Math.round(confidence * 100)} %` : "—"}</strong></td>
              <td><strong>${esc(row?.previous?.fullName || "—")}</strong>${row?.previous?.isActive === false ? `<div class="tiny">Inactif en ${esc(previousLabel)}</div>` : ""}</td>
              <td>${esc(row?.previous?.matricule || "—")}<br><span class="tiny">${esc(row?.previous?.className || "—")}</span></td>
              <td><strong>${esc(row?.current?.fullName || "—")}</strong></td>
              <td>${esc(row?.current?.matricule || "—")}<br><span class="tiny">${esc(row?.current?.className || "—")}</span></td>
              <td>${esc(reasonLabel(row?.reason))}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="8" class="tiny">Aucun élève actif pour ${esc(currentLabel)}.</td></tr>`}</tbody>
        </table></div>`;
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger le rapport nouveaux / anciens élèves : ${esc(String(err?.message || err))}</div>`;
    }
    return;
  }
  if(t === "duplicateStudents"){
    repSingleBody.innerHTML = `<div class="tiny">Analyse des noms en cours...</div>`;
    try{
      const payload = await apiFetch("/api/reports/duplicate-students");
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const headerHtml = buildReportDocHeaderHtml({
        title: "Doublons de noms d’élèves",
        subtitle: "Noms identiques et orthographes proches à vérifier",
        stats: [
          { label: "Année scolaire", value: payload?.schoolYearLabel || currentSchoolYearLabel() },
          { label: "Élèves analysés", value: String(Number(payload?.totalStudents || 0)) },
          { label: "Doublons exacts", value: String(Number(payload?.exactMatches || 0)) },
          { label: "Orthographes proches", value: String(Number(payload?.similarMatches || 0)) }
        ],
        fraisLabel: "Contrôle des doublons"
      });
      repSingleBody.innerHTML = `${headerHtml}
        <div class="tiny" style="margin:10px 0">Ce rapport signale les cas à vérifier; il ne fusionne ni ne supprime aucun élève.</div>
        <div class="table-wrap"><table style="width:100%;min-width:980px">
          <thead><tr><th>Type</th><th>Similarité</th><th>Premier élève</th><th>Matricule / classe</th><th>Deuxième élève</th><th>Matricule / classe</th></tr></thead>
          <tbody>${rows.map((row) => `<tr>
            <td><span class="badge ${row.matchType === "exact" ? "late" : "partial"}">${row.matchType === "exact" ? "Identique" : "Orthographe proche"}</span></td>
            <td><strong>${Math.round(Number(row.similarity || 0) * 100)} %</strong></td>
            <td><strong>${esc(row.left?.fullName || "—")}</strong>${row.left?.isActive === false ? `<div class="tiny">Inactif</div>` : ""}</td>
            <td>${esc(row.left?.matricule || "—")}<br><span class="tiny">${esc(row.left?.className || "—")}</span></td>
            <td><strong>${esc(row.right?.fullName || "—")}</strong>${row.right?.isActive === false ? `<div class="tiny">Inactif</div>` : ""}</td>
            <td>${esc(row.right?.matricule || "—")}<br><span class="tiny">${esc(row.right?.className || "—")}</span></td>
          </tr>`).join("") || `<tr><td colspan="6" class="tiny">Aucun doublon exact ou nom suffisamment proche détecté.</td></tr>`}</tbody>
        </table></div>`;
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible d’analyser les doublons: ${esc(String(err?.message || err))}</div>`;
    }
    return;
  }
  if(t === "inactiveStudents"){
    const targetStartYear = getActiveSchoolYearStartYear();
    const schoolYearLabel = schoolYearLabelFromStartYear(targetStartYear) || currentSchoolYearLabel();
    const schoolYearRangeLabel = Number.isFinite(Number(targetStartYear))
      ? `Septembre ${targetStartYear} - Juin ${Number(targetStartYear) + 1}`
      : schoolYearLabel;
    // Inactive students are excluded from /api/students by default — fetch them explicitly.
    repSingleBody.innerHTML = `<div class="tiny">Chargement des élèves inactifs...</div>`;
    let allStudents = [];
    try{
      allStudents = await apiFetch("/api/students?includeInactive=1");
      if(!Array.isArray(allStudents)) allStudents = [];
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger la liste (${esc(String(err?.message || "erreur"))}).</div>`;
      return;
    }
    const rows = buildEnrolledStudentsReportRows(targetStartYear, allStudents)
      .filter((row) => !row.isActive)
      .sort((a, b) => {
        const metaCmp = compareEnrollmentClassMeta(a, b);
        if(metaCmp !== 0) return metaCmp;
        return String(a.name || "").localeCompare(String(b.name || ""), "fr", { numeric: true, sensitivity: "base" });
      });

    const classGroups = new Map();
    for(const row of rows){
      const classKey = `${row.level}||${row.baseClass}`;
      const current = classGroups.get(classKey) || { level: row.level, baseClass: row.baseClass, rows: [] };
      current.rows.push(row);
      classGroups.set(classKey, current);
    }
    const classRows = Array.from(classGroups.values()).sort(compareEnrollmentClassMeta);

    const classSectionsHtml = classRows.map((group, idx) => {
      const classLabel = reportClassDisplayName(group.baseClass, group.level);
      const groupRows = group.rows;
      const classHeaderHtml = buildReportDocHeaderHtml({
        title: "Élèves inactifs (radiés)",
        subtitle: `Classe ${classLabel}`,
        stats: [
          { label: "Annee scolaire", value: schoolYearLabel },
          { label: "Classe", value: classLabel },
          { label: "Nb inactifs", value: String(groupRows.length) }
        ],
        meta: [
          { label: "Periode", value: schoolYearRangeLabel },
          { label: "Niveau", value: group.level || "-" }
        ],
        fraisLabel: "Inactifs"
      });
      const codeSectionsHtml = `
        <section class="report-late-group-section report-late-code-section">
          <div class="report-late-code-title">Classe ${esc(classLabel)}</div>
          <div class="table-wrap">
            <table style="width:100%">
              <thead>
                <tr><th>No</th><th>Code</th><th>Matricule</th><th>Eleve</th><th>Inscrit le</th><th>Catégorie</th><th>Note</th></tr>
              </thead>
              <tbody>
                ${groupRows.map((row, studentIdx) => `
                  <tr>
                    <td style="text-align:center">${studentIdx + 1}</td>
                    <td style="text-align:center">${esc(row.classCode || "-")}</td>
                    <td>${esc(row.matricule || row.studentId || "-")}</td>
                    <td><strong>${esc(row.name || "-")}</strong></td>
                    <td style="text-align:center">${row.enrolledAtIso ? fmtDateShort(new Date(row.enrolledAtIso)) : "-"}</td>
                    <td>${esc(row.inactiveReasonCategory || "-")}</td>
                    <td>${esc(row.inactiveReasonNote || "-")}</td>
                  </tr>
                `).join("") || `<tr><td colspan="7" class="tiny">Aucun eleve inactif dans cette classe.</td></tr>`}
              </tbody>
            </table>
          </div>
        </section>
      `;
      return `
        <section ${reportPrintClassAttributes(group.level, classLabel)} class="report-late-class-section ${idx > 0 ? "report-late-class-section--new-page" : ""}">
          ${classHeaderHtml}
          ${codeSectionsHtml}
        </section>
      `;
    }).join("");

    repSingleBody.innerHTML = classSectionsHtml
      ? `<div class="report-late-groups-wrap" style="margin-top:0">${classSectionsHtml}</div>`
      : `
        ${buildReportDocHeaderHtml({
          title: "Élèves inactifs (radiés)",
          subtitle: "Liste des eleves inactifs regroupes par classe",
          stats: [
            { label: "Annee scolaire", value: schoolYearLabel },
            { label: "Nb inactifs", value: "0" }
          ],
          meta: [{ label: "Periode", value: schoolYearRangeLabel }],
          fraisLabel: "Inactifs"
        })}
        <div class="report-late-groups-wrap" style="margin-top:12px">
          <div class="table-wrap"><table style="width:100%"><tbody><tr><td class="tiny">Aucun eleve inactif pour cette annee scolaire.</td></tr></tbody></table></div>
        </div>
      `;
    return;
  }
  if(t === "busSubscribers"){
    const schoolYearLabel = schoolYearLabelFromStartYear(getActiveSchoolYearStartYear()) || currentSchoolYearLabel();
    repSingleBody.innerHTML = `<div class="tiny">Chargement des abonnés bus...</div>`;
    let payload = null;
    try{
      payload = await apiFetch("/api/reports/bus-subscribers");
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger les abonnés bus (${esc(String(err?.message || "erreur"))}).</div>`;
      return;
    }
    const allSubs = Array.isArray(payload?.subscribers) ? payload.subscribers : [];
    const usedCategories = Array.isArray(payload?.categories) ? payload.categories : [];
    const hasUncategorized = allSubs.some((s) => !s.category);
    const validFilters = new Set(["__ALL__", ...usedCategories.map(String)]);
    if(hasUncategorized) validFilters.add("__NONE__");
    if(!validFilters.has(busSubscribersCategoryFilter)) busSubscribersCategoryFilter = "__ALL__";
    const filter = busSubscribersCategoryFilter;
    const shown = allSubs.filter((s) => {
      if(filter === "__ALL__") return true;
      if(filter === "__NONE__") return !s.category;
      return String(s.category || "") === filter;
    });
    const filterLabel = filter === "__ALL__" ? "Toutes les catégories"
      : (filter === "__NONE__" ? "Sans catégorie" : filter);
    const optionsHtml = [`<option value="__ALL__"${filter === "__ALL__" ? " selected" : ""}>Toutes les catégories</option>`]
      .concat(usedCategories.map((c) => `<option value="${esc(c)}"${filter === String(c) ? " selected" : ""}>${esc(c)}</option>`))
      .concat(hasUncategorized ? [`<option value="__NONE__"${filter === "__NONE__" ? " selected" : ""}>Sans catégorie</option>`] : [])
      .join("");
    const headerHtml = buildReportDocHeaderHtml({
      title: "Bus — Liste des abonnés",
      subtitle: `Catégorie: ${filterLabel}`,
      stats: [
        { label: "Annee scolaire", value: schoolYearLabel },
        { label: "Categorie", value: filterLabel },
        { label: "Nb abonnes", value: String(shown.length) }
      ],
      meta: [
        { label: "Total abonnes (toutes cat.)", value: String(allSubs.length) },
        { label: "Paiement", value: "non pris en compte" }
      ],
      fraisLabel: "Bus"
    });
    const rowsHtml = shown.map((s, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(s.matricule || s.studentId || "-")}</td>
        <td><strong>${esc(s.fullName || "-")}</strong></td>
        <td style="text-align:center">${esc(s.className || "-")}</td>
        <td style="text-align:center">${esc(s.category || "—")}</td>
        <td style="text-align:center"><span style="display:inline-block;width:13px;height:13px;border:1.5px solid #111;border-radius:2px"></span></td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="tiny">Aucun abonné pour ce filtre.</td></tr>`;
    repSingleBody.innerHTML = `
      <div class="report-controls" style="margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label class="tiny" for="busSubCatFilter" style="font-weight:600">Filtrer par catégorie:</label>
        <select id="busSubCatFilter" class="input" style="max-width:260px">${optionsHtml}</select>
        <span class="tiny">Imprimez (bouton Imprimer) pour obtenir la liste de la catégorie affichée.</span>
      </div>
      ${headerHtml}
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr><th>No</th><th>Matricule</th><th>Élève</th><th>Classe</th><th>Catégorie</th><th>Présent &#9744;</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
    const sel = document.getElementById("busSubCatFilter");
    if(sel){
      sel.addEventListener("change", () => {
        busSubscribersCategoryFilter = String(sel.value || "__ALL__");
        renderReports();
      });
    }
    return;
  }
  if(t === "tuitionBenefits"){
    const schoolYearLabel = schoolYearLabelFromStartYear(getActiveSchoolYearStartYear()) || currentSchoolYearLabel();
    repSingleBody.innerHTML = `<div class="tiny">Chargement des prises en charge...</div>`;
    let payload = null;
    try{
      payload = await apiFetch("/api/reports/tuition-benefits");
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger les prises en charge (${esc(String(err?.message || "erreur"))}).</div>`;
      return;
    }
    const list = Array.isArray(payload?.beneficiaries) ? payload.beneficiaries : [];
    const totalUSD = Number(payload?.totalUSD || 0);
    const totalCDF = Number(payload?.totalCDF || 0);
    const monthLbl = (mk) => mk ? monthLabelFromMonthKeyWithYear(mk) : "—";
    const headerHtml = buildReportDocHeaderHtml({
      title: "Prise en charge (personnel)",
      subtitle: "Élèves dont le minerval est pris en charge (réglé hors caisse)",
      stats: [
        { label: "Annee scolaire", value: schoolYearLabel },
        { label: "Nb beneficiaires", value: String(list.length) },
        { label: "Total couvert USD", value: formatUSD(totalUSD) }
      ],
      meta: [
        { label: "Total couvert CDF", value: `${Math.round(totalCDF).toLocaleString("fr-FR")} CDF` },
        { label: "Paiement", value: "hors caisse (avantage)" }
      ],
      fraisLabel: "Prise en charge"
    });
    const rowsHtml = list.map((b, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(b.matricule || b.studentId || "-")}</td>
        <td><strong>${esc(b.fullName || "-")}</strong></td>
        <td style="text-align:center">${esc(b.className || "-")}</td>
        <td>${esc(b.employeeName || "—")}</td>
        <td style="text-align:center">${esc(monthLbl(b.startMonth))}${b.endMonth ? " → " + esc(monthLbl(b.endMonth)) : ""}</td>
        <td style="text-align:center">${Number(b.coveredMonths || 0)}</td>
        <td style="text-align:right">${b.coveredUSD ? formatUSD(Number(b.coveredUSD)) : (b.coveredCDF ? Math.round(b.coveredCDF).toLocaleString("fr-FR") + " CDF" : "—")}</td>
      </tr>
    `).join("") || `<tr><td colspan="8" class="tiny">Aucune prise en charge active.</td></tr>`;
    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr><th>No</th><th>Matricule</th><th>Élève</th><th>Classe</th><th>Employé</th><th>Période</th><th>Mois</th><th>Couvert</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
    return;
  }
  if(t === "enrolledImpayes"){
    const targetStartYear = getActiveSchoolYearStartYear();
    const schoolYearLabel = schoolYearLabelFromStartYear(targetStartYear) || currentSchoolYearLabel();
    const schoolYearRangeLabel = Number.isFinite(Number(targetStartYear))
      ? `Septembre ${targetStartYear} - Juin ${Number(targetStartYear) + 1}`
      : schoolYearLabel;

    repSingleBody.innerHTML = `<div class="tiny">Chargement des mois impayés...</div>`;
    let statusesByStudent = new Map();
    let statusesCurrency = "USD";
    try{
      const statusesApi = await apiFetch("/api/students/statuses?feeCode=TUITION");
      for(const row of Array.isArray(statusesApi?.rows) ? statusesApi.rows : []){
        statusesByStudent.set(String(row?.studentId || ""), row);
        if(row?.currency) statusesCurrency = String(row.currency).toUpperCase();
      }
    }catch(err){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger les statuts de paiement (${esc(String(err?.message || "API indisponible"))}). Réessayez.</div>`;
      return;
    }

    const monthAbbrFromMonthKey = (mk) => {
      const m = Number(String(mk || "").split("-")[1] || 0);
      const abbr = ["", "JAN", "FEV", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOUT", "SEPT", "OCT", "NOV", "DEC"];
      return abbr[m] || String(mk || "");
    };
    const unpaidAmountLabel = (remaining, currency) => {
      const rem = Number(remaining || 0);
      if(!(rem > 0)) return "";
      if(String(currency || "USD").toUpperCase() === "CDF"){
        return `${formatIntSpaced(Math.round(rem))} FC`;
      }
      const rounded = Math.round(rem * 100) / 100;
      return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}$`;
    };
    const buildImpayesCell = (st, casSocial = false) => {
      const unpaid = Array.isArray(st?.monthsUnpaid) ? st.monthsUnpaid : [];
      if(!unpaid.length){
        if(casSocial){
          return { html: `<span style="color:#2563eb;font-weight:700">CAS SOCIAL</span>`, resteTotal: 0, lateCount: 0 };
        }
        return { html: `<span style="color:#15803d;font-weight:700">EN ORDRE</span>`, resteTotal: 0, lateCount: 0 };
      }
      const currency = String(st?.currency || statusesCurrency || "USD").toUpperCase();
      const parts = unpaid.map((entry) => {
        const abbr = monthAbbrFromMonthKey(entry?.monthKey);
        const partial = Number(entry?.paid || 0) > 0;
        return partial ? `${abbr} ${unpaidAmountLabel(entry?.remaining, currency)}` : abbr;
      });
      const resteTotal = unpaid.reduce((sum, entry) => sum + Number(entry?.remaining || 0), 0);
      const casPrefix = casSocial ? `<span style="color:#2563eb;font-weight:700">CAS SOCIAL</span> &mdash; ` : "";
      return {
        html: `${casPrefix}<span style="color:#dc2626;font-weight:700">${esc(parts.join(", "))}</span>`,
        resteTotal,
        lateCount: unpaid.length
      };
    };
    const studentById = new Map((Array.isArray(students) ? students : []).map((s) => [String(s?.id || ""), s]));

    const rows = buildEnrolledStudentsReportRows(targetStartYear)
      .filter((row) => row.isActive)
      .sort((a, b) => {
        const metaCmp = compareEnrollmentClassMeta(a, b);
        if(metaCmp !== 0) return metaCmp;
        const codeA = String(a.classCode || "").trim();
        const codeB = String(b.classCode || "").trim();
        if(codeA !== codeB){
          if(!codeA) return 1;
          if(!codeB) return -1;
          const codeCmp = codeA.localeCompare(codeB, "fr", { numeric: true, sensitivity: "base" });
          if(codeCmp !== 0) return codeCmp;
        }
        return String(a.name || "").localeCompare(String(b.name || ""), "fr", { numeric: true, sensitivity: "base" });
      });

    const classGroups = new Map();
    for(const row of rows){
      const classKey = `${row.level}||${row.baseClass}`;
      const current = classGroups.get(classKey) || {
        level: row.level,
        baseClass: row.baseClass,
        rows: []
      };
      current.rows.push(row);
      classGroups.set(classKey, current);
    }
    const classRows = Array.from(classGroups.values()).sort(compareEnrollmentClassMeta);

    const classSectionsHtml = classRows.map((group, idx) => {
      const classLabel = reportClassDisplayName(group.baseClass, group.level);
      const groupRows = group.rows;
      let classResteTotal = 0;
      let classEnOrdre = 0;
      let classCasSocial = 0;
      const bodyRowsHtml = groupRows.map((row, studentIdx) => {
        const st = statusesByStudent.get(String(row.studentId || "")) || null;
        const casSocial = isCasSocialStudent(studentById.get(String(row.studentId || "")) || null);
        if(casSocial) classCasSocial += 1;
        const cell = buildImpayesCell(st, casSocial);
        classResteTotal += cell.resteTotal;
        if(cell.lateCount === 0 || casSocial) classEnOrdre += 1;
        const enrolledLabel = row.enrolledAtIso ? fmtDateShort(new Date(row.enrolledAtIso)) : "-";
        const currency = String(st?.currency || statusesCurrency || "USD").toUpperCase();
        const resteLabel = cell.resteTotal > 0 ? unpaidAmountLabel(cell.resteTotal, currency) : "-";
        return `
          <tr>
            <td style="text-align:center">${studentIdx + 1}</td>
            <td style="text-align:center">${esc(row.classCode || "-")}</td>
            <td>${esc(row.matricule || row.studentId || "-")}</td>
            <td><strong>${esc(row.name || "-")}</strong></td>
            <td style="text-align:center">${esc(enrolledLabel)}</td>
            <td>${cell.html}</td>
            <td style="text-align:right;font-weight:700">${esc(resteLabel)}</td>
          </tr>
        `;
      }).join("");
      const classCurrency = statusesCurrency || "USD";
      const classHeaderHtml = buildReportDocHeaderHtml({
        title: "Élèves — mois impayés",
        subtitle: `Classe ${classLabel}`,
        stats: [
          { label: "Annee scolaire", value: schoolYearLabel },
          { label: "Classe", value: classLabel },
          { label: "Nb total", value: String(groupRows.length) },
          { label: "En ordre", value: String(classEnOrdre) },
          { label: "CAS SOCIAL", value: String(classCasSocial) },
          { label: "Reste classe", value: classResteTotal > 0 ? unpaidAmountLabel(classResteTotal, classCurrency) : "0" }
        ],
        meta: [
          { label: "Periode", value: schoolYearRangeLabel },
          { label: "Niveau", value: group.level || "-" },
          { label: "Type de frais", value: getTuitionFeeDisplayLabel() }
        ],
        fraisLabel: "Mois impayes"
      });
      return `
        <section ${reportPrintClassAttributes(group.level, classLabel)} class="report-late-class-section ${idx > 0 ? "report-late-class-section--new-page" : ""}">
          ${classHeaderHtml}
          <section class="report-late-group-section report-late-code-section">
            <div class="report-late-code-title">Classe ${esc(classLabel)}</div>
            <div class="table-wrap">
              <table style="width:100%">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Code</th>
                    <th>Matricule</th>
                    <th>Eleve</th>
                    <th>Date inscrit</th>
                    <th>Mois impayes</th>
                    <th style="text-align:right">Reste</th>
                  </tr>
                </thead>
                <tbody>
                  ${bodyRowsHtml || `<tr><td colspan="7" class="tiny">Aucun eleve dans cette classe.</td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      `;
    }).join("");

    repSingleBody.innerHTML = classSectionsHtml
      ? `<div class="report-late-groups-wrap" style="margin-top:0">${classSectionsHtml}</div>`
      : `
        ${buildReportDocHeaderHtml({
          title: "Élèves — mois impayés",
          subtitle: "Liste des eleves actifs avec mois impayes et reste a payer",
          stats: [
            { label: "Annee scolaire", value: schoolYearLabel },
            { label: "Nb total eleves", value: "0" }
          ],
          meta: [
            { label: "Periode", value: schoolYearRangeLabel }
          ],
          fraisLabel: "Mois impayes"
        })}
        <div class="report-late-groups-wrap" style="margin-top:12px">
          <div class="table-wrap"><table style="width:100%"><tbody><tr><td class="tiny">Aucun eleve inscrit pour cette annee scolaire.</td></tr></tbody></table></div>
        </div>
      `;
    return;
  }
  if(t === "summary"){
    const paid = d.rows.filter(r => r.paidUSD > 0).length;
    const late = d.rows.filter(r => r.remainingUSD > 0).length;
    const headerHtml = buildReportDocHeaderHtml({
      title: "Résumé du mois (général)",
      subtitle: "Synthèse mensuelle des encaissements, dépenses et soldes",
      stats: [
        { label: "Année scolaire", value: schoolYearLabelFromMonthKey(reportMonthKey) },
        { label: "Mois", value: monthLabelFromMonthKeyWithYear(reportMonthKey || selectedReportMonthKey()) },
        { label: "Nb total élèves", value: String(d.rows.length) },
        { label: "Élèves en retard", value: String(late) }
      ],
      meta: [
        { label: "Type de frais", value: d.tuitionLabel || getTuitionFeeDisplayLabel() },
        { label: "Taux utilisé", value: monthRateLabel(d.month) },
        { label: "Net (reçu - dépenses)", value: formatUsdCdfCombined(d.netUSD, d.netCDF) }
      ],
      fraisLabel: d.tuitionLabel || getTuitionFeeDisplayLabel()
    });
    const moisLabel = monthLabelFromMonthKeyWithYear(reportMonthKey || selectedReportMonthKey());
    const inOrder = d.rows.filter((r) => Number(r.remainingUSD || 0) <= 0).length;
    const recRate = d.rows.length > 0
      ? Math.min(100, Math.round(100 * inOrder / d.rows.length))
      : null;
    const cdf = (n) => `${formatIntSpaced(Math.round(Number(n || 0)))} CDF`;
    // Section = en-tête coloré + tableau clé/valeur. big => valeur mise en avant.
    const sec = (title, color, kv) => `
      <div style="margin-top:14px;break-inside:avoid">
        <div style="background:${color};color:#fff;font-weight:700;padding:7px 12px;border-radius:9px 9px 0 0;font-size:13px;letter-spacing:.2px">${title}</div>
        <div class="table-wrap" style="border-top:none;border-radius:0 0 9px 9px;margin-top:0">
          <table style="width:100%"><tbody>
            ${kv.map(([k, v, big]) => `<tr><td style="width:58%">${k}</td><td style="text-align:right"><strong style="${big ? "font-size:16px;color:" + color : ""}">${v}</strong></td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>`;
    const eleves = sec("👥 Élèves", "#12355B", [
      ["Total élèves", String(d.rows.length)],
      ["Élèves en ordre", String(inOrder)],
      ["Élèves ayant payé (ce mois)", String(paid)],
      ["Élèves en retard", String(late)],
      ["Taux de recouvrement (minerval)", recRate == null ? "—" : recRate + " %", true]
    ]);
    const minerval = sec(`💰 Minerval — ${moisLabel}`, "#1B8A8F", [
      ["Montant dû", formatUSD(d.totalDueUSD)],
      ["Reçu (USD)", formatUSD(Number(d.totalTuitionReceivedUSD || 0))],
      ["Reçu (CDF)", cdf(d.totalTuitionReceivedCDF)],
      ["Reste à recouvrer", formatUSD(d.totalRemainUSD), true]
    ]);
    const bus = sec(`🚌 Bus — ${moisLabel}`, "#3A6EA5", [
      ["Bus attendu", formatUSD(Number(summaryApi?.bus?.expected || 0))],
      ["Bus reçu (USD)", formatUSD(Number(summaryApi?.bus?.collectedUSD || 0))],
      ["Bus reçu (CDF)", cdf(Number(summaryApi?.bus?.collectedCDF || 0))],
      ["Bus restant", formatUSD(Number(summaryApi?.bus?.remaining || 0))]
    ]);
    const caisse = sec("🧾 Caisse — encaissements, dépenses, net", "#7A5C2E", [
      ["Total reçu", formatUsdCdfCombined(d.totalReceivedUSD, d.totalReceivedCDF)],
      ["Total dépenses", formatUsdCdfCombined(d.totalSpendingUSD, d.totalSpendingCDF)],
      ["NET (reçu − dépenses)", formatUsdCdfCombined(d.netUSD, d.netCDF), true]
    ]);
    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="tiny" style="margin:8px 0 2px">Taux utilisé : <strong>${monthRateLabel(d.month)}</strong></div>
      ${eleves}
      ${minerval}
      ${bus}
      ${caisse}
    `;
    return;
  }

  if(t === "level"){
    const totalStudentsCount = d.levels.reduce((sum, lvl) => sum + Number(d.levelAgg[lvl]?.total || 0), 0);
    const classTotalsRows = (() => {
      const rows = Array.isArray(d.rows) ? d.rows : [];
      const byClass = new Map();
      for(const row of rows){
        const levelLabel = fmtReportLevelLabel(row?.level || "");
        const rawClassName = String(row?.className || "—").trim() || "—";
        const parsedClass = splitReportClassBaseCode(rawClassName);
        let classBase = String(parsedClass.baseClass || rawClassName).trim() || "—";
        let sectionCode = String(parsedClass.code || "—").trim() || "—";
        if(sectionCode === "—"){
          const compactSection = rawClassName.match(/^(\d{1,2}(?:ere|ère|re|er|e)?)\s*([A-Z])$/i);
          if(compactSection){
            classBase = compactSection[1];
            sectionCode = compactSection[2].toUpperCase();
          }
        }
        let classLabel = reportClassDisplayName(classBase, levelLabel);
        let combinesAllSections = sectionCode !== "—";
        if(levelLabel === "Secondaire"){
          const secondaryGroups = [
            { pattern: /^7e\s*EB\b/i, base: "7e EB" },
            { pattern: /^8e\s*EB\b/i, base: "8e EB" },
            { pattern: /^1(?:re|er)\s*H\b/i, base: "1re H" },
            { pattern: /^2e\s*H\b/i, base: "2e H" },
            { pattern: /^3e\s*H\b/i, base: "3e H" },
            { pattern: /^4e\s*H\b/i, base: "4e H" }
          ];
          const group = secondaryGroups.find((item) => item.pattern.test(rawClassName));
          if(group){
            classBase = group.base;
            classLabel = group.base;
            combinesAllSections = true;
          }
        }
        const key = `${levelLabel}||${classBase}`;
        const current = byClass.get(key) || {
          level: levelLabel || "—",
          classLabel,
          classBase,
          combinesAllSections: false,
          total: 0
        };
        current.combinesAllSections = current.combinesAllSections || combinesAllSections;
        current.total += 1;
        byClass.set(key, current);
      }
      return Array.from(byClass.values()).map((row) => ({
        ...row,
        classLabel: row.combinesAllSections ? `${row.classLabel} — toutes sections` : row.classLabel
      })).sort((a, b) => {
        const rankA = classOrderRankForLateReport(a.level, a.classBase);
        const rankB = classOrderRankForLateReport(b.level, b.classBase);
        if(rankA.levelRank !== rankB.levelRank) return rankA.levelRank - rankB.levelRank;
        if(rankA.classRank !== rankB.classRank) return rankA.classRank - rankB.classRank;
        return String(a.classLabel || "").localeCompare(String(b.classLabel || ""), "fr", { numeric: true, sensitivity: "base" });
      });
    })();
    const headerHtml = buildReportDocHeaderHtml({
      title: "Résumé du mois par niveau",
      subtitle: "Comparaison du paiement mensuel par niveau",
      stats: [
        { label: "Année scolaire", value: schoolYearLabelFromMonthKey(reportMonthKey) },
        { label: "Mois", value: monthLabelFromMonthKeyWithYear(reportMonthKey || selectedReportMonthKey()) },
        { label: "Niveaux affichés", value: String(d.levels.length) },
        { label: "Nb total élèves", value: String(totalStudentsCount) },
        { label: "Classes affichées", value: String(classTotalsRows.length) }
      ],
      meta: [
        { label: "Type de frais", value: d.tuitionLabel || getTuitionFeeDisplayLabel() },
        { label: "Taux utilisé", value: monthRateLabel(d.month) },
        { label: "Reste global", value: formatUSD(d.totalRemainUSD) }
      ],
      fraisLabel: d.tuitionLabel || getTuitionFeeDisplayLabel()
    });
    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap" style="margin-bottom:10px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Classe / regroupement</th>
              <th>Total élèves</th>
            </tr>
          </thead>
          <tbody>
            ${classTotalsRows.map((row) => `
              <tr>
                <td><strong>${esc(row.level)}</strong></td>
                <td>${esc(row.classLabel)}</td>
                <td><strong>${Number(row.total || 0)}</strong></td>
              </tr>
            `).join("") || `<tr><td colspan="3" class="tiny">Aucune classe.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-wrap">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Total élèves</th>
              <th>Payé</th>
              <th>%</th>
              <th>Dû (USD)</th>
              <th>Payé (USD)</th>
              <th>Reste (USD)</th>
            </tr>
          </thead>
          <tbody>
            ${d.levels.map(lvl => {
              const a = d.levelAgg[lvl];
              const pct = a.total ? Math.round((a.paidCount / a.total) * 100) : 0;
              return `<tr>
                <td><strong>${esc(lvl)}</strong></td>
                <td>${a.total}</td>
                <td>${a.paidCount}</td>
                <td>${formatPctBadge(pct)}</td>
                <td>${formatUSD(a.dueUSD)}</td>
                <td>${formatUSD(a.paidUSD)}</td>
                <td><strong>${formatUSD(a.remainUSD)}</strong></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  if(t === "daily"){
    const dailyEntriesApi = await loadDailyEntriesReportApi(selectedDateIso);
    const apiEntryRows = Array.isArray(dailyEntriesApi?.details)
      ? dailyEntriesApi.details
        .filter((r) => toDateISO(r?.createdAt || selectedDateIso) === selectedDateIso)
        .map((r) => {
          const currency = normalizeCurrencyCode(r.currency || "USD");
          const amount = Number(
            r.amount != null
              ? r.amount
              : (currency === "CDF" ? (r.amountCDF || 0) : (r.amountUSD || 0))
          );
          const hasTenderSplit = r.amountUSD != null || r.amountCDF != null || r.amountUSDReceived != null || r.amountCDFReceived != null;
          const split = hasTenderSplit
            ? {
                usd: Math.max(0, Number(r.amountUSD ?? r.amountUSDReceived ?? 0)),
                cdf: Math.max(0, Number(r.amountCDF ?? r.amountCDFReceived ?? 0))
              }
            : splitAmountByCurrency(amount, currency);
          return {
            time: fmtDateTime(new Date(r.createdAt || Date.now())).split(" ")[1] || "--:--",
            type: "Entrée",
            receiptNo: r.receiptNo || "—",
            level: fmtReportLevelLabel(r.level || ""),
            feeType: getLiveFeeLabel(r) || r.feeType || "Paiement",
            paidMonth: monthLabelFromMonthKey(r.paidForMonth || ""),
            currency: split.usd > 0 && split.cdf > 0 ? "MIXED" : currency,
            amount,
            usd: split.usd,
            cdf: split.cdf
          };
        })
      : null;
    const entries = getPayments()
      .filter(p => toDateISO(p.createdAt || new Date()) === selectedDateIso)
      .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const allSpendings = getSchoolYearScopedSpendings();
    let exits = allSpendings
      .filter(s => spendingEffectiveDateISO(s) === selectedDateIso && !isStatePaidSpending(s))
      .sort((a,b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));

    const entryDetailsRows = Array.isArray(apiEntryRows)
      ? apiEntryRows
        : entries.map((p) => {
          const currency = normalizeCurrencyCode(p.currency || "USD");
          const amount = Number(p.amountEntered ?? p.amount ?? 0);
          const split = paymentAmountSplit(p);
          return {
            time: fmtDateTime(new Date(p.createdAt || Date.now())).split(" ")[1] || "--:--",
            type: "Entrée",
            receiptNo: p.receiptNo || "—",
            level: fmtReportLevelLabel(p.level || ""),
            feeType: getLiveFeeLabel(p) || p.feeType || "Paiement",
            paidMonth: p.month || monthLabelFromMonthKey(p.paidForMonth || p.monthKey || ""),
            currency: split.usd > 0 && split.cdf > 0 ? "MIXED" : currency,
            amount,
            usd: split.usd,
            cdf: split.cdf
          };
        });
    const entryTotals = entryDetailsRows.reduce((sum, p) => {
      sum.usd += Number(p.usd || 0);
      sum.cdf += Number(p.cdf || 0);
      return sum;
    }, { usd: 0, cdf: 0 });
    const exitTotals = exits.reduce((sum, s) => {
      const part = spendingAmountSplit(s);
      sum.usd += Number(part.usd || 0);
      sum.cdf += Number(part.cdf || 0);
      return sum;
    }, { usd: 0, cdf: 0 });
    // Report 8 is a daily movement report: its balance must only use the
    // selected day's entries and exits. Do not use the cumulative cash balance
    // here, otherwise amounts from previous days leak into "Solde du jour".
    const netUSD = Number((Number(entryTotals.usd || 0) - Number(exitTotals.usd || 0)).toFixed(2));
    const netCDF = Math.round(Number(entryTotals.cdf || 0) - Number(exitTotals.cdf || 0));
    const movementCount = (Array.isArray(apiEntryRows) ? apiEntryRows.length : entries.length) + exits.length;
    const dayMonthLabel = MONTH_LABELS_FR[new Date(selectedDateIso).getMonth()] || d.month;
    const headerHtml = buildReportDocHeaderHtml({
      title: "Journée — entrées, sorties, solde",
      subtitle: "Mouvements du jour : encaissements et dépenses",
      stats: [
        { label: "Année scolaire", value: currentSchoolYearLabel() },
        { label: "Date", value: fmtDateShort(new Date(selectedDateIso)) },
        { label: "Mouvements", value: String(movementCount) },
        { label: "Solde USD", value: formatUSD(netUSD) },
        { label: "Solde CDF", value: `${formatIntSpaced(netCDF)} CDF` }
      ],
      meta: [
        { label: "Entrées USD", value: formatUSD(entryTotals.usd) },
        { label: "Entrées CDF", value: `${formatIntSpaced(Math.round(entryTotals.cdf))} CDF` },
        { label: "Sorties USD", value: formatUSD(exitTotals.usd) },
        { label: "Sorties CDF", value: `${formatIntSpaced(Math.round(exitTotals.cdf))} CDF` },
        { label: "Taux de référence", value: monthRateLabel(dayMonthLabel) }
      ],
      fraisLabel: "Tous frais"
    });
    const entryLevelTotals = buildEntryTotalsByLevelRows(entryDetailsRows);

    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Mouvement</th>
              <th>USD</th>
              <th>CDF</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Date</td><td colspan="2"><strong>${fmtDateShort(new Date(selectedDateIso))}</strong></td></tr>
            <tr><td>Entrées</td><td><strong>${formatUSD(entryTotals.usd)}</strong></td><td><strong>${formatIntSpaced(Math.round(entryTotals.cdf))} CDF</strong></td></tr>
            <tr><td>Sorties</td><td><strong>${formatUSD(exitTotals.usd)}</strong></td><td><strong>${formatIntSpaced(Math.round(exitTotals.cdf))} CDF</strong></td></tr>
            <tr style="background:#eef2ff"><td><strong>Solde du jour</strong></td><td><strong>${formatUSD(netUSD)}</strong></td><td><strong>${formatIntSpaced(netCDF)} CDF</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Nb reçus</th>
              <th>Total entrées (USD)</th>
              <th>Total entrées (CDF)</th>
            </tr>
          </thead>
          <tbody>
            ${entryLevelTotals.map((r) => `
              <tr>
                <td><strong>${esc(r.level)}</strong></td>
                <td>${Number(r.count || 0)}</td>
                <td><strong>${formatUSD(Number(r.totalUSD || 0))}</strong></td>
                <td><strong>${formatIntSpaced(Math.round(Number(r.totalCDF || 0)))} CDF</strong></td>
              </tr>
            `).join("") || `<tr><td colspan="4" class="tiny">Aucune entrée pour cette date.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Heure</th>
              <th>Type</th>
              <th>Réf / Niveau</th>
              <th>Type de frais / Détail</th>
              <th>Mois payé</th>
              <th>Montant (USD)</th>
              <th>Montant (CDF)</th>
            </tr>
          </thead>
          <tbody>
            ${
              [
                ...entryDetailsRows.map(p => ({
                  time: p.time,
                  type: "Entrée",
                  refLevel: `${p.receiptNo || "—"} • ${p.level || "—"}`,
                  detail: p.feeType || "Paiement",
                  paidMonth: p.paidMonth || "—",
                  currency: p.currency || "USD",
                  usd: Number(p.usd || 0),
                  cdf: Number(p.cdf || 0)
                })),
                ...exits.map((s) => {
                  const part = spendingAmountSplit(s);
                  return {
                    time: (spendingEffectiveDateISO(s) ? fmtDateShort(new Date(spendingEffectiveDateISO(s))) : "--:--"),
                    type: "Sortie",
                    refLevel: "—",
                    detail: `${s.description || "—"}`,
                    paidMonth: "—",
                    currency: normalizeCurrencyCode(s.currency || "USD"),
                    usd: Number(part.usd || 0),
                    cdf: Number(part.cdf || 0)
                  };
                })
              ]
                .sort((a,b) => String(b.time).localeCompare(String(a.time)))
                .map((r) => {
                  const usdCell = Number(r.usd || 0) > 0.0049 || normalizeCurrencyCode(r.currency || "USD") === "USD"
                    ? formatUSD(Number(r.usd || 0))
                    : "—";
                  const cdfCell = Number(r.cdf || 0) > 0.0049 || normalizeCurrencyCode(r.currency || "USD") === "CDF"
                    ? `${formatIntSpaced(Math.round(Number(r.cdf || 0)))} CDF`
                    : "—";
                  return `<tr>
                  <td>${esc(r.time)}</td>
                  <td>${esc(r.type)}</td>
                  <td>${esc(r.refLevel || "—")}</td>
                  <td>${esc(r.detail)}</td>
                  <td>${esc(r.paidMonth || "—")}</td>
                  <td><strong>${usdCell}</strong></td>
                  <td><strong>${cdfCell}</strong></td>
                </tr>`;
                })
                .join("") || `<tr><td colspan="7" class="tiny">Aucun mouvement pour cette date.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  if(t === "dailyEntriesLevel"){
    const data = await loadDailyEntriesReportApi(selectedDateIso, { force: true });
    const aggregates = Array.isArray(data?.aggregates) ? data.aggregates : [];
    const details = Array.isArray(data?.details) ? data.details : [];
    const totalUsd = Number(data?.totalUSD || 0);
    const totalCdf = Number(data?.totalCDF || 0);
    const entryLevelTotals = ["Maternelle","Primaire","Secondaire"].map((lvl) => {
      const rows = aggregates.filter((a) => fmtReportLevelLabel(a.level || "") === lvl);
      return {
        level: lvl,
        count: rows.reduce((n, a) => n + Number(a.count || 0), 0),
        totalUSD: rows.reduce((n, a) => n + Number(a.totalUSD || 0), 0),
        totalCDF: rows.reduce((n, a) => n + Number(a.totalCDF || 0), 0)
      };
    }).filter((r) => r.count > 0);
    const dayMonthLabel = MONTH_LABELS_FR[new Date(selectedDateIso).getMonth()] || d.month;
    const headerHtml = buildReportDocHeaderHtml({
      title: "Entrées du jour par niveau",
      subtitle: "Totaux d'encaissement regroupés par niveau, type de frais et mois payé",
      stats: [
        { label: "Année scolaire", value: currentSchoolYearLabel() },
        { label: "Date", value: fmtDateShort(new Date(selectedDateIso)) },
        { label: "Nb reçus", value: String(Number(data?.totalEntries || details.length || 0)) },
        { label: "Nb groupes", value: String(aggregates.length) }
      ],
      meta: [
        { label: "Total USD", value: formatUSD(totalUsd) },
        { label: "Total CDF", value: `${formatIntSpaced(totalCdf)} CDF` },
        { label: "Taux de référence", value: monthRateLabel(dayMonthLabel) }
      ],
      fraisLabel: "Tous frais"
    });
    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Indicateur</th>
              <th>Valeur</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Date</td><td><strong>${fmtDateShort(new Date(selectedDateIso))}</strong></td></tr>
            <tr><td>Nombre d'entrées</td><td><strong>${Number(data?.totalEntries || details.length || 0)}</strong></td></tr>
            <tr><td>Total entrées (USD)</td><td><strong>${formatUSD(totalUsd)}</strong></td></tr>
            <tr><td>Total entrées (CDF)</td><td><strong>${formatIntSpaced(Math.round(totalCdf))} CDF</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Nb reçus</th>
              <th>Total entrées (USD)</th>
              <th>Total entrées (CDF)</th>
            </tr>
          </thead>
          <tbody>
            ${entryLevelTotals.map((r) => `
              <tr>
                <td><strong>${esc(r.level)}</strong></td>
                <td>${Number(r.count || 0)}</td>
                <td><strong>${formatUSD(Number(r.totalUSD || 0))}</strong></td>
                <td><strong>${formatIntSpaced(Math.round(Number(r.totalCDF || 0)))} CDF</strong></td>
              </tr>
            `).join("") || `<tr><td colspan="4" class="tiny">Aucune entrée pour cette date.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Niveau</th>
              <th>Type de frais</th>
              <th>Mois payé</th>
              <th>Nb reçus</th>
              <th>Total (USD)</th>
              <th>Total (CDF)</th>
            </tr>
          </thead>
          <tbody>
            ${aggregates.map((a) => `
              <tr>
                <td><strong>${esc(fmtReportLevelLabel(a.level || ""))}</strong></td>
                <td>${esc(getLiveFeeLabel(a) || a.feeType || "—")}</td>
                <td>${esc(monthLabelFromMonthKeyWithYear(a.paidForMonth || ""))}</td>
                <td>${Number(a.count || 0)}</td>
                <td>${formatUSD(Number(a.totalUSD || 0))}</td>
                <td>${String(a.totalCDF || 0).toUpperCase() === "NAN" ? "0 CDF" : `${formatIntSpaced(Number(a.totalCDF || 0))} CDF`}</td>
              </tr>
            `).join("") || `<tr><td colspan="6" class="tiny">Aucune entrée pour cette date.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  if(t === "dailyEntriesCaisse" || t === "dailyCaisseArticlesSummary"){
    const combinedArticles = t === "dailyCaisseArticlesSummary";
    if(combinedArticles && !hasRole("admin")){
      repSingleBody.innerHTML = `<div class="tiny">Accès réservé aux administrateurs.</div>`;
      return;
    }
    let data;
    try{
      data = combinedArticles
        ? await apiFetch(`/api/reports/daily-caisse-articles-summary?date=${encodeURIComponent(selectedDateIso)}`)
        : await loadDailyCaisseEntriesReportApi(selectedDateIso, { force: true });
    }catch(error){
      repSingleBody.innerHTML = `<div class="tiny">Impossible de charger le rapport : ${esc(String(error?.message || error))}</div>`;
      return;
    }
    const aggregates = Array.isArray(data?.aggregates) ? data.aggregates : [];
    const details = Array.isArray(data?.details) ? data.details : [];
    const dayMonthLabel = MONTH_LABELS_FR[new Date(selectedDateIso).getMonth()] || d.month;
    const calcTotalEntryUSD = aggregates.reduce((sum, row) => sum + Number(row.totalEntryUSD ?? (Number(row.entreesUSD || 0) + Number(row.transfertInUSD || 0))), 0);
    const calcTotalEntryCDF = aggregates.reduce((sum, row) => sum + Number(row.totalEntryCDF ?? (Number(row.entreesCDF || 0) + Number(row.transfertInCDF || 0))), 0);
    const calcTotalExitUSD = aggregates.reduce((sum, row) => sum + Number(row.totalExitUSD ?? (Number(row.depensesUSD || 0) + Number(row.transfertOutUSD || 0))), 0);
    const calcTotalExitCDF = aggregates.reduce((sum, row) => sum + Number(row.totalExitCDF ?? (Number(row.depensesCDF || 0) + Number(row.transfertOutCDF || 0))), 0);
    const totalEntryUSD = Number(data?.totalEntryUSD ?? calcTotalEntryUSD);
    const totalEntryCDF = Number(data?.totalEntryCDF ?? calcTotalEntryCDF);
    const totalExitUSD = Number(data?.totalExitUSD ?? calcTotalExitUSD);
    const totalExitCDF = Number(data?.totalExitCDF ?? calcTotalExitCDF);
    const netCaisseUSD = Number(data?.totalUSD ?? (totalEntryUSD - totalExitUSD));
    const netCaisseCDF = Number(data?.totalCDF ?? (totalEntryCDF - totalExitCDF));
    const headerHtml = buildReportDocHeaderHtml({
      title: combinedArticles ? "Caisses du jour" : "Entrées du jour par caisse",
      subtitle: combinedArticles ? "Les articles vendus sont réunis sur une seule ligne" : "Mouvements du jour regroupes par caisse",
      stats: [
        { label: "Annee scolaire", value: currentSchoolYearLabel() },
        { label: "Date", value: fmtDateShort(new Date(selectedDateIso)) },
        { label: "Total élèves actifs", value: String(Number(data?.totalActiveStudents || 0)) },
        { label: "Élèves inscrits ce jour", value: String(Number(data?.totalStudentsEnrolled || 0)) },
        { label: "Nb entrees", value: String(Number(data?.totalEntries || details.length || 0)) },
        { label: combinedArticles ? "Nb groupes" : "Nb caisses", value: String(aggregates.length) }
      ],
      meta: [
        { label: "Total entrées USD", value: formatUSD(totalEntryUSD) },
        { label: "Total entrées CDF", value: `${formatIntSpaced(Math.round(totalEntryCDF))} CDF` },
        { label: "Total sorties USD", value: formatUSD(totalExitUSD) },
        { label: "Total sorties CDF", value: `${formatIntSpaced(Math.round(totalExitCDF))} CDF` },
        { label: "Taux de reference", value: monthRateLabel(dayMonthLabel) }
      ],
      fraisLabel: "Toutes les caisses"
    });
    const moneyPair = (usd, cdf, { sign = false } = {}) => {
      const fmtU = (v) => (sign && v > 0 ? "+" : "") + formatUSD(v);
      const fmtC = (v) => (sign && v > 0 ? "+" : "") + `${formatIntSpaced(Math.round(v))} CDF`;
      const parts = [];
      if(Math.abs(Number(usd || 0)) > 0.0049) parts.push(fmtU(Number(usd)));
      if(Math.abs(Number(cdf || 0)) > 0.0049) parts.push(fmtC(Number(cdf)));
      return parts.join("<br>") || "—";
    };
    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap">
        <table style="width:100%">
          <thead><tr><th>Mouvement</th><th>USD</th><th>CDF</th></tr></thead>
          <tbody>
            <tr><td>Date</td><td colspan="2"><strong>${fmtDateShort(new Date(selectedDateIso))}</strong> <span class="tiny">• ${Number(data?.totalEntries || details.length || 0)} paiement(s) • ${Number(data?.totalStudentsEnrolled || 0)} élève(s) inscrit(s)</span></td></tr>
            <tr><td>Total entrées</td><td><strong>${formatUSD(totalEntryUSD)}</strong></td><td><strong>${formatIntSpaced(Math.round(totalEntryCDF))} CDF</strong></td></tr>
            <tr><td>Total sorties</td><td><strong>${formatUSD(totalExitUSD)}</strong></td><td><strong>${formatIntSpaced(Math.round(totalExitCDF))} CDF</strong></td></tr>
            <tr style="background:#eef2ff"><td><strong>Solde net du jour</strong></td><td><strong>${formatUSD(netCaisseUSD)}</strong></td><td><strong>${formatIntSpaced(Math.round(netCaisseCDF))} CDF</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="tiny" style="margin-top:8px;color:var(--muted)">Total entrées = paiements + transferts entrants. Total sorties = dépenses + transferts sortants. Solde = entrées − sorties.</div>
      <div class="table-wrap" style="margin-top:6px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Caisse</th>
              <th>Total entrées</th>
              <th>Total sorties</th>
              <th>Détail transferts</th>
              <th>Solde USD</th>
              <th>Solde CDF</th>
            </tr>
          </thead>
          <tbody>
            ${aggregates.map((row) => {
              const entryUSD = Number(row.totalEntryUSD ?? (Number(row.entreesUSD || 0) + Number(row.transfertInUSD || 0)));
              const entryCDF = Number(row.totalEntryCDF ?? (Number(row.entreesCDF || 0) + Number(row.transfertInCDF || 0)));
              const exitUSD = Number(row.totalExitUSD ?? (Number(row.depensesUSD || 0) + Number(row.transfertOutUSD || 0)));
              const exitCDF = Number(row.totalExitCDF ?? (Number(row.depensesCDF || 0) + Number(row.transfertOutCDF || 0)));
              const transferDetail = [
                Number(row.transfertInUSD || 0) || Number(row.transfertInCDF || 0)
                  ? `Entrants: ${moneyPair(row.transfertInUSD, row.transfertInCDF)}`
                  : "",
                Number(row.transfertOutUSD || 0) || Number(row.transfertOutCDF || 0)
                  ? `Sortants: ${moneyPair(row.transfertOutUSD, row.transfertOutCDF)}`
                  : ""
              ].filter(Boolean).join("<br>") || "—";
              return `
              <tr>
                <td><strong>${esc(row.boxLabel || "Caisse")}</strong>${Number(row.count||0) ? ` <span class="tiny">(${Number(row.count)} reçu(s))</span>` : ""}</td>
                <td>${moneyPair(entryUSD, entryCDF)}</td>
                <td>${moneyPair(exitUSD, exitCDF)}</td>
                <td>${transferDetail}</td>
                <td><strong>${formatUSD(Number(row.totalUSD || 0))}</strong></td>
                <td><strong>${formatIntSpaced(Math.round(Number(row.totalCDF || 0)))} CDF</strong></td>
              </tr>`;
            }).join("") || `<tr><td colspan="6" class="tiny">Aucun mouvement pour cette date.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  if(t === "bus"){
    const bus = await loadBusReportApi(reportMonthKey);
    const data = bus || {
      monthKey: reportMonthKey,
      feeTypeLabel: "Bus",
      expected: 0,
      collected: 0,
      remaining: 0,
      paidCount: 0,
      unpaidCount: 0,
      partialCount: 0,
      rows: [],
      owingList: []
    };
    const rows = Array.isArray(data.rows)
      ? data.rows
      : (Array.isArray(data.owingList) ? data.owingList : []);
    const subscribedTotal = rows.length;
    const paidCount = Number(data.paidCount || rows.filter((r) => Number(r?.due || 0) > 0 && Number(r?.remaining || 0) <= 0).length || 0);
    const partialCount = Number(data.partialCount || rows.filter((r) => Number(r?.due || 0) > 0 && Number(r?.paid || 0) > 0 && Number(r?.remaining || 0) > 0).length || 0);
    const unpaidCount = Number(data.unpaidCount || rows.filter((r) => Number(r?.due || 0) > 0 && Number(r?.paid || 0) <= 0 && Number(r?.remaining || 0) > 0).length || 0);
    const expectedUSD = Number(data.expectedUSD ?? data.expected ?? 0);
    const expectedCDF = Number(data.expectedCDF || 0);
    const collectedUSD = Number(data.collectedUSD ?? data.collected ?? 0);
    const collectedCDF = Number(data.collectedCDF || 0);
    const remainingUSD = Number(data.remainingUSD ?? data.remaining ?? 0);
    const remainingCDF = Number(data.remainingCDF || 0);
    const busUsd = (value) => formatUSD(Number(value || 0));
    const busCdf = (value) => `${formatIntSpaced(Math.round(Number(value || 0)))} CDF`;
    const statusLabel = (r) => {
      const raw = String(r?.status || "").trim();
      if(raw) return raw;
      const due = Number(r?.due || 0);
      const paid = Number(r?.paid || 0);
      const remaining = Number(r?.remaining || 0);
      if(due <= 0) return "A jour";
      if(remaining <= 0) return "Payé";
      if(paid > 0) return "Partiel";
      return "Non payé";
    };
    const statusClass = (label) => {
      const x = String(label || "").toLowerCase();
      if(x === "payé" || x === "paye" || x === "a jour" || x === "à jour") return "ok";
      if(x === "partiel") return "partial";
      if(x === "non payé" || x === "non paye") return "late";
      return "partial";
    };
    const headerHtml = buildReportDocHeaderHtml({
      title: "Bus — paiements du mois",
      subtitle: "Suivi des paiements bus (payés / impayés) du mois",
      stats: [
        { label: "Année scolaire", value: schoolYearLabelFromMonthKey(data.monthKey || reportMonthKey) },
        { label: "Mois", value: monthLabelFromMonthKeyWithYear(data.monthKey || reportMonthKey) },
        { label: "Abonnés", value: String(subscribedTotal) },
        { label: "Impayés bus", value: String(unpaidCount + partialCount) }
      ],
      meta: [
        { label: "Bus attendu USD", value: busUsd(expectedUSD) },
        { label: "Bus attendu CDF", value: busCdf(expectedCDF) },
        { label: "Bus reçu USD", value: busUsd(collectedUSD) },
        { label: "Bus reçu CDF", value: busCdf(collectedCDF) },
        { label: "Bus restant USD", value: busUsd(remainingUSD) },
        { label: "Bus restant CDF", value: busCdf(remainingCDF) },
        { label: "Payés", value: String(paidCount) },
        { label: "Partiels", value: String(partialCount) },
        { label: "Non payés", value: String(unpaidCount) }
      ],
      fraisLabel: data.feeTypeLabel || "Bus"
    });
    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Indicateur</th>
              <th>USD</th>
              <th>CDF</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Mois</td><td colspan="2"><strong>${esc(monthLabelFromMonthKeyWithYear(data.monthKey || reportMonthKey))}</strong></td></tr>
            <tr><td>Bus attendu</td><td><strong>${busUsd(expectedUSD)}</strong></td><td><strong>${busCdf(expectedCDF)}</strong></td></tr>
            <tr><td>Bus reçu</td><td><strong>${busUsd(collectedUSD)}</strong></td><td><strong>${busCdf(collectedCDF)}</strong></td></tr>
            <tr><td>Bus restant</td><td><strong>${busUsd(remainingUSD)}</strong></td><td><strong>${busCdf(remainingCDF)}</strong></td></tr>
            <tr><td>Payés</td><td colspan="2"><strong>${paidCount}</strong></td></tr>
            <tr><td>Partiels</td><td colspan="2"><strong>${partialCount}</strong></td></tr>
            <tr><td>Non payés</td><td colspan="2"><strong>${unpaidCount}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Élève</th>
              <th>Dû USD</th>
              <th>Dû CDF</th>
              <th>Payé USD</th>
              <th>Payé CDF</th>
              <th>Reste USD</th>
              <th>Reste CDF</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              const label = statusLabel(r);
              const rowCurrency = normalizeCurrencyCode(r.currency || "USD");
              const dueUSD = Number(r.dueUSD ?? (rowCurrency === "USD" ? r.due : 0) ?? 0);
              const dueCDF = Number(r.dueCDF ?? (rowCurrency === "CDF" ? r.due : 0) ?? 0);
              const paidUSD = Number(r.paidUSD ?? (rowCurrency === "USD" ? r.paid : 0) ?? 0);
              const paidCDF = Number(r.paidCDF ?? (rowCurrency === "CDF" ? r.paid : 0) ?? 0);
              const rowRemainingUSD = Number(r.remainingUSD ?? (rowCurrency === "USD" ? r.remaining : 0) ?? 0);
              const rowRemainingCDF = Number(r.remainingCDF ?? (rowCurrency === "CDF" ? r.remaining : 0) ?? 0);
              return `
                <tr>
                  <td><strong>${esc(r.fullName || r.name || "—")}</strong></td>
                  <td>${busUsd(dueUSD)}</td>
                  <td>${busCdf(dueCDF)}</td>
                  <td>${busUsd(paidUSD)}</td>
                  <td>${busCdf(paidCDF)}</td>
                  <td><strong>${busUsd(rowRemainingUSD)}</strong></td>
                  <td><strong>${busCdf(rowRemainingCDF)}</strong></td>
                  <td><span class="badge ${statusClass(label)}">${esc(label)}</span></td>
                </tr>
              `;
            }).join("") || `<tr><td colspan="8" class="tiny">Aucun abonné bus pour ce mois.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  if(t === "collectionDG"){
    await loadSpendingsFromApi();
    const history = groupDGCollectionHistory(getSchoolYearScopedSpendings());
    const { totals } = history;
    const headerHtml = buildReportDocHeaderHtml({
      title: "Collection DG — historique mensuel",
      subtitle: "Sommes remises au DG — dernières collections en premier, par mois de mouvement",
      stats: [
        { label: "Année scolaire", value: currentSchoolYearLabel() },
        { label: "Nb collections", value: String(history.count) },
        { label: "Total USD", value: formatUSD(totals.usd) },
        { label: "Total CDF", value: `${formatIntSpaced(Math.round(totals.cdf))} CDF` }
      ],
      meta: [{ label: "Période", value: "Année scolaire complète" }],
      fraisLabel: "Collection DG"
    });
    repSingleBody.innerHTML = `${headerHtml}
      ${history.months.map(group => {
        const label = group.monthKey ? monthLabelFromMonthKeyWithYear(group.monthKey) : "Date non renseignée";
        return `<section class="report-dg-month" style="margin-top:18px">
          <h3 style="break-after:avoid">${esc(label)} · ${group.rows.length} collection(s)</h3>
          <div class="table-wrap"><table style="width:100%">
            <thead><tr><th>Date mouvement</th><th>Saisi le</th><th>Mois imputé</th><th>Caissier</th><th>Caisse</th><th>Note</th><th>Montant (USD)</th><th>Montant (CDF)</th></tr></thead>
            <tbody>${group.rows.map(s => {
              const part = spendingAmountSplit(s);
              const dateIso = spendingEffectiveDateISO(s);
              const box = findCaisseBoxDefinitionByKey(caisseBoxKeyFromSpending(s, { includeImplicitMinerval: true }));
              return `<tr>
                <td>${dateIso ? fmtDateShort(new Date(dateIso)) : "—"}</td>
                <td>${esc(s.createdAt ? fmtDateTime(new Date(s.createdAt)) : "—")}</td>
                <td>${esc(monthLabelFromMonthKeyWithYear(spendingTargetMonthKey(s) || "") || "—")}</td>
                <td>${esc(s.createdByUsername || s.cashier || "—")}</td>
                <td>${esc(box?.label || "Caisse")}</td>
                <td>${esc(s.description || s.note || "—")}</td>
                <td><strong>${Math.abs(Number(part.usd || 0)) > 0.0049 ? formatUSD(Number(part.usd)) : "—"}</strong></td>
                <td><strong>${Math.abs(Number(part.cdf || 0)) > 0.0049 ? `${formatIntSpaced(Math.round(Number(part.cdf)))} CDF` : "—"}</strong></td>
              </tr>`;
            }).join("")}
            <tr style="background:#eef2ff"><td colspan="6"><strong>Total ${esc(label)}</strong></td><td><strong>${formatUSD(group.usd)}</strong></td><td><strong>${formatIntSpaced(Math.round(group.cdf))} CDF</strong></td></tr>
            </tbody></table></div>
        </section>`;
      }).join("") || `<div class="tiny">Aucune collection DG pour cette année scolaire.</div>`}`;
    return;
  }

  if(t === "spending"){
    const spendingMonthLabel = MONTH_LABELS_FR[new Date(selectedDateIso).getMonth()] || d.month;
    const spendings = getSchoolYearScopedSpendings()
      .filter((s) => spendingEffectiveDateISO(s) === selectedDateIso)
      .filter((s) => !isStatePaidSpending(s))
      .sort((a,b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
    const totals = spendings.reduce((sum, s) => {
      const part = spendingAmountSplit(s);
      sum.usd += Number(part.usd || 0);
      sum.cdf += Number(part.cdf || 0);
      return sum;
    }, { usd: 0, cdf: 0 });
    const headerHtml = buildReportDocHeaderHtml({
      title: `Dépenses du jour (${fmtDateShort(new Date(selectedDateIso))})`,
      subtitle: "Suivi journalier des sorties (dépenses)",
      stats: [
        { label: "Année scolaire", value: currentSchoolYearLabel() },
        { label: "Date", value: fmtDateShort(new Date(selectedDateIso)) },
        { label: "Nb dépenses", value: String(spendings.length) }
      ],
      meta: [
        { label: "Total dépenses USD", value: formatUSD(totals.usd) },
        { label: "Total dépenses CDF", value: `${formatIntSpaced(Math.round(totals.cdf))} CDF` },
        { label: "Taux utilisé", value: monthRateLabel(spendingMonthLabel) }
      ],
      fraisLabel: "Dépenses"
    });

    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap">
        <table style="width:100%">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mois imputé</th>
              <th>Description</th>
              <th>Caisse</th>
              <th>Devise</th>
              <th>Montant (USD)</th>
              <th>Montant (CDF)</th>
            </tr>
          </thead>
          <tbody>
            ${spendings.map((s) => {
              const currency = normalizeCurrencyCode(s.currency || "USD");
              const amount = Number(s.amount || 0);
              const amountUSD = currency === "USD" ? formatUSD(amount) : "-";
              const amountCDF = currency === "CDF" ? `${formatIntSpaced(Math.round(amount))} CDF` : "-";
              const dateIso = spendingEffectiveDateISO(s);
              const appliedMonth = monthLabelFromMonthKeyWithYear(spendingTargetMonthKey(s) || "") || "—";
              const boxKey = caisseBoxKeyFromSpending(s, { includeImplicitMinerval: true });
              const box = findCaisseBoxDefinitionByKey(boxKey);
              const boxLabel = String(box?.label || s?.category || "Caisse");
              return `<tr>
              <td>${dateIso ? fmtDateShort(new Date(dateIso)) : "—"}</td>
              <td>${esc(appliedMonth)}</td>
              <td>${esc(s.description || "—")}</td>
              <td>${esc(boxLabel)}</td>
              <td>${esc(currency)}</td>
              <td>${amountUSD}</td>
              <td>${amountCDF}</td>
            </tr>`;
            }).join("") || `<tr><td colspan="7" class="tiny">Aucune dépense pour cette date.</td></tr>`}
            ${spendings.length ? `<tr style="background:#eef2ff"><td colspan="5"><strong>Total dépenses</strong></td><td><strong>${formatUSD(totals.usd)}</strong></td><td><strong>${formatIntSpaced(Math.round(totals.cdf))} CDF</strong></td></tr>` : ""}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  if(t === "casSocial"){
    const casRows = students
      .filter((s) => s && s.isActive !== false && isCasSocialStudent(s))
      .map((s) => {
        const rawMonthlyDueUSD = Number(s.monthlyDueUSD ?? s.monthlyDue ?? 0);
        const monthlyDueUSD = Number(expectedForStudent(s, "level-fee") || 0);
        const note = String(s.studentNote || "").trim();
        const dueFlag = Number.isFinite(rawMonthlyDueUSD) && rawMonthlyDueUSD <= 0;
        const noteFlag = /cas\s*social/i.test(note);
        const className = String(s.className || "—");
        const level = fmtReportLevelLabel(s.level || "");
        const reasons = [];
        if(dueFlag) reasons.push("Mensuel 0");
        if(noteFlag) reasons.push("Note CAS SOCIAL");
        return {
          studentId: s.id,
          matricule: s.matricule || s.id || "—",
          name: s.name || "—",
          className,
          level,
          monthlyDueUSD,
          rawMonthlyDueUSD,
          note,
          reason: reasons.join(" + ") || "—"
        };
      })
      .sort((a,b) => {
        const rankA = classOrderRankForLateReport(a.level, splitReportClassBaseCode(a.className).baseClass);
        const rankB = classOrderRankForLateReport(b.level, splitReportClassBaseCode(b.className).baseClass);
        if(rankA.levelRank !== rankB.levelRank) return rankA.levelRank - rankB.levelRank;
        if(rankA.classRank !== rankB.classRank) return rankA.classRank - rankB.classRank;
        const classCmp = String(a.className || "").localeCompare(String(b.className || ""), "fr");
        if(classCmp !== 0) return classCmp;
        return String(a.name || "").localeCompare(String(b.name || ""), "fr");
      });

    const classCount = new Set(casRows.map((r) => String(r.className || "—"))).size;
    const levelCount = new Set(casRows.map((r) => String(r.level || "—"))).size;
    const zeroDueCount = casRows.filter((r) => Number(r.rawMonthlyDueUSD || 0) <= 0).length;
    const noteCount = casRows.filter((r) => /cas\s*social/i.test(String(r.note || ""))).length;
    const totalDueUSD = casRows.reduce((sum, r) => sum + Number(r.monthlyDueUSD || 0), 0);

    const headerHtml = buildReportDocHeaderHtml({
      title: "Élèves CAS SOCIAL",
      subtitle: "Liste des élèves CAS SOCIAL (mensuel = 0 ou note CAS SOCIAL)",
      stats: [
        { label: "Année scolaire", value: schoolYearLabelFromMonthKey(reportMonthKey) },
        { label: "Mois de référence", value: monthLabelFromMonthKeyWithYear(reportMonthKey || selectedReportMonthKey()) },
        { label: "Nb total CAS SOCIAL", value: String(casRows.length) },
        { label: "Classes concernées", value: String(classCount) }
      ],
      meta: [
        { label: "Niveaux concernés", value: String(levelCount) },
        { label: "Mensuel total (USD)", value: formatUSD(totalDueUSD) },
        { label: "Critères", value: `Mensuel 0: ${zeroDueCount} | Note CAS SOCIAL: ${noteCount}` }
      ],
      fraisLabel: d.tuitionLabel || getTuitionFeeDisplayLabel()
    });

    repSingleBody.innerHTML = `
      ${headerHtml}
      <div class="table-wrap">
        <table style="width:100%">
          <thead>
            <tr>
              <th>N°</th>
              <th>Matricule</th>
              <th>Élève</th>
              <th>Classe</th>
              <th>Niveau</th>
              <th>Mensuel (USD)</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${casRows.map((r, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${esc(r.matricule || "—")}</td>
                <td><strong>${esc(r.name || "—")}</strong></td>
                <td>${esc(reportClassDisplayFromClassName(r.className || "—", r.level || "", { includeCode: true }))}</td>
                <td>${esc(r.level || "—")}</td>
                <td>${formatUSD(Number(r.monthlyDueUSD || 0))}</td>
                <td>${esc(r.note || "—")}</td>
              </tr>
            `).join("") || `<tr><td colspan="7" class="tiny">Aucun élève CAS SOCIAL trouvé.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  const LATE_REMAIN_EPSILON = 0.0049;
  const isLateRemainingPositive = (value) => {
    const n = Number(value || 0);
    if(!Number.isFinite(n)) return false;
    return n > LATE_REMAIN_EPSILON;
  };

  let lateRows = d.rows
    .filter((r) => isLateRemainingPositive(r.remainingUSD))
    .sort((a,b) => {
      const c = String(a.className || "").localeCompare(String(b.className || ""), "fr");
      if(c !== 0) return c;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
  if(t === "late" && reportMonthKey){
    const lateApi = await loadLateStudentsReportApi(reportMonthKey, { force: true });
    if(Array.isArray(lateApi?.rows)){
      lateRows = lateApi.rows
        .map((r) => ({
          studentId: r.id,
          name: r.fullName || "—",
          matricule: r.matricule || r.id || "—",
          className: r.className || "—",
          level: fmtReportLevelLabel(r.level || ""),
          dueUSD: Number(r.due || 0),
          paidUSD: Number(r.paid || 0),
          remainingUSD: Number(r.remaining || 0),
          status: String(r.status || ""),
          lastPaidAt: String(r.lastPaidAt || "")
        }))
        .filter((r) => isLateRemainingPositive(r.remainingUSD))
        .sort((a,b) => {
          const c = String(a.className || "").localeCompare(String(b.className || ""), "fr");
          if(c !== 0) return c;
          return String(a.name || "").localeCompare(String(b.name || ""), "fr");
        });
    }
  }

  const classGroups = {};
  for(const r of lateRows){
    const className = String(r.className || "—").trim();
    const { baseClass, code } = splitReportClassBaseCode(className);
    const levelLabel = fmtReportLevelLabel(r.level || "");
    const classKey = `${levelLabel}||${baseClass}`;
    if(!classGroups[classKey]){
      classGroups[classKey] = {
        levelLabel,
        baseClass,
        rows: [],
        totalRemain: 0,
        sections: {}
      };
    }
    const classGroup = classGroups[classKey];
    const sectionCode = code || "—";
    if(!classGroup.sections[sectionCode]){
      classGroup.sections[sectionCode] = { code: sectionCode, rows: [], totalRemain: 0 };
    }
    classGroup.rows.push(r);
    classGroup.totalRemain += Number(r.remainingUSD || 0);
    classGroup.sections[sectionCode].rows.push(r);
    classGroup.sections[sectionCode].totalRemain += Number(r.remainingUSD || 0);
  }

  const classKeys = Object.keys(classGroups).sort((a,b) => {
    const ga = classGroups[a];
    const gb = classGroups[b];
    const ra = classOrderRankForLateReport(ga?.levelLabel, ga?.baseClass);
    const rb = classOrderRankForLateReport(gb?.levelLabel, gb?.baseClass);
    if(ra.levelRank !== rb.levelRank) return ra.levelRank - rb.levelRank;
    if(ra.classRank !== rb.classRank) return ra.classRank - rb.classRank;
    return String(ga?.baseClass || "").localeCompare(String(gb?.baseClass || ""), "fr");
  });
  const sortSectionCodes = (codes) => codes.slice().sort((a, b) => {
    const aa = String(a || "—");
    const bb = String(b || "—");
    if(aa === bb) return 0;
    if(aa === "—") return 1;
    if(bb === "—") return -1;
    return aa.localeCompare(bb, "fr");
  });

  const globalRemain = lateRows.reduce((s,r) => s + Number(r.remainingUSD || 0), 0);

  const headerHtml = buildReportDocHeaderHtml({
    title: "Minerval — élèves en retard",
    subtitle: "Minerval en retard regroupé par classe et option",
    stats: [
      { label: "Année scolaire", value: schoolYearLabelFromMonthKey(reportMonthKey) },
      { label: "Mois", value: monthLabelFromMonthKeyWithYear(reportMonthKey || selectedReportMonthKey()) },
      { label: "Nb total", value: String(lateRows.length) },
      { label: "Classes", value: String(classKeys.length) }
    ],
    meta: [
      { label: "Type de frais", value: d.tuitionLabel || getTuitionFeeDisplayLabel() },
      { label: "Taux utilisé", value: monthRateLabel(d.month) },
      { label: "Reste total", value: formatUSD(globalRemain) }
    ],
    fraisLabel: d.tuitionLabel || getTuitionFeeDisplayLabel()
  });
  const groupSummaryHtml = classKeys.length ? `
    <div class="table-wrap" style="margin-top:10px">
      <table style="width:100%">
        <thead>
          <tr>
            <th>Niveau</th>
            <th>Classe</th>
            <th>Code</th>
            <th>Nb élèves</th>
            <th>Reste total (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${classKeys.map((k) => {
            const g = classGroups[k];
            const sectionCodes = sortSectionCodes(Object.keys(g.sections || {}));
            const classDisplayName = reportClassDisplayName(g.baseClass, g.levelLabel);
            return `
              <tr>
                <td><strong>${esc(g.levelLabel || "—")}</strong></td>
                <td>${esc(classDisplayName)}</td>
                <td>${esc(sectionCodes.join(", ") || "—")}</td>
                <td>${g.rows.length}</td>
                <td><strong>${formatUSD(g.totalRemain)}</strong></td>
              </tr>
            `;
          }).join("")}
          <tr style="background:#eef2ff">
            <td colspan="4"><strong>Total général</strong></td>
            <td><strong>${formatUSD(globalRemain)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  ` : "";

  const lateClassSectionsHtml = classKeys.map((k, idx) => {
    const g = classGroups[k];
    const sectionCodes = sortSectionCodes(Object.keys(g.sections || {}));
    const options = [...new Set(sectionCodes.map((code) => optionLabelForLateReport({ baseClass: g.baseClass, levelLabel: g.levelLabel, code })))];
    const classDisplayName = reportClassDisplayName(g.baseClass, g.levelLabel);
    const classHeaderHtml = buildReportDocHeaderHtml({
      title: "Minerval — élèves en retard",
      subtitle: `Classe ${classDisplayName} • Option ${options.join(", ") || "—"}`,
      stats: [
        { label: "Année scolaire", value: schoolYearLabelFromMonthKey(reportMonthKey) },
        { label: "Mois", value: monthLabelFromMonthKeyWithYear(reportMonthKey || selectedReportMonthKey()) },
        { label: "Niveau", value: g.levelLabel || "—" },
        { label: "Nb total", value: String(g.rows.length) }
      ],
      meta: [
        { label: "Classe", value: classDisplayName },
        { label: "Option", value: options.join(", ") || "—" },
        { label: "Reste classe", value: formatUSD(g.totalRemain) }
      ],
      fraisLabel: d.tuitionLabel || getTuitionFeeDisplayLabel()
    });
    const combinedRows = [];
    for(const codeKey of sectionCodes){
      const sec = g.sections[codeKey];
      const optDisplay = optionDisplayForLateReport({ baseClass: g.baseClass, levelLabel: g.levelLabel, code: codeKey });
      const sortedRows = sec.rows
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
      combinedRows.push(`
        <tr style="background:#f8fafc">
          <td colspan="5"><strong>Code ${esc(codeKey || "—")} • Option ${esc(optDisplay || "---")} • Reste code: ${formatUSD(sec.totalRemain)}</strong></td>
        </tr>
      `);
      combinedRows.push(...sortedRows.map((r, idx) => `
        <tr>
          <td style="text-align:center">${idx + 1}</td>
          <td style="text-align:center">${esc(codeKey || "—")}</td>
          <td><strong>${esc(r.name || "—")}</strong></td>
          <td>${esc(r.matricule || r.studentId || "—")}</td>
          <td><strong>${formatUSD(Number(r.remainingUSD || 0))}</strong></td>
        </tr>
      `));
    }
    const codeSectionsHtml = `
      <section class="report-late-group-section report-late-code-section">
        <div class="report-late-code-title">Classe ${esc(classDisplayName)} • Code ${esc(sectionCodes.join(", ") || "—")} • Option ${esc(options.join(", ") || "---")}</div>
        <div class="table-wrap">
          <table style="width:100%">
            <thead>
              <tr>
                <th>N°</th>
                <th>Code</th>
                <th>Élève</th>
                <th>Matricule</th>
                <th>Reste</th>
              </tr>
            </thead>
            <tbody>
              ${combinedRows.join("") || `<tr><td colspan="5" class="tiny">Aucun élève en retard dans cette classe.</td></tr>`}
              <tr style="background:#eef2ff">
                <td colspan="4"><strong>Total classe ${esc(classDisplayName)}</strong></td>
                <td><strong>${formatUSD(g.totalRemain)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
    return `
      <section ${reportPrintClassAttributes(g.levelLabel, classDisplayName)} class="report-late-class-section ${idx > 0 ? "report-late-class-section--new-page" : ""}">
        ${classHeaderHtml}
        ${codeSectionsHtml}
      </section>
    `;
  }).join("");

  repSingleBody.innerHTML = lateClassSectionsHtml
    ? `<div class="report-late-groups-wrap" style="margin-top:0">${lateClassSectionsHtml}</div>`
    : `
      ${headerHtml}
      ${groupSummaryHtml}
      <div class="report-late-groups-wrap" style="margin-top:12px">
        <div class="table-wrap"><table style="width:100%"><tbody><tr><td class="tiny">Aucun retard pour cette période.</td></tr></tbody></table></div>
      </div>
    `;
  } finally {
    syncReportPrintClassOptions();
    reportsRenderInFlight = false;
    if(reportsRenderQueued){
      reportsRenderQueued = false;
      setTimeout(() => {
        renderReports().catch(() => {});
      }, 0);
    }
  }
}

if(repType){
  repType.addEventListener("change", renderReports);
}
if(repMonthSel){
  repMonthSel.addEventListener("change", () => {
    syncReportDateToMonth();
    renderReports();
    if(viewSpending.classList.contains("active")) renderSpendingTable();
  });
}
if(repDateConfirm){
  repDateConfirm.addEventListener("click", () => {
    confirmReportDateSelection({ render: true });
  });
}
if(repDateSel){
  repDateSel.addEventListener("change", () => {
    const parsed = normalizeLooseDateToISO(repDateSel.value || "");
    if(!parsed) return;
    const d = new Date(parsed);
    if(Number.isFinite(d.getTime())){
      repDateSel.value = fmtDateFrLong(d);
    }
    if(repHint){
      const confirmed = normalizeLooseDateToISO(reportConfirmedDateIso || "");
      if(confirmed !== parsed){
        repHint.textContent = `Date saisie: ${fmtDateShort(d)}. Cliquez sur Confirmer date pour appliquer.`;
      }
    }
  });
  repDateSel.addEventListener("keydown", (e) => {
    if(e.key !== "Enter") return;
    e.preventDefault();
    confirmReportDateSelection({ render: true });
  });
}
if(repSingleBody){
  repSingleBody.addEventListener("change", (e) => {
    const scopeSel = e.target.closest("#feeDistributionScopeSel");
    if(!scopeSel) return;
    feeDistributionScope = String(scopeSel.value || "year") === "month" ? "month" : "year";
    renderReports().catch(() => {});
  });
  repSingleBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-fee-report-print]");
    if(!btn) return;
    const feeTypeId = String(btn.getAttribute("data-fee-report-print") || "").trim();
    if(!feeTypeId) return;
    printFeeReportCard(feeTypeId);
  });
}
repPrintOne.addEventListener("click", async () => {
  const selectedClass = document.getElementById("repPrintClass")?.value || "";
  while(reportsRenderInFlight){
    await sleepMs(30);
  }
  await renderReports();
  while(reportsRenderInFlight){
    await sleepMs(30);
  }
  // Ensure print always uses the latest selected report/date instead of stale content.
  await renderReports();
  const printHtml = buildClassScopedReportHtml(repSingleBody, selectedClass);
  if(printHtml === null){
    showInAppPopup("Cette classe ne figure plus dans ce rapport. Choisissez une classe à imprimer.");
    return;
  }
  if(isElectronRuntime()){
    const label = repType?.selectedOptions?.[0]?.textContent?.trim() || "Rapport";
    const subtitle = String(repHint?.textContent || "").trim();
    const previewHtml = `
      <section class="card" style="margin:0">
        <div class="body">
          <h3 style="margin:0 0 6px 0">${esc(label)}</h3>
          ${subtitle ? `<div class="tiny" style="margin-bottom:8px">${esc(subtitle)}</div>` : ""}
          ${printHtml}
        </div>
      </section>
    `;
    const opened = openElectronPrintPreviewWindow({
      title: `Aperçu avant impression - ${label}`,
      subtitle,
      bodyHtml: previewHtml,
      printBodyClass: "print-single-report"
    });
    if(opened){
      return;
    }
  }
  if(selectedClass){
    printClassScopedReport(printHtml);
    return;
  }
  document.body.classList.add("print-single-report");
  window.print();
});

function resetPrintUiStateAfterPrint(){
  restoreClassPrintContent();
  document.body.classList.remove("print-single-report");
  document.body.classList.remove("print-fee-report");
  document.body.classList.remove("print-students-list");
  document.body.classList.remove("print-caisse-history");
  if(repSingleBody){
    for(const card of repSingleBody.querySelectorAll("[data-fee-report-card-id]")){
      card.removeAttribute("data-print-target");
    }
  }
  if(studentsPrintRestore?.active){
    studentsVisibleCount = Number(studentsPrintRestore.visibleCount || STUDENTS_LIST_STEP);
    studentsClassCollapsed = { ...(studentsPrintRestore.classCollapsed || {}) };
    if(studentsListCard) studentsListCard.open = Boolean(studentsPrintRestore.detailsOpen);
    studentsPrintRestore = null;
    renderStudentsTableGrouped();
  }
}

window.addEventListener("afterprint", resetPrintUiStateAfterPrint);

/***************
 * Dashboard events
 ***************/
dashMonth.addEventListener("change", () => {
  renderDashboard();
  if(viewSpending.classList.contains("active")) renderSpendingTable();
  refreshPeriodLabels();
});
if(dashRevenueToggle){
  dashRevenueToggle.addEventListener("click", () => {
    setDashRevenueCollapsed(!dashRevenueCollapsed);
  });
}
