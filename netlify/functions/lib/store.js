// netlify/functions/lib/store.js
// Abstraction de stockage : Netlify Blobs (hébergement Netlify) OU fichier local (VPS).
// Sélection par STORE_BACKEND ("blobs" | "file"), sinon auto : Blobs si on est sur
// Netlify, fichier sinon. Même interface : get / setJSON / delete / list.

const BACKEND = process.env.STORE_BACKEND || (process.env.NETLIFY ? "blobs" : "file");

/* ---------- Backend Netlify Blobs ---------- */
function blobsStore(name) {
  const { getStore } = require("@netlify/blobs");
  const s = getStore(name);
  return {
    get: (k, o) => s.get(k, o),
    setJSON: (k, v) => s.setJSON(k, v),
    delete: (k) => s.delete(k),
    list: () => s.list()
  };
}

/* ---------- Backend fichier local (VPS) ---------- */
const fs = require("fs");
const path = require("path");
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

function fileStore(name) {
  const file = path.join(DATA_DIR, String(name).replace(/[^a-z0-9_-]/gi, "_") + ".json");
  const readAll = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; } };
  const writeAll = (obj) => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, file); // écriture atomique
  };
  return {
    async get(k) { const all = readAll(); return (k in all) ? all[k] : null; },
    async setJSON(k, v) { const all = readAll(); all[k] = v; writeAll(all); },
    async delete(k) { const all = readAll(); delete all[k]; writeAll(all); },
    async list() { const all = readAll(); return { blobs: Object.keys(all).map((key) => ({ key })) }; }
  };
}

function getStore(name) {
  return BACKEND === "blobs" ? blobsStore(name) : fileStore(name);
}

module.exports = { getStore, BACKEND };
