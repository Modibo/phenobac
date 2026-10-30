// langue.js — PhénoBac en français et en anglais.
//
// POURQUOI
//
// PhénoBac est née pour l'Hôpital Sominé DOLO de Mopti, et elle est écrite en
// français. Mais le laboratoire de district qui lit ses antibiogrammes au pied
// à coulisse n'est pas une particularité malienne : c'est la règle d'Accra à
// Nairobi. Un outil qui ne parle que français se prive de la moitié du
// continent pour une raison qui n'a rien de scientifique.
//
// L'ANGLAIS N'EST PAS ICI UNE TRADUCTION, C'EST LA SOURCE
//
// L'EUCAST publie en anglais. « Sensible à forte exposition » est le français
// de « Susceptible, increased exposure » ; « zone d'incertitude technique »
// est celui d'« Area of Technical Uncertainty ». Pour tout le vocabulaire du
// référentiel, la colonne « en » ci-dessous RESTITUE le terme officiel au
// lieu de le traduire — et c'est pour cela qu'elle est fiable.
//
// Le CA-SFM, lui, ne publie qu'en français. Là où son vocabulaire diffère de
// celui de l'EUCAST — il dit « sensible à forte posologie » quand l'EUCAST dit
// « forte exposition » —, la colonne anglaise rend le sens du comité français
// et le signale. Prêter à un comité les mots d'un autre serait une petite
// falsification, et elle se verrait dans un compte rendu.
//
// CE QUI EST TRADUIT, ET CE QUI NE L'EST PAS ENCORE
//
// Tout ce qui sert à FAIRE FONCTIONNER l'application : navigation, encadrés,
// commandes, catégories S/I/R, gravité, titres du compte rendu, avertissement.
// Le COMMENTAIRE CLINIQUE du moteur — 79 000 caractères de prose : mécanismes,
// règles expertes, alertes — reste en français, et l'interface le DIT quand on
// choisit l'anglais. Une application médicale à moitié traduite qui ne
// l'annonce pas est pire qu'une application qui n'est pas traduite du tout :
// le lecteur croit avoir tout lu.
//
// outils/verifier-langues.py tient le compte de ce qui reste, et refuse que ce
// nombre augmente.
(function (racine) {
"use strict";

// « meme: true » déclare qu'un terme s'écrit PAREIL dans les deux langues.
// Sans ce drapeau, une entrée identique serait indistinguable d'une entrée
// qu'on a oublié de traduire — et le contrôle passerait au vert sur un oubli.
const C = {
  /* ---------- la langue elle-même ---------- */
  "langue.nom":            { fr: "Français", en: "English" },
  "langue.basculer":       { fr: "English", en: "Français" },
  "langue.titre":          { fr: "Switch to English", en: "Passer en français" },

  /* ---------- l'avertissement d'anglais partiel ---------- */
  "partiel.titre":         { fr: "Interface en anglais, commentaire en français",
                             en: "Interface in English, commentary in French" },
  "partiel.texte":         { fr: "L'interface, les catégories et les titres du compte rendu sont en anglais. Le commentaire interprétatif — mécanisme de résistance, règles expertes, alertes — est encore rédigé en français. Il est traduit par vagues ; rien n'est masqué entre-temps.",
                             en: "The interface, the categories and the report headings are in English. The interpretive commentary — resistance mechanism, expert rules, alerts — is still written in French. It is being translated in waves; nothing is hidden in the meantime." },

  /* ---------- navigation ---------- */
  "nav.identification":    { fr: "Identification", en: "Identification", meme: true },
  "nav.interpretation":    { fr: "Interprétation", en: "Interpretation" },
  "nav.entrainement":      { fr: "Entraînement", en: "Training" },
  "nav.cq":                { fr: "Contrôle qualité", en: "Quality control" },
  "nav.surveillance":      { fr: "Surveillance", en: "Surveillance", meme: true },
  "nav.referentiels":      { fr: "Référentiels", en: "Breakpoint tables" },
  "nav.apropos":           { fr: "À propos", en: "About" },
  "nav.attente":           { fr: "En attente", en: "Pending" },
  "marque.sous":           { fr: "Lecture interprétative", en: "Interpretive reading" },
  "page.titre":            { fr: "PhénoBac — Lecture interprétative de l'antibiogramme",
                             en: "PhénoBac — Interpretive reading of the antibiogram" },

  /* ---------- encadrés ---------- */
  "bloc.contexte":         { fr: "Contexte", en: "Context" },
  "bloc.antibiogramme":    { fr: "Antibiogramme", en: "Antibiogram" },
  "bloc.interpretation":   { fr: "Interprétation", en: "Interpretation" },
  "bloc.seuils":           { fr: "Concentrations critiques", en: "Clinical breakpoints" },
  "bloc.conception":       { fr: "Conception", en: "Design and development" },

  /* ---------- saisie ---------- */
  "champ.espece":          { fr: "Espèce identifiée", en: "Identified species" },
  "champ.prelevement":     { fr: "Prélèvement", en: "Specimen" },
  "champ.identification":  { fr: "Identification — patient / n° échantillon",
                             en: "Identification — patient / sample no." },
  "champ.valideur":        { fr: "Biologiste validateur / laboratoire",
                             en: "Validating microbiologist / laboratory" },
  "champ.optionnel":       { fr: "(optionnel)", en: "(optional)" },
  "champ.demos":           { fr: "Exemples de démonstration", en: "Worked examples" },
  "mode.diametre":         { fr: "Diamètre mm", en: "Zone diameter mm" },
  "mode.sir":              { fr: "S / I / R", en: "S / I / R", meme: true },
  "mode.cmi":              { fr: "CMI mg/L", en: "MIC mg/L" },
  "bouton.reinitialiser":  { fr: "Réinitialiser", en: "Reset" },
  "champ.referentiel":     { fr: "Référentiel", en: "Breakpoint table" },
  "champ.rendu":           { fr: "Rendu ciblé", en: "Selective reporting" },
  "rendu.complet":         { fr: "Complet", en: "Full" },
  "rendu.cible":           { fr: "Ciblé", en: "Selective" },
  "interp.vide":           { fr: "Choisissez une espèce et saisissez au moins un résultat pour obtenir le phénotype, les alertes de cohérence et le commentaire du compte-rendu.",
                             en: "Choose a species and enter at least one result to obtain the phenotype, the consistency alerts and the report commentary." },

  /* ---------- prélèvements ---------- */
  "prel.hemoculture":      { fr: "Hémoculture", en: "Blood culture" },
  "prel.ecbu":             { fr: "ECBU (urines)", en: "Urine culture" },
  "prel.pus":              { fr: "Pus / plaie", en: "Pus / wound" },
  "prel.respiratoire":     { fr: "Prélèvement respiratoire", en: "Respiratory specimen" },
  "prel.lcr":              { fr: "LCR", en: "CSF" },
  "prel.catheter":         { fr: "Cathéter", en: "Catheter" },
  "prel.autre":            { fr: "Autre", en: "Other" },

  /* ---------- LE VOCABULAIRE DU RÉFÉRENTIEL ----------
     L'anglais est ici le terme OFFICIEL de l'EUCAST, pas une traduction. */
  "cat.S":                 { fr: "Sensible", en: "Susceptible, standard dosing regimen" },
  "cat.S.court":           { fr: "Sensible", en: "Susceptible" },
  "cat.R":                 { fr: "Résistant", en: "Resistant" },
  // L'EUCAST dit « increased exposure » ; le CA-SFM dit « forte posologie ».
  // Les deux formulations ne disent pas la même chose — l'exposition dépend de
  // la dose ET du schéma —, et l'application affiche celle du référentiel
  // actif. On ne prête pas à l'un les mots de l'autre.
  "cat.I.eucast":          { fr: "Sensible à forte exposition", en: "Susceptible, increased exposure" },
  "cat.I.casfm":           { fr: "Sensible à forte posologie", en: "Susceptible, increased dosage (CA-SFM wording)" },
  "cat.nonteste":          { fr: "Non testé", en: "Not tested" },
  "cat.noncategorise":     { fr: "Non catégorisé", en: "Not categorised" },
  "zit.nom":               { fr: "Zone d'incertitude technique", en: "Area of Technical Uncertainty" },
  "zit.sigle":             { fr: "ZIT", en: "ATU" },
  "ecoff.nom":             { fr: "Seuil fondé sur l'ECOFF", en: "ECOFF-based breakpoint" },
  "conv.nom":              { fr: "Convention de laboratoire", en: "Local laboratory convention" },
  "depistage.nom":         { fr: "Dépistage", en: "Screening test" },
  "charge.disque":         { fr: "disque", en: "disk" },

  /* ---------- gravité ---------- */
  "sev.wild":              { fr: "Phénotype sauvage", en: "Wild-type phenotype" },
  "sev.mod":               { fr: "À surveiller", en: "Worth watching" },
  "sev.high":              { fr: "Préoccupant", en: "Concerning" },
  "sev.crit":              { fr: "Critique", en: "Critical" },

  /* ---------- compte rendu ---------- */
  "cr.titre":              { fr: "Compte rendu", en: "Report" },
  "cr.phenotype":          { fr: "Phénotype", en: "Phenotype" },
  "cr.mecanisme":          { fr: "Hypothèse mécanistique", en: "Mechanistic hypothesis" },
  "cr.regles":             { fr: "Règles appliquées", en: "Rules applied" },
  "cr.alertes":            { fr: "Alertes", en: "Alerts" },
  "cr.commentaire":        { fr: "Commentaire du compte rendu", en: "Report commentary" },
  "cr.antibiotiques":      { fr: "Antibiotiques", en: "Antimicrobial agents" },
  "cr.rendue":             { fr: "Catégorie rendue", en: "Category reported" },
  "cr.lue":                { fr: "Catégorie lue", en: "Category read" },
  "cr.motif":              { fr: "Motif", en: "Reason" },
  "cr.posologie":          { fr: "Posologie qui fonde le seuil", en: "Dosage underpinning the breakpoint" },
  "cr.source":             { fr: "Référentiel employé", en: "Breakpoint table used" },
  "cr.pourquoi":           { fr: "Pourquoi cette interprétation ?", en: "Why this interpretation?" },
  "cr.copier":             { fr: "Copier le raisonnement", en: "Copy the reasoning" },

  /* ---------- actions ---------- */
  "act.exporter.csv":      { fr: "Exporter (CSV)", en: "Export (CSV)" },
  "act.imprimer":          { fr: "Imprimer (PDF)", en: "Print (PDF)" },
  "act.verser":            { fr: "Verser cet isolat", en: "Add this isolate" },
  "act.activer":           { fr: "Activer", en: "Activate" },
  "act.recharger":         { fr: "Recharger", en: "Reload" },

  /* ---------- avertissement ---------- */
  "avert.titre":           { fr: "Avertissement", en: "Warning" },
  "avert.chapeau":         { fr: "Outil d'aide et de formation — pas un dispositif médical de diagnostic in vitro.",
                             en: "A decision-support and training tool — not an in vitro diagnostic medical device." },
  "avert.corps":           { fr: "PhénoBac propose une interprétation d'orientation fondée sur les phénotypes usuels, à partir de résultats que vous avez déjà lus. La validation biologique, les tests de confirmation et le référentiel en vigueur restent entièrement de la responsabilité du biologiste.",
                             en: "PhénoBac offers an indicative interpretation based on the usual phenotypes, from results you have already read. Biological validation, confirmatory testing and the breakpoint table in force remain entirely the responsibility of the microbiologist." },
  "avert.masquer":         { fr: "Ne plus afficher à l'ouverture", en: "Do not show on opening" },

  /* ---------- mise à jour ---------- */
  "maj.titre":             { fr: "Nouvelle version disponible", en: "A new version is available" },
  "maj.corps":             { fr: "Elle peut contenir des seuils corrigés.",
                             en: "It may contain corrected breakpoints." },

  /* ---------- gratuité ---------- */
  "gratuit.bandeau":       { fr: "Gratuit, sans compte, sans licence",
                             en: "Free, no account, no licence" },
  "gratuit.accroche":      { fr: "Le raisonnement expert, à portée de paillasse.",
                             en: "Expert reasoning, within reach of the bench." },

  /* ---------- présentation ---------- */
  "intro.apropos":         { fr: "À propos de PhénoBac", en: "About PhénoBac" },
  "intro.seuils":          { fr: "Seuils", en: "Breakpoints" },

  /* ---------- LES BLOCS RICHES DE LA PRÉSENTATION ----------

     Posés par data-i18n-html, qui remplace le bloc ENTIER, balisage compris.
     data-i18n ne remplace qu'un nœud de texte : il ne pouvait rien faire
     d'un paragraphe où le gras porte une partie du sens, et les découper en
     douze libellés aurait traduit douze fragments sans phrase.

     Le français ci-dessous est AUSSI celui de phenobac.html. La page doit
     s'afficher avant que langue.js ait tourné, donc le texte existe aux deux
     endroits — et deux copies d'une même donnée divergent. C'est
     outils/verifier-langues.py qui l'interdit : il confronte, bloc par bloc,
     le HTML de la page au « fr » du catalogue. */
  "ap.accroche":          { fr: "Le raisonnement expert, à portée de paillasse.",
                 en: "Expert reasoning, within reach of the bench." },
  "ap.intro":             { fr: "PhénoBac est un <b>outil d'aide à l'interprétation et à la formation</b>. Il nomme le phénotype de résistance derrière un antibiogramme, signale les incohérences avec les résistances naturelles attendues, et rédige le commentaire du compte-rendu. Il applique au choix l'<b>EUCAST</b> ou le <b>CA-SFM</b>, qui ne rendent pas toujours la même chose. L'antibiogramme se saisit directement en <b>millimètres</b> — la méthode des disques, celle des laboratoires sans automate —, ou en <b>S/I/R</b>, ou en <b>CMI</b>. Toutes les espèces, la saisie en diamètres, l'export et l'entraînement sont accessibles à tous.",
              en: "PhénoBac is a <b>tool for interpretation and for training</b>. It names the resistance phenotype behind a susceptibility test, flags results that contradict the expected intrinsic resistances, and writes the comment for the report. It applies either <b>EUCAST</b> or <b>CA-SFM</b>, which do not always give the same answer. The susceptibility test can be entered directly in <b>millimetres</b> — the disc method, the method of laboratories without an automated system — or as <b>S/I/R</b>, or as <b>MICs</b>. Every species, disc-diameter entry, export and training are available to everyone." },
  "ap.tagline":           { fr: "Interprétez&nbsp;· Comprenez&nbsp;· Formez",
                en: "Interpret&nbsp;· Understand&nbsp;· Teach" },
  "ap.nest.titre":        { fr: "Ce que PhénoBac n'est pas",
                   en: "What PhénoBac is not" },
  "ap.nest.texte":        { fr: "Ce n'est <b>pas un dispositif médical de diagnostic in vitro</b>, et il ne lit pas vos boîtes : il part des résultats que vous avez déjà lus — catégories S/I/R, CMI, ou diamètres mesurés au pied à coulisse. Il ne remplace ni le jugement du biologiste, ni les tests de confirmation, ni le référentiel en vigueur. La validation biologique reste entière.",
                   en: "It is <b>not an in vitro diagnostic medical device</b>, and it does not read your plates: it starts from results you have already read — S/I/R categories, MICs, or diameters measured with callipers. It replaces neither the clinical microbiologist's judgement, nor the confirmatory tests, nor the standard in force. Biological validation remains wholly yours." },
  "ap.apporte.liste":     { fr: "<li><b>Le phénotype, pas seulement la catégorie.</b> BLSE, carbapénémase, SARM, MLS<sub>b</sub>, AmpC déréprimée, ERV, PSDP — nommés, avec le mécanisme et le niveau de risque.</li> <li><b>Deux référentiels, au choix.</b> EUCAST ou CA-SFM, avec leurs différences réelles : seuils déplacés, molécules que l'un conserve et l'autre a retirées, et règles de lecture qui divergent.</li> <li><b>La lecture interprétative, visible.</b> Quand une catégorie est modifiée — BLSE, carbapénémase confirmée —, le compte-rendu porte <i>la catégorie rendue et celle qui a été lue</i>, avec le motif. Le résultat de paillasse n'est jamais effacé.</li> <li><b>Les incohérences.</b> Un résultat contraire aux résistances naturelles attendues de l'espèce est signalé avant le rendu.</li> <li><b>La lecture au disque, en millimètres.</b> Entrez les diamètres mesurés : la catégorie se calcule, avec la charge du disque rappelée sous chaque molécule — « 23 mm » ne veut rien dire sans elle. Là où le référentiel ne reconnaît pas la méthode des disques — colistine, vancomycine sur staphylocoque —, l'application refuse de conclure et le dit, plutôt que de laisser croire l'antibiotique non testé.</li> <li><b>La surveillance de votre propre résistance.</b> Les antibiogrammes versés alimentent un registre local d'où sortent votre antibiogramme cumulatif et son évolution annuelle, avec la déduplication par patient et le seuil de 30 isolats en dessous duquel aucun pourcentage n'est rendu. Rien ne quitte le poste tant que vous ne le transmettez pas.</li> <li><b>Un registre de contrôle de qualité.</b> Les diamètres obtenus sur souche de référence sont confrontés aux cibles du CA-SFM, enregistrés avec leur date, le lot de disques et la conduite tenue en cas d'écart, et exportables en CSV. L'application refuse d'enregistrer une non-conformité sans conduite tenue.</li> <li><b>Les dépistages, à leur place.</b> Sur le pneumocoque, les β-lactamines ne se lisent pas au disque : c'est le disque d'oxacilline 1 µg qui répond. Sur les streptocoques A, C et G, le CA-SFM n'autorise qu'à reconnaître les souches sensibles. Dans les deux cas, PhénoBac applique la règle et ne rend jamais « résistant » sur un simple dépistage.</li> <li><b>Les zones d'incertitude technique.</b> Quand la valeur mesurée tombe là où la catégorie n'est plus reproductible, PhénoBac le dit et rappelle la conduite à tenir — sans jamais dégrader la catégorie de lui-même.</li> <li><b>Les molécules de recours.</b> Témocilline, céfidérocol, daptomycine, minocycline, moxifloxacine, à côté du panel usuel.</li> <li><b>Le commentaire du compte-rendu</b>, rédigé et prêt à copier.</li> <li><b>Un mode entraînement</b> — interprétation, identification, cas complets — pour la formation des techniciens et des étudiants.</li> <li><b>Hors-ligne.</b> Installable sur téléphone, utilisable sans réseau une fois ouvert.</li>",
                      en: "<li><b>The phenotype, not just the category.</b> ESBL, carbapenemase, MRSA, inducible MLS<sub>b</sub>, derepressed AmpC, VRE, penicillin-non-susceptible pneumococcus — named, with the mechanism and the level of risk.</li> <li><b>Two standards, your choice.</b> EUCAST or CA-SFM, with the differences that really exist: breakpoints that moved, agents one keeps and the other withdrew, and reading rules that diverge.</li> <li><b>Interpretive reading, in plain sight.</b> When a category is changed — ESBL, confirmed carbapenemase — the report carries <i>the category reported and the one that was read</i>, with the reason. The bench result is never erased.</li> <li><b>Inconsistencies.</b> A result that contradicts the species' expected intrinsic resistances is flagged before the report goes out.</li> <li><b>Disc reading, in millimetres.</b> Enter the measured diameters: the category is computed, with the disc content recalled under each agent — \"23 mm\" means nothing without it. Where the standard does not recognise the disc method — colistin, vancomycin in staphylococci — the application refuses to conclude and says so, rather than letting the agent look untested.</li> <li><b>Surveillance of your own resistance.</b> The susceptibility tests you submit feed a local register, from which your cumulative antibiogram and its year-on-year trend are produced, with per-patient deduplication and the 30-isolate floor below which no percentage is reported. Nothing leaves the machine until you send it.</li> <li><b>A quality-control register.</b> Diameters obtained on reference strains are compared with the CA-SFM targets and recorded with their date, the disc lot and the action taken when out of range, and can be exported as CSV. The application refuses to record a non-conformity with no action taken.</li> <li><b>Screening tests, kept in their place.</b> In pneumococci the beta-lactams are not read from a disc: the 1 µg oxacillin disc is what answers. In group A, C and G streptococci, CA-SFM allows only susceptible isolates to be recognised. In both cases PhénoBac applies the rule and never reports \"resistant\" on a screening test alone.</li> <li><b>Areas of technical uncertainty.</b> When the measured value falls where the category is no longer reproducible, PhénoBac says so and recalls what to do — without ever downgrading the category on its own.</li> <li><b>Agents of last resort.</b> Temocillin, cefiderocol, daptomycin, minocycline and moxifloxacin, alongside the usual panel.</li> <li><b>The report comment</b>, written and ready to copy.</li> <li><b>A training mode</b> — interpretation, identification, full cases — for teaching technicians and students.</li> <li><b>Offline.</b> Installable on a phone, usable without a network once opened.</li>" },
  "ap.ref.1":             { fr: "Deux référentiels sont disponibles, au choix, dans l'encadré « Antibiogramme » : l'<b>EUCAST</b>, socle commun européen, et le <b>CA-SFM</b>, qui est l'EUCAST assorti des différences françaises que son comité publie et justifie chaque année. PhénoBac n'en recopie que ces différences : tout couple germe-antibiotique qu'elles ne mentionnent pas garde sa valeur EUCAST.",
              en: "Two standards are available, your choice, in the \"Susceptibility test\" panel: <b>EUCAST</b>, the common European base, and <b>CA-SFM</b>, which is EUCAST together with the French differences its committee publishes and justifies each year. PhénoBac copies only those differences: any organism-agent pair they do not mention keeps its EUCAST value." },
  "ap.ref.2":             { fr: "Le choix n'est pas cosmétique. Il déplace des seuils — la vancomycine sur <i>S. aureus</i>, la pénicilline G sur les streptocoques A, C et G, le cotrimoxazole selon que l'infection est urinaire ou non — et il change la lecture interprétative : l'EUCAST ne réinterprète plus les céphalosporines en cas de BLSE, le CA-SFM le fait, et rend les carbapénèmes résistants dès qu'une carbapénémase est confirmée. Quand une catégorie est ainsi modifiée, le compte-rendu porte la catégorie rendue <i>et</i> la catégorie lue, avec le motif.",
              en: "The choice is not cosmetic. It moves breakpoints — vancomycin in <i>S. aureus</i>, benzylpenicillin in group A, C and G streptococci, co-trimoxazole according to whether the infection is urinary — and it changes the interpretive reading: EUCAST no longer reinterprets the cephalosporins when an ESBL is present, CA-SFM does, and reports the carbapenems resistant as soon as a carbapenemase is confirmed. When a category is changed in this way, the report carries the category reported <i>and</i> the one that was read, with the reason." },
  "ap.ref.3":             { fr: "Quelques couples portent en outre une <b>zone d'incertitude technique</b> : à cette valeur précise de CMI, la catégorisation n'est pas reproductible. PhénoBac l'affiche et rappelle les options — répéter le test, recourir à une autre méthode, signaler l'incertitude —, mais ne dégrade jamais la catégorie de lui-même : l'EUCAST l'admet parmi d'autres options, le CA-SFM l'écarte, et la décision appartient au biologiste.",
              en: "A few pairs also carry an <b>area of technical uncertainty</b>: at that precise MIC, categorisation is not reproducible. PhénoBac displays it and recalls the options — repeat the test, use another method, report the uncertainty — but never downgrades the category on its own: EUCAST allows that among other options, CA-SFM rules it out, and the decision belongs to the clinical microbiologist." },
  "ap.ref.4":             { fr: "Les seuils sont modifiables dans « Concentrations critiques » : calez-les sur le référentiel de votre laboratoire avant tout rendu. Lorsque le référentiel ne fixe pas de seuil pour un couple germe-antibiotique, la valeur proposée est une convention de laboratoire, pas une valeur officielle — l'éditeur la marque.",
              en: "The breakpoints can be changed under \"Breakpoints\": set them to your laboratory's own standard before reporting anything. Where the standard sets no breakpoint for an organism-agent pair, the value offered is a laboratory convention, not an official value — the editor marks it as such." },
  "ap.conception.texte":  { fr: "Conçu et développé par le <b>Dr. Modibo Mouctar COULIBALY</b>, PharmD, CLMS, PhD, <b>Maître de Recherche à l'Hôpital Sominé DOLO de Mopti</b> (Mali), pour les laboratoires qui interprètent sans automate. Remarques, corrections de seuils et demandes de formation sont les bienvenues.",
                         en: "Designed and built by <b>Dr Modibo Mouctar COULIBALY</b>, PharmD, CLMS, PhD, <b>Research Director at Hôpital Sominé DOLO, Mopti</b> (Mali), for laboratories that interpret without an automated system. Comments, breakpoint corrections and training requests are all welcome." },

  /* ---------- vague 2 : le reste de l'interface ---------- */
  "champ.idech":          { fr: "Identification — patient / n° échantillon",
                 en: "Identification — patient / specimen no." },
  "champ.exemples":       { fr: "Exemples de démonstration",
                    en: "Worked examples" },
  "bloc.interpretation":  { fr: "Interprétation",
                         en: "Interpretation" },
  "vide.interpretation":  { fr: "Choisissez une espèce et saisissez au moins un résultat pour obtenir le phénotype, les alertes de cohérence et le commentaire du compte-rendu.",
                         en: "Choose a species and enter at least one result to obtain the phenotype, the consistency alerts and the comment for the report." },
  "bloc.idpresumee":      { fr: "Identification présumée",
                     en: "Presumptive identification" },
  "bloc.souchecq":        { fr: "Souche de référence",
                   en: "Reference strain" },
  "bloc.evolution":       { fr: "Évolution",
                    en: "Trend" },
  "bloc.entrainement":    { fr: "Entraînement guidé",
                       en: "Guided training" },
  "act.transmettre":      { fr: "Transmettre les isolats en attente",
                     en: "Send the pending isolates" },
  "bloc.surveillance":    { fr: "Surveillance de la résistance",
                       en: "Resistance surveillance" },
  "champ.dateprel":       { fr: "Date du prélèvement",
                    en: "Specimen date" },
  "champ.age":            { fr: "Âge (années)",
               en: "Age (years)" },
  "opt.nonrenseigne":     { fr: "Non renseigné",
                      en: "Not recorded" },
  "opt.feminin":          { fr: "Féminin",
                 en: "Female" },
  "opt.nonrenseignee":    { fr: "Non renseignée",
                       en: "Not recorded" },
  "opt.hospitalise":      { fr: "Hospitalisé",
                     en: "Inpatient" },
  "act.verserSurv":       { fr: "Verser à la surveillance",
                    en: "Submit to surveillance" },
  "bloc.premium":         { fr: "Accès Premium",
                  en: "Premium access" },
  "premium.titre":        { fr: "Débloquez l'accès total",
                   en: "Unlock full access" },
  "premium.lead":         { fr: "PhénoBac est gratuit, sans compte et sans licence. Cette fenêtre ne sert qu'à activer une licence d'établissement, s'il vous en a été remis une.",
                  en: "PhénoBac is free, with no account and no licence. This window exists only to activate an institutional licence, if one has been issued to you." },
  "intro.avert.texte":    { fr: "<b>Outil d'aide et de formation — pas un dispositif médical de diagnostic in vitro.</b> PhénoBac propose une interprétation d'orientation fondée sur les phénotypes usuels, à partir de résultats que vous avez déjà lus. La validation biologique, les tests de confirmation et le référentiel en vigueur restent entièrement de la responsabilité du biologiste.",
                       en: "<b>A tool for guidance and training — not an in vitro diagnostic medical device.</b> PhénoBac offers an orienting interpretation based on the usual phenotypes, starting from results you have already read. Biological validation, the confirmatory tests and the standard in force remain entirely the clinical microbiologist's responsibility." },
  "surv.note":            { fr: "Ne quittent jamais votre navigateur : le numéro d'échantillon du compte rendu et le nom du valideur. Le numéro patient ci-dessus est un compteur <b>anonyme</b> que vous choisissez — il permet seulement d'éviter de compter deux fois la même personne, comme le demande le manuel de l'OMS.",
               en: "These never leave your browser: the specimen number on the report and the validating microbiologist's name. The patient number above is an <b>anonymous</b> counter of your own choosing — it serves only to avoid counting the same person twice, as the WHO manual requires." },
  "premium.liste":        { fr: "<li><span class=\"ck\">✓</span> Interprétation des <span data-compte=\"interp\">…</span> espèces et tous les phénotypes</li> <li><span class=\"ck\">✓</span> Saisie par CMI et seuils paramétrables</li> <li><span class=\"ck\">✓</span> Export PDF des comptes-rendus</li> <li><span class=\"ck\">✓</span> Banque extensible : créer (réponse déduite), importer, exporter</li>",
                   en: "<li><span class=\"ck\">✓</span> Interpretation of <span data-compte=\"interp\">…</span> species and every phenotype</li> <li><span class=\"ck\">✓</span> MIC entry and editable breakpoints</li> <li><span class=\"ck\">✓</span> PDF export of reports</li> <li><span class=\"ck\">✓</span> An extensible bank: create (answer inferred), import, export</li>" },

  /* ---------- vague 3 : pied de page, barre de mise à jour ---------- */
  "maj.seuils":           { fr: "Elle peut contenir des seuils corrigés.",
                en: "It may carry corrected breakpoints." },
  "pied.ligne1":          { fr: "PhénoBac · MVP v1.0 · identification biochimique · moteur serveur · <span data-compte=\"interp\">…</span> espèces · EUCAST &amp; CA-SFM · CMI · PDF · quiz",
                 en: "PhénoBac · MVP v1.0 · biochemical identification · server engine · <span data-compte=\"interp\">…</span> species · EUCAST &amp; CA-SFM · MIC · PDF · quiz" },
  "pied.ligne2":          { fr: "<b>Conception : Dr. Modibo Mouctar COULIBALY</b> — PharmD, CLMS, PhD · Maître de Recherche, Hôpital Sominé DOLO de Mopti",
                 en: "<b>Designed by Dr Modibo Mouctar COULIBALY</b> — PharmD, CLMS, PhD · Research Director, Hôpital Sominé DOLO, Mopti" },
  "pied.avert":           { fr: "PhénoBac n'est <b>pas un dispositif médical de diagnostic in vitro</b>. Il propose une interprétation d'orientation fondée sur les phénotypes usuels, à partir de résultats déjà lus, et ne remplace ni le jugement du biologiste, ni les tests de confirmation (synergie, carba NP, biologie moléculaire), ni le référentiel en vigueur. Les concentrations critiques fournies sont <span id=\"footRef\">celles du référentiel EUCAST</span>. Quelques couples germe-antibiotique, pour lesquels <span id=\"footNom\">l'EUCAST</span> ne fixe aucun seuil, y font exception : l'éditeur les signale <b style=\"color:#7a5207\" id=\"footHors\">hors EUCAST</b>. Vérifiez-les et ajustez-les à votre référentiel dans « Concentrations critiques » avant tout rendu.",
                en: "PhénoBac is <b>not an in vitro diagnostic medical device</b>. It offers an orienting interpretation based on the usual phenotypes, starting from results already read, and replaces neither the clinical microbiologist's judgement, nor the confirmatory tests (synergy, carba NP, molecular biology), nor the standard in force. The breakpoints supplied are <span id=\"footRef\">those of the EUCAST standard</span>. A few organism-agent pairs, for which <span id=\"footNom\">EUCAST</span> sets no breakpoint, are the exception: the editor marks them <b style=\"color:#7a5207\" id=\"footHors\">outside EUCAST</b>. Check them and set them to your own standard under \"Breakpoints\" before reporting anything." },

  /* ---------- vague 4 : les attributs (infobulles, accessibilité, invites) ----------
     Ni data-i18n ni data-i18n-html ne les atteignent, et texte_visible() ne
     les lit pas : posés par data-i18n-attr="attribut:clé". */
  "attr.revoirIntro":     { fr: "Revoir la présentation", en: "See the introduction again" },
  "attr.fermerIntro":     { fr: "Fermer la présentation", en: "Close the introduction" },
  "attr.filtreRegles":    { fr: "antibiotique, groupe…", en: "antibiotic, group…" },
  "attr.filtrerRegles":   { fr: "Filtrer les règles", en: "Filter the rules" },
  "attr.modeExamen":      { fr: "Aucune correction pendant l'épreuve : tout est rendu à la fin.",
                            en: "No marking during the test: everything is given at the end." },
  "attr.pourquoiInterp":  { fr: "Pourquoi cette interprétation", en: "Why this interpretation" },
  "attr.service":         { fr: "Réanimation", en: "Intensive care" },
  "attr.passerPremium":   { fr: "Passer à Premium", en: "Go Premium" },
  "attr.cleLicence":      { fr: "Collez votre clé de licence", en: "Paste your licence key" },
  "attr.aRetenir":        { fr: "Point clé que l'étudiant doit mémoriser.",
                            en: "The key point the student should remember." },

  /* ---------- vague 5 : les modes d'entraînement ----------
     Ces trois-là n'ont ni accent ni mot-outil français : le compteur de
     texte visible ne les voyait pas, et ils sont restés français dans une
     page par ailleurs entièrement traduite. Un mot peut être français sans
     en porter le moindre signe. */
  "quiz.mixte":           { fr: "Mixte", en: "Mixed" },
  "quiz.combo":           { fr: "Cas complet", en: "Full case" },
  "quiz.examen":          { fr: "Mode examen", en: "Test mode" }
};

const DEFAUT = "fr";
let _langue = DEFAUT;

function disponibles() { return ["fr", "en"]; }

/* La langue est choisie, dans cet ordre : l'adresse (?lang=), le choix
   mémorisé, la langue du navigateur, le français. L'adresse d'abord, parce
   qu'un lien partagé doit s'ouvrir dans la langue de celui qui l'a envoyé. */
function resoudre(adresse, memoire, navigateur) {
  const q = /[?&]lang=([a-z]{2})/.exec(String(adresse || ""));
  const candidats = [q && q[1], memoire, String(navigateur || "").slice(0, 2)];
  for (const c of candidats) {
    if (c && disponibles().indexOf(c) !== -1) return c;
  }
  return DEFAUT;
}

function fixer(l) {
  _langue = disponibles().indexOf(l) !== -1 ? l : DEFAUT;
  return _langue;
}
function courante() { return _langue; }
function estAnglais() { return _langue === "en"; }

/* UNE CLÉ INCONNUE DOIT SE VOIR, PAS DISPARAÎTRE.
   Rendre la chaîne vide ferait un trou dans l'interface, et un trou ne se
   signale pas : on le prend pour un espace. Rendre la clé entre crochets la
   rend immédiatement reconnaissable, en développement comme en production. */
function L(cle) {
  const e = C[cle];
  if (!e) return "⟦" + cle + "⟧";
  return e[_langue] || e[DEFAUT] || ("⟦" + cle + "⟧");
}

/* La catégorie I ne s'écrit pas pareil selon le référentiel : c'est une
   différence de fond entre les deux comités, pas une variante de style. */
function categorie(cat, casfm) {
  if (cat === "S") return L("cat.S.court");
  if (cat === "R") return L("cat.R");
  if (cat === "I") return L(casfm ? "cat.I.casfm" : "cat.I.eucast");
  return L("cat.nonteste");
}

const API = { L, categorie, fixer, courante, estAnglais, resoudre,
              disponibles, CATALOGUE: C, DEFAUT };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else racine.PhenoBacLangue = API;

})(typeof self !== "undefined" ? self : this);
