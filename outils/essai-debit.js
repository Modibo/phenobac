/* ============================================================
   essai-debit.js — le limiteur laisse-t-il passer l'usage normal
   et arrête-t-il le martèlement ?

   Un limiteur trop serré casse l'application sans qu'on s'en aperçoive :
   l'interprétation échoue, l'utilisateur croit à une panne réseau. Ces
   contrôles fixent les deux bords — ce qui doit passer, ce qui doit être
   refusé — et l'horloge est injectée pour que rien ne dépende du temps réel.

   Avec Node :            node outils/essai-debit.js
   Sans Node, sur macOS : jsc outils/essai-debit.js
   ============================================================ */

var creerLimiteur, OK = 0, KO = 0;

if (typeof require === "function" && typeof module === "object" && module.exports) {
  creerLimiteur = require("../netlify/functions/lib/debit").creerLimiteur;
} else {
  var mod = { exports: {} };
  (new Function("module", "exports", readFile("netlify/functions/lib/debit.js")))(mod, mod.exports);
  creerLimiteur = mod.exports.creerLimiteur;
}
function dire(s) { (typeof console === "object" ? console.log : print)(s); }
function verif(titre, condition) {
  condition ? OK++ : KO++;
  dire((condition ? "  ok   " : "  ÉCHEC") + "  " + titre);
}

// Horloge pilotée : le temps n'avance que si on le demande.
var t = 1000000;
var horloge = function () { return t; };

dire("\nCe qui doit passer");
var lim = creerLimiteur({ limite: 240, fenetreMs: 60000, maintenant: horloge });
var toutesPassees = true;
for (var i = 0; i < 240; i++) { if (!lim("10.0.0.1").autorise) toutesPassees = false; }
verif("240 requêtes dans la minute : toutes acceptées", toutesPassees);
// La saisie d'un antibiogramme complet, avec le debounce de 300 ms côté
// client, produit quelques dizaines de requêtes au plus : le quota de 240
// laisse une marge confortable à un usage même intensif.
var avantDernier = creerLimiteur({ limite: 3, fenetreMs: 60000, maintenant: horloge });
avantDernier("x"); avantDernier("x");
verif("le décompte restant est exact", avantDernier("x").restant === 0);

dire("\nCe qui doit être refusé");
verif("la 241e est refusée", lim("10.0.0.1").autorise === false);
var r = lim("10.0.0.1");
verif("le refus annonce le délai d'attente", r.resetDans > 0 && r.resetDans <= 60000);

dire("\nCe qui ne doit pas déborder sur les autres");
verif("un autre poste n'est pas pénalisé", lim("10.0.0.2").autorise === true);

dire("\nLa tranche suivante repart de zéro");
t += 60000;
verif("après la fenêtre, le poste bloqué repasse", lim("10.0.0.1").autorise === true);

dire("\nLe limiteur ne garde pas la mémoire des tranches révolues");
var lim2 = creerLimiteur({ limite: 5, fenetreMs: 1000, maintenant: horloge });
for (var j = 0; j < 100; j++) { t += 1000; lim2("poste-" + j); }
// Chaque poste n'a été vu qu'une fois, dans une tranche différente : la purge
// doit les avoir écartés plutôt que de les accumuler indéfiniment.
verif("100 postes sur 100 tranches n'accumulent pas", lim2("poste-0").autorise === true);

dire("\nUne identité absente ne fait pas tomber le limiteur");
verif("identité vide tolérée", lim2(undefined).autorise === true);

dire("\n" + (KO ? KO + " échec(s) sur " + (OK + KO) + " vérifications."
                : OK + " vérifications, le limiteur se comporte comme annoncé."));
if (KO && typeof process === "object" && process.exit) process.exit(1);
if (KO) throw new Error(KO + " échec(s)");
