"use strict";
// Valeurs neutres pour une nouvelle installation ; aucune identite d'ecole n'est imposee.
const field = (key, label, value, area, risk = "safe", extra = {}) => ({ key, label, default: value, area, risk, type: "text", ...extra });
const catalog = [
  field("school.name", "Nom officiel", "Etablissement scolaire", "Identité · reçus · rapports", "safe", { required: true }),
  field("school.shortName", "Nom court", "ETABLISSEMENT", "Navigation", "safe", { required: true, max: 60 }),
  field("school.logo", "Logo", "", "Navigation · documents", "safe", { type: "logo" }),
  field("school.address", "Adresse", "", "Documents"),
  field("school.phone", "Téléphone", "", "Documents", "safe", { max: 60 }),
  field("school.email", "E-mail", "", "Documents", "safe", { type: "email" }),
  field("school.city", "Ville", "", "Documents"),
  field("receipts.prefix", "Préfixe des reçus", "REC", "Nouveaux reçus uniquement · numéros existants conservés", "important", { type: "prefix", required: true, max: 12 }),
  field("school.studentIdPrefix", "Préfixe des matricules", "", "Nouveaux matricules automatiques · vide = initiales du nom", "important", { type: "prefix", max: 12 }),
  field("school.language", "Langue par défaut", "fr", "Interface · français disponible dans cette version", "safe", { type: "select", options: ["fr"] }),
  field("school.timezone", "Fuseau horaire d’affichage", process.env.BUSINESS_TIMEZONE || process.env.TZ || "Africa/Lubumbashi", "Journal du centre · le fuseau comptable du serveur reste inchangé", "important", { type: "timezone" }),
  ...[
    ["students", "Gestion des élèves", "Création et modification des élèves"],
    ["payments", "Paiements", "Nouveaux encaissements · historique consultable"],
    ["busPayments", "Paiements bus", "Abonnements et nouveaux encaissements bus"],
    ["spending", "Dépenses", "Nouvelles dépenses et modifications"],
    ["studentFeeOverrides", "Dérogations individuelles", "Tarifs individuels et avantages de scolarité"],
    ["manualHistory", "Historique manuel", "Saisie de paiements antérieurs au jour comptable"],
  ].map(([key, label, area]) => field(`features.${key}`, label, true, area, "important", { type: "boolean" }))
];
function validateValue(def, value) {
  if (def.type === "boolean") {
    if (typeof value !== "boolean") throw new Error("Valeur booléenne requise.");
    return value;
  }
  if (typeof value !== "string") throw new Error("Texte requis.");
  const v = value.trim();
  if (v.length > (def.type === "logo" ? 80000 : def.max || 240)) throw new Error("Valeur trop longue.");
  if (def.required && !v) throw new Error("Valeur obligatoire.");
  if (/[\u0000-\u001f]/.test(v)) throw new Error("Caractères de contrôle interdits.");
  if (def.type === "prefix" && v && !/^[A-Z0-9]+$/.test(v)) throw new Error("Utilisez A–Z et 0–9.");
  if (def.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("E-mail invalide.");
  if (def.type === "select" && !def.options.includes(v)) throw new Error("Option non disponible.");
  if (def.type === "timezone") { try { new Intl.DateTimeFormat("fr", { timeZone: v }); } catch { throw new Error("Fuseau IANA invalide."); } }
  if (def.type === "logo" && v && !(/^\/[a-zA-Z0-9_./-]+$/.test(v) && !v.startsWith("//") && !v.includes("..")) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)) throw new Error("Choisissez une image PNG, JPEG ou WebP locale.");
  return v;
}
module.exports = { catalog, validateValue };
