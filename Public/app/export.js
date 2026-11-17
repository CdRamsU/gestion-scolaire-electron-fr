/* ============================================================
   Gestion Scolaire — Export Excel (.xlsx) des tableaux (module autonome)
   Reçus, Rapports (retards, mois impayés, ...), Clôtures, Audit.
   Génère un vrai fichier .xlsx (ZIP + SpreadsheetML minimal),
   sans dépendance: colonnes et accents corrects dans tout Excel,
   quelle que soit la langue/locale du poste.
   ============================================================ */
(function(){
  "use strict";

  /* ---------- Lecture des tableaux HTML ---------- */

  function cellText(cell){
    // Ignore le contenu des boutons/inputs (colonnes Action, cases à cocher).
    if(cell.querySelector("button, input, select")){
      const clone = cell.cloneNode(true);
      clone.querySelectorAll("button, input, select").forEach((el) => el.remove());
      return clone.textContent || "";
    }
    return cell.textContent || "";
  }

  function cleanText(s){
    return String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  function isHiddenCell(cell){
    return Boolean(cell && cell.style && cell.style.display === "none");
  }

  function tableToRows(table){
    const rows = [];
    const headRow = table.querySelector("thead tr");
    const skipCols = [];
    if(headRow){
      const headCells = [...headRow.children];
      headCells.forEach((th, i) => { skipCols[i] = isHiddenCell(th); });
      const headers = headCells.filter((_, i) => !skipCols[i]).map((th) => cleanText(cellText(th)));
      if(headers.some((h) => h !== "")) rows.push(headers);
    }
    for(const tr of table.querySelectorAll("tbody tr")){
      const cells = [...tr.children];
      // Ligne message ("Aucun ...") sur colspan: ignorer.
      if(cells.length === 1 && cells[0].getAttribute("colspan")) continue;
      const fields = cells
        .filter((cell, i) => !(skipCols[i] || isHiddenCell(cell)))
        .map((td) => cleanText(cellText(td)));
      if(fields.some((f) => f !== "")) rows.push(fields);
    }
    return rows;
  }

  /* ---------- Générateur XLSX minimal (ZIP non compressé) ---------- */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for(let n = 0; n < 256; n += 1){
      let c = n;
      for(let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes){
    let c = 0xFFFFFFFF;
    for(let i = 0; i < bytes.length; i += 1){
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files){
    // files: [{ name, data: Uint8Array }] — méthode STORE (aucune compression).
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;
    for(const file of files){
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      parts.push(local, data);

      const cent = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cent.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cent.set(nameBytes, 46);
      cv.setUint32(42, offset, true);
      central.push(cent);

      offset += local.length + data.length;
    }
    const centralSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const all = [...parts, ...central, end];
    const total = all.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for(const p of all){ out.set(p, pos); pos += p.length; }
    return out;
  }

  function xmlEsc(s){
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function cellXml(value){
    const s = cleanText(value);
    if(s === "") return "<c/>";
    // Nombre pur (espaces de milliers tolérés, virgule décimale FR) => cellule numérique.
    const raw = s.replace(/[ \u00A0\u202F]/g, "");
    if(/^-?\d{1,15}(?:[.,]\d+)?$/.test(raw)){
      return `<c t="n"><v>${raw.replace(",", ".")}</v></c>`;
    }
    return `<c t="inlineStr"><is><t xml:space="preserve">${xmlEsc(s)}</t></is></c>`;
  }

  function sheetXml(rows){
    const body = rows.map((r) => `<row>${r.map(cellXml).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<sheetData>${body}</sheetData></worksheet>`;
  }

  function sanitizeSheetName(name, used){
    let base = cleanText(name).replace(/[\[\]:*?\/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Feuille";
    let candidate = base;
    let i = 2;
    while(used.has(candidate.toLowerCase())){
      const suffix = ` (${i})`;
      candidate = base.slice(0, 31 - suffix.length) + suffix;
      i += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  function buildXlsxBytes(sheets){
    // sheets: [{ name, rows: string[][] }]
    const encoder = new TextEncoder();
    const used = new Set();
    const entries = sheets.map((sh, i) => ({
      name: sanitizeSheetName(sh.name || `Feuille${i + 1}`, used),
      fileName: `sheet${i + 1}.xml`,
      rows: sh.rows
    }));
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      entries.map((e) => `<Override PartName="/xl/worksheets/${e.fileName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      `</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>` +
      entries.map((e, i) => `<sheet name="${xmlEsc(e.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets></workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      entries.map((e, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${e.fileName}"/>`).join("") +
      `</Relationships>`;
    const files = [
      { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
      { name: "_rels/.rels", data: encoder.encode(rootRels) },
      { name: "xl/workbook.xml", data: encoder.encode(workbook) },
      { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
      ...entries.map((e) => ({ name: `xl/worksheets/${e.fileName}`, data: encoder.encode(sheetXml(e.rows)) }))
    ];
    return zipStore(files);
  }

  function downloadXlsx(baseName, sheets){
    const withRows = sheets.filter((sh) => Array.isArray(sh.rows) && sh.rows.length);
    if(!withRows.length){
      alert("Aucune donnée à exporter.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const bytes = buildXlsxBytes(withRows);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}_${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ---------- Branchement sur les vues ---------- */

  function exportTableByTbody(tbodyId, baseName, sheetName){
    const tbody = document.getElementById(tbodyId);
    const table = tbody ? tbody.closest("table") : null;
    if(!table){
      alert("Tableau introuvable.");
      return;
    }
    downloadXlsx(baseName, [{ name: sheetName || baseName, rows: tableToRows(table) }]);
  }

  function makeButton(label, onClick){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function slugify(s){
    return String(s || "export")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .toLowerCase() || "export";
  }

  function init(){
    // Receipt export includes the rows currently displayed in the register.
    const rReprint = document.getElementById("rReprint");
    const receiptExportSlot = document.getElementById("rxExport");
    if(receiptExportSlot){
      receiptExportSlot.appendChild(makeButton("Exporter les lignes affichées", () => exportTableByTbody("receiptsTbody", "recus", "Reçus")));
    }else if(rReprint && rReprint.parentElement){
      rReprint.parentElement.insertBefore(makeButton("Exporter Excel", () => exportTableByTbody("receiptsTbody", "recus", "Reçus")), rReprint);
    }

    // 2) Rapports — exporte tous les tableaux du rapport affiché (1 feuille par tableau).
    const repPrintOne = document.getElementById("repPrintOne");
    if(repPrintOne && repPrintOne.parentElement){
      const exportReport = () => {
        const body = document.getElementById("repSingleBody");
        const tables = body ? [...body.querySelectorAll("table")] : [];
        if(!tables.length){
          alert("Affichez d'abord un rapport.");
          return;
        }
        const sheets = tables.map((table, idx) => {
          const section = table.closest("section");
          const title = section ? section.querySelector(".report-late-code-title, h3, h4") : null;
          return {
            name: title && title.textContent.trim() ? title.textContent : `Tableau ${idx + 1}`,
            rows: tableToRows(table)
          };
        });
        const repType = document.getElementById("repType");
        const label = repType?.selectedOptions?.[0]?.textContent || "rapport";
        downloadXlsx(slugify(label), sheets);
      };
      repPrintOne.parentElement.insertBefore(makeButton("Exporter Excel", exportReport), repPrintOne);
    }

    // 3) Clôtures — dans la carte Historique.
    const clotureTbody = document.getElementById("clotureHistoryTbody");
    if(clotureTbody){
      const wrap = clotureTbody.closest(".table-wrap");
      if(wrap && wrap.parentElement){
        const row = document.createElement("div");
        row.className = "row";
        row.style.cssText = "justify-content:flex-end;margin-bottom:10px";
        row.appendChild(makeButton("Exporter Excel", () => exportTableByTbody("clotureHistoryTbody", "clotures", "Clôtures")));
        wrap.parentElement.insertBefore(row, wrap);
      }
    }

    // 4) Audit — à côté du bouton Actualiser.
    const auditRefresh = document.getElementById("auditRefreshBtn");
    if(auditRefresh && auditRefresh.parentElement){
      auditRefresh.parentElement.insertBefore(
        makeButton("Exporter Excel", () => exportTableByTbody("auditTbody", "audit", "Audit")),
        auditRefresh.nextSibling
      );
    }
  }

  // Hooks de test (Node) et réutilisation par d'autres modules.
  if(typeof window !== "undefined"){
    window.__ecoExport = { buildXlsxBytes, tableToRows, downloadXlsx };
  }

  if(typeof document !== "undefined"){
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", init);
    }else{
      init();
    }
  }
})();
