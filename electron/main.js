"use strict";

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { fork } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const ADRESSE = `http://127.0.0.1:${PORT}`;
let fenetrePrincipale = null;
let processusServeur = null;
let serveurDemarreParElectron = false;

function racineExecution() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked")
    : app.getAppPath();
}

function serveurDisponible() {
  return new Promise((resolve) => {
    const requete = http.get(`${ADRESSE}/api/health`, { timeout: 900 }, (reponse) => {
      reponse.resume();
      resolve(reponse.statusCode >= 200 && reponse.statusCode < 500);
    });
    requete.on("timeout", () => requete.destroy());
    requete.on("error", () => resolve(false));
  });
}

async function attendreServeur(delaiMs = 30000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (await serveurDisponible()) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function demarrerServeurSiNecessaire() {
  if (await serveurDisponible()) return;

  const racine = racineExecution();
  const fichierServeur = path.join(racine, "server", "server.js");
  processusServeur = fork(fichierServeur, [], {
    cwd: racine,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      FORCE_HTTPS_REDIRECT: "0",
      SSL_ENABLED: "0"
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  serveurDemarreParElectron = true;

  processusServeur.stdout?.on("data", (message) => process.stdout.write(`[serveur] ${message}`));
  processusServeur.stderr?.on("data", (message) => process.stderr.write(`[serveur] ${message}`));
  processusServeur.once("exit", () => {
    processusServeur = null;
  });
}

function arreterServeur() {
  if (!serveurDemarreParElectron || !processusServeur) return;
  processusServeur.kill();
  processusServeur = null;
}

function installerMenu() {
  const modele = [
    {
      label: "Fichier",
      submenu: [
        { label: "Recharger", role: "reload" },
        { type: "separator" },
        { label: "Quitter", role: process.platform === "darwin" ? "close" : "quit" }
      ]
    },
    {
      label: "Affichage",
      submenu: [
        { label: "Taille réelle", role: "resetZoom" },
        { label: "Agrandir", role: "zoomIn" },
        { label: "Réduire", role: "zoomOut" },
        { type: "separator" },
        { label: "Plein écran", role: "togglefullscreen" }
      ]
    },
    {
      label: "Aide",
      submenu: [
        {
          label: "Ouvrir la documentation locale",
          click: () => shell.openPath(path.join(racineExecution(), "README.md"))
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modele));
}

async function creerFenetre() {
  await demarrerServeurSiNecessaire();
  const pret = await attendreServeur();
  if (!pret) {
    dialog.showErrorBox(
      "Serveur indisponible",
      "Gestion Scolaire n’a pas pu démarrer. Vérifiez PostgreSQL et les variables de connexion, puis relancez l’application."
    );
    app.quit();
    return;
  }

  fenetrePrincipale = new BrowserWindow({
    title: "Gestion Scolaire",
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#f4f7fc",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  fenetrePrincipale.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(ADRESSE)) shell.openExternal(url);
    return { action: "deny" };
  });
  fenetrePrincipale.webContents.on("will-navigate", (evenement, url) => {
    if (!url.startsWith(ADRESSE)) evenement.preventDefault();
  });
  fenetrePrincipale.once("ready-to-show", () => fenetrePrincipale.show());
  fenetrePrincipale.on("closed", () => {
    fenetrePrincipale = null;
  });
  await fenetrePrincipale.loadURL(ADRESSE);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!fenetrePrincipale) return;
    if (fenetrePrincipale.isMinimized()) fenetrePrincipale.restore();
    fenetrePrincipale.focus();
  });

  app.whenReady().then(() => {
    installerMenu();
    return creerFenetre();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
  app.on("before-quit", arreterServeur);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
