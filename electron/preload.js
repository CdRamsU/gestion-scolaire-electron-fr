"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("applicationBureau", Object.freeze({
  electron: true,
  plateforme: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  })
}));
