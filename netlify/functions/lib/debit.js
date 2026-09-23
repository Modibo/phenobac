// debit.js — limitation de débit en mémoire vive, sans dépendance.
//
// L'endpoint d'interprétation est public et gratuit : rien n'empêche de le
// marteler. Le risque n'est pas la fuite de données — aucune donnée n'y est
// stockée — mais la charge, sur un VPS qui héberge aussi d'autres services.
//
// Fenêtre fixe plutôt que glissante : un compteur par tranche de temps, remis
// à zéro à chaque tranche. C'est moins précis aux bordures qu'une fenêtre
// glissante, et largement suffisant ici — on cherche à écarter le martèlement,
// pas à facturer à la requête près.
//
// La mémoire est bornée : les entrées d'une tranche révolue sont purgées, et
// le nombre de clés suivies est plafonné. Un limiteur qui ferait tomber le
// serveur qu'il protège n'aurait aucun sens.

const CLES_MAX = 20000;   // au-delà, on purge : mieux vaut laisser passer que saturer

function creerLimiteur({ limite, fenetreMs = 60000, maintenant = Date.now }) {
  const vus = new Map();

  function purger(tranche) {
    for (const [cle, v] of vus) {
      if (v.tranche !== tranche) vus.delete(cle);
    }
  }

  // Renvoie { autorise, restant, resetDans } — jamais d'exception : en cas de
  // doute, on laisse passer.
  return function verifier(identite) {
    const t = maintenant();
    const tranche = Math.floor(t / fenetreMs);
    const cle = String(identite || "?");

    const v = vus.get(cle);
    if (!v || v.tranche !== tranche) {
      if (vus.size >= CLES_MAX) purger(tranche);
      vus.set(cle, { tranche, n: 1 });
      return { autorise: true, restant: limite - 1, resetDans: fenetreMs - (t % fenetreMs) };
    }

    v.n += 1;
    const resetDans = fenetreMs - (t % fenetreMs);
    if (v.n > limite) return { autorise: false, restant: 0, resetDans };
    return { autorise: true, restant: limite - v.n, resetDans };
  };
}

module.exports = { creerLimiteur, CLES_MAX };
