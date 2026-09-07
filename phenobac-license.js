// phenobac-license.js
// Remplacement du verrou de DÉMONSTRATION de PhénoBac par une vérification serveur.
//
// Dans phenobac.html, remplacez :
//   - loadPlan()  (au démarrage)  ->  par un appel à checkLicense()
//   - activate()  (dans la modale) ->  par la version ci-dessous
//
// La source de vérité devient la fonction Netlify verify-license.
// localStorage ne sert plus que de cache d'interface (jamais de preuve d'achat).

const LICENSE_FN = "/.netlify/functions/verify-license";
const GRACE_DAYS = 7; // tolérance d'utilisation hors-ligne entre deux vérifications

// À appeler au démarrage, à la place de « let PLAN = loadPlan(); ».
// Démarrez en "free", puis basculez si la licence est validée par le serveur.
async function checkLicense() {
  let lic = "";
  try { lic = localStorage.getItem("phenobac_license") || ""; } catch (e) {}

  if (!lic) { setPlan("free"); return; }

  try {
    const r = await fetch(LICENSE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license: lic })
    });
    const data = await r.json();

    if (data.valid) {
      setPlan("premium");
      try { localStorage.setItem("phenobac_lastok", String(Date.now())); } catch (e) {}
    } else {
      setPlan("free");
      // Si "expired", on peut effacer la clé ; sinon on la garde (l'utilisateur réessaiera).
      if (data.reason === "expired") { try { localStorage.removeItem("phenobac_license"); } catch (e) {} }
    }
  } catch (e) {
    // Hors-ligne : on tolère Premium si une vérification a réussi récemment.
    let last = 0;
    try { last = parseInt(localStorage.getItem("phenobac_lastok") || "0", 10); } catch (_) {}
    const fresh = last && (Date.now() - last) < GRACE_DAYS * 86400 * 1000;
    setPlan(fresh ? "premium" : "free");
  }
}

// Version serveur de activate() : la « clé d'activation » saisie EST la licence signée.
async function activate() {
  const key = ($("#licenseInput").value || "").trim();
  if (!key) { $("#modalErr").textContent = "Saisissez votre clé de licence."; return; }

  $("#modalErr").textContent = "Vérification…";
  try {
    const r = await fetch(LICENSE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license: key })
    });
    const data = await r.json();

    if (data.valid) {
      try {
        localStorage.setItem("phenobac_license", key);
        localStorage.setItem("phenobac_lastok", String(Date.now()));
      } catch (e) {}
      closeUpgrade();
      setPlan("premium");
    } else {
      $("#modalErr").textContent =
        data.reason === "expired" ? "Licence expirée." :
        data.reason === "server_not_configured" ? "Service indisponible, réessayez plus tard." :
        "Clé non valide.";
    }
  } catch (e) {
    $("#modalErr").textContent = "Vérification impossible (connexion requise).";
  }
}

// Au démarrage, remplacez la ligne d'init du plan par :
//   checkLicense();   // asynchrone : l'UI démarre en gratuit puis se met à jour
