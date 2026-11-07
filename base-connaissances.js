// base-connaissances.js — les règles, en données.
//
// CE FICHIER FAIT FOI. Le moteur ne contient plus de seuil : il reconstruit
// ses tables à partir d'ici, au chargement. Mettre à jour un référentiel ne
// demande donc plus de toucher à l'application.
//
// UNE RÈGLE EST IDENTIFIÉE PAR CINQ COORDONNÉES
//
//   référentiel · groupe bactérien · antibiotique · méthode · site
//
// et porte ce qui en découle. Les colonnes, dans l'ordre :
//
//   ref     eucast | casfm
//   groupe  groupe de seuils (entero, staph, pneumo…)
//   abx     code de l'antibiotique
//   meth    cmi | disque
//   site    standard | meninge | urinaire
//   S, R    seuils. « null » en S signifie AUCUNE catégorie « sensible » à
//           posologie standard : c'est une décision du comité, pas une valeur
//           manquante. « undefined » signifie qu'il n'y a pas de seuil du
//           tout. La distinction est essentielle — les confondre ferait
//           d'une ligne qui ne porte qu'un témoin un seuil {S:null, R:null},
//           et le renvoi vers le disque d'ampicilline serait perdu
//   charge  charge du disque. Un diamètre ne veut rien dire sans elle
//   zit     zone d'incertitude technique : une valeur en CMI, un intervalle
//           [bas, haut] au disque
//   temoin  molécule dont on lit le disque à la place (amoxicilline sur
//           ampicilline, chez les entérobactéries et à l'EUCAST seulement)
//   dep     seuil de DÉPISTAGE : au-dessus on conclut « sensible », en
//           dessous on ne conclut pas. Ce n'est pas un seuil clinique
//   conv    le référentiel ne fixe RIEN pour ce couple ; la valeur est une
//           convention de laboratoire, et l'interface le dit
//   couv    le CA-SFM couvre ce couple que l'EUCAST laisse sans seuil.
//           true, ou la liste des espèces concernées
//   espece  restriction d'espèce (la céfoxitine, chez E. coli seulement)
//   ecoff   l'EUCAST donne ce seuil ENTRE PARENTHÈSES. Il est fondé sur
//           l'ECOFF : il sépare le sauvage de l'acquis et NE PRÉDIT PAS la
//           sensibilité clinique. Note 12 du classeur : « clinical evidence
//           as monotherapy is usually lacking […] Reporting S or I should be
//           avoided and if considered necessary, there should be a comment ».
//           Appliquer la valeur sans la réserve, c'est rendre « sensible »
//           une colistine ou un aminoside sur un seuil qui ne le promet pas
//
// PROVENANCE. Elle est portée par référentiel, dans SOURCES ci-dessous :
// document, version et date de validité. La page précise de chaque
// différence CA-SFM reste dans REFERENTIEL-CASFM.md ; elle n'a pas été
// recopiée ici, parce qu'une page fausse serait pire que pas de page.
//
// Produit une première fois par outils/construire-base.py à partir des
// tables du moteur, puis maintenu ici. outils/verifier-tables.py échoue si
// les tables reconstruites s'écartent de ce que le client affiche, et
// outils/comparer-eucast.py si elles s'écartent du classeur officiel.

(function (racine) {
"use strict";

const SOURCES = {
  eucast: { nom: "EUCAST", version: "16.1", publie: "2026-06-24",
            document: "Breakpoint tables for interpretation of MICs and zone diameters, v16.1" },
  casfm:  { nom: "CA-SFM", version: "2026", publie: "2026-09-01",
            document: "Recommandations CA-SFM / EUCAST, version 2026" }
};

// Version de la base elle-même, distincte de celle de l'application : elle
// change dès qu'une règle change, et accompagne chaque compte rendu.
const BASE_VERSION = "2026.41";

/* La colonne « sdd » est en QUEUE de liste, et c'est délibéré : les lignes
   de la base sont des tableaux positionnels, et une colonne ajoutée au bout
   laisse les quelque deux mille lignes existantes intactes — elles la
   reçoivent simplement « undefined ». L'insérer au milieu aurait décalé
   chaque valeur d'un cran, en silence.

   CE QU'ELLE VEUT DIRE. « sdd: true » dit que la bande intermédiaire de ce
   couple s'appelle SDD — Susceptible-Dose Dependent — et non « I ». Ce n'est
   PAS un troisième seuil : SDD occupe exactement la bande entre S et R, et
   le CLSI ne donne jamais les deux pour un même agent. Mesuré sur les seize
   tables de seuils du M100 : les colonnes SDD et I coexistent en 2A-1, 2A-2,
   2C et 2D, mais pour un agent donné l'une des deux porte toujours « – ».
   Un booléen suffit donc, et un troisième seuil aurait été une fiction.

   Elle vit au niveau du COUPLE ET DE LA MÉTHODE, pas du couple seul : en
   table 2D, SDD existe pour la CMI et pas pour le diamètre. */
const COLONNES = ["ref", "groupe", "abx", "meth", "site", "S", "R", "charge", "zit", "temoin", "dep", "conv", "couv", "espece", "ecoff", "sdd"];

/* Le nombre de règles n'est PAS écrit ici. Il l'a été, et il a vieilli sans
   bruit : « 578 » alors que le fichier en portait 681. Un chiffre faux dans
   un commentaire est inoffensif ; la même habitude dans la page ne l'est pas,
   et outils/verifier-comptes.py existe pour cela. Le compte se lit sur
   REGLES.length. */
const REGLES = [
/* LA PÉNICILLINE G DE S. AUREUS : UNE ZIT SUR TOUTE LA PLAGE BASSE.
   Décision du biologiste du 2026-11-01.

   Page 72 du communiqué : colonne S « Note », R > 0,125, ZIT « ≤ 0,125 ».
   Page 11 du document des différences :

     « une CMI de pénicilline G > 0,125 mg/L permet de confirmer la présence
       de pénicillinase et une CMI ≤ 0,125 mg/L NE PERMET PAS D'EXCLURE la
       présence d'une pénicillinase »

   PhénoBac rendait « S » sans réserve à 0,06 mg/L. Le comité ne refuse pas
   la valeur : il refuse de CONCLURE sur la seule CMI, et renvoie au disque —
   que l'EUCAST lui-même tient pour plus fiable sur ce couple.

   LA LIGNE NE PORTE DONC QUE LA ZIT. Pas de S ni de R : la valeur reste
   celle de l'EUCAST (0,125 / 0,125), et c'est l'INCERTITUDE qui est propre
   au CA-SFM. Mettre « S: null » aurait rendu « I » toute la plage basse, et
   « I » se lit « sensible à forte posologie » : un clinicien aurait pu
   prescrire de la pénicilline à forte dose sur une souche productrice de
   pénicillinase. Le remède aurait été pire que le mal.

   C'est la première ZIT à borne ouverte de la base ; zitBorne() dans
   moteur.js dit la forme admise et lève sur tout le reste. */
/* « casfm / ngono / GEN 16-16 » : RETIRÉE PUIS REMISE, LE 2026-10-31.

   Le balayage en sens inverse de comparer-casfm.py l'a signalée — le
   communiqué complet ne chiffre nulle part la gentamicine du gonocoque, et
   sa page 108 ne cite « CMI ≤ 16 mg/L » que dans une NOTE, pour séparer les
   souches sauvages de celles ayant acquis un mécanisme. C'est la définition
   d'un ECOFF, et un ECOFF employé comme seuil clinique est une faute.

   Elle a donc été retirée, et outils/essai-referentiel.js est tombé au
   rouge en citant sa source : « p. 14 — gentamicine / N. gonorrhoeae :
   l'EUCAST écarte la molécule ». Cette page 14 n'est PAS celle du
   communiqué : c'est celle du document « Différences principales entre le
   CA-SFM et l'EUCAST », un second document que ce poste n'a pas.

   La ligne a donc été remise, puis le document des différences a été lu —
   le même jour, page 14. IL TRANCHE, ET DANS L'AUTRE SENS :

     « Le CA-SFM propose un seuil à 16 mg/L, BASÉ SUR L'ECOFF, permettant de
       séparer les souches sauvages des souches non sauvages. La
       justification est basée sur […] d'être en adéquation avec les
       recommandations thérapeutiques françaises, qui positionnent la
       gentamicine comme alternative en […] ceftriaxone. »

   Le comité ADOPTE l'ECOFF comme seuil, délibérément, en le disant, et
   parce que les recommandations françaises font de la gentamicine une
   alternative thérapeutique — l'EUCAST, lui, marque la molécule « – »,
   impropre au traitement. La ligne est donc juste, et ce n'est pas un
   ECOFF égaré : c'est une divergence assumée entre les deux comités, qui
   est exactement ce que le delta existe pour porter.

   Mon raisonnement était faux, et il l'était sur un seul document. Le
   balayage en sens inverse de comparer-casfm.py ne lit QUE le communiqué
   complet : une valeur qu'il ne retrouve pas n'est pas pour autant sans
   source, et il le dit désormais lui-même dans son rapport.

   Un banc qui tombe en citant sa source vaut mieux qu'une suppression qui
   paraît propre. */

/* NITROFURANTOÏNE ET TRIMÉTHOPRIME : LA RESTRICTION D'ESPÈCE LEVÉE, SAUF LÀ
   OÙ PHÉNOBAC SAIT DÉJÀ QUE L'ESPÈCE EST RÉSISTANTE. Décision du biologiste
   du 2026-10-31.

   Huit couples avaient la même forme : le CA-SFM donne la molécule à TOUT le
   chapitre, l'EUCAST la restreint à certaines espèces, et PhénoBac suivait
   l'EUCAST — si bien qu'un laboratoire en mode CA-SFM ne recevait aucune
   catégorie là où le comité français en donne une.

   Sept ont été portés le 2026-10-31 ; QUATRE SUBSISTENT, et ce sont les
   quatre de la nitrofurantoïne :

     salmonella NIT  p54   64 / 64   disque 100 µg  11 / 11
     serratia   NIT  p54   64 / 64   disque 100 µg  11 / 11
     staph      NIT  p77   64 / 64   disque 100 µg  13 / 13
     strepacg   NIT  p93   64 / 64   disque 100 µg  15 / 15

   LES TROIS DU TRIMÉTHOPRIME ONT ÉTÉ RETIRÉS LE 2026-11-01, sur décision du
   biologiste, après lecture de la page 6 du document des différences :

     « pour le triméthoprime (Enterobacterales et staphylocoques) […] le
       CA-SFM a adopté les modifications de breakpoints proposées par
       l'EUCAST en 2026 »

   Le CA-SFM suit donc l'EUCAST sur cette molécule, et l'EUCAST ne la chiffre
   que pour E. coli, K. pneumoniae et K. oxytoca. La ligne « Triméthoprime
   (cystites) » de la page 54, qui ne nomme aucune espèce, ne vaut pas
   extension du périmètre : elle donne la VALEUR, la portée reste celle de
   l'EUCAST. Morganella, Salmonella et Serratia n'ont donc pas de
   triméthoprime, sous aucun des deux référentiels.

   LA NITROFURANTOÏNE N'EST PAS CONCERNÉE : le document des différences n'en
   parle nulle part, et rien n'indique que le CA-SFM s'aligne sur la portée
   de l'EUCAST pour elle. Les quatre lignes restent.

   « Adopter les breakpoints » parle des VALEURS ; une restriction d'espèce
   est une PORTÉE. Les deux ne se déduisent pas l'une de l'autre, et c'est
   pour cela que la question a été posée plutôt que tranchée par l'outil.

   LE HUITIÈME NE L'EST PAS, ET CE N'EST PAS UNE PRUDENCE : « morganella NIT »
   couvre Proteus mirabilis, P. vulgaris, Morganella morganii et Providencia,
   et PhénoBac porte DÉJÀ pour ces quatre espèces la résistance naturelle à
   la nitrofurantoïne — EUCAST, phénotypes résistants attendus v1.2, règles
   1.10, 1.12 et 1.14. Porter 64 / 64 ferait rendre « sensible » une souche
   dont la même interprétation annoncerait, deux lignes plus bas,
   « incohérence : résistance naturelle attendue ». L'application se
   contredirait elle-même sur le même rendu, et la ligne du communiqué, qui
   vise la famille sans nommer les genres, ne vaut pas qu'on en arrive là.

   La ligne générale d'un chapitre ne défait pas une résistance naturelle
   connue de l'espèce.

   RESTE OUVERT, ET DU MÊME ORDRE : « scn NIT » est restreint par l'EUCAST à
   S. saprophyticus, alors que la page 77 du communiqué donne la
   nitrofurantoïne à tout le chapitre des staphylocoques. Lever cette
   restriction-là concerne S. epidermidis, S. lugdunensis et
   S. haemolyticus ; elle n'a pas été levée faute d'avoir été posée. */

/* LES NEUF ÉCARTS DU CA-SFM, PORTÉS LE 2026-10-31 SUR DÉCISION DU BIOLOGISTE.

   outils/comparer-casfm.py confronte le communiqué complet aux seuils de
   PhénoBac. Dix couples où le comité français dit autre chose que l'EUCAST et
   que le delta ne portait pas : le laboratoire choisissait « CA-SFM »,
   croyait travailler avec, et recevait la valeur EUCAST — en silence, sous le
   nom du comité.

   Les dix ont été relus un à un sur le texte positionné de leur page, HORS de
   l'outil qui les avait produits. Cette relecture a écarté dix-neuf faux
   candidats sur vingt-neuf, tous dus à des chapitres mal rattachés : le
   pneumocoque pris pour les streptocoques A/C/G, la mélioïdose pour
   Burkholderia cepacia, le complexe diphtheriae pour Corynebacterium spp.

   « S: null » n'est pas une valeur manquante : c'est le refus du comité
   d'accorder une catégorie « sensible ». Le document l'écrit « 0,001 »
   (note 13), et les deux comités emploient cette convention.

     refus de la catégorie S, que l'EUCAST accorde
       acineto  CAZ  p63     null / 8      (EUCAST 8 / 8)
       acineto  FEP  p63     null / 8      (EUCAST 8 / 8)
       acineto  TZP  p62     null / 16     (EUCAST 16 / 16)
       steno    LVX  p66     null / 1      (EUCAST 1 / 2)
     seuil R déplacé, les deux refusant déjà la catégorie S
       pseudo   LVX  p60     null / 0,5    (EUCAST null / 2)
       staph    CIP  p74     null / 1      (EUCAST null / 2)
       scn      CIP  p74     null / 1      (EUCAST null / 2)
     zone intermédiaire supprimée
       (viridans PEN a été porté puis RETIRÉ — voir ci-dessous)

   VIRIDANS / PÉNICILLINE G : PORTÉ LE MATIN, RETIRÉ LE SOIR.

   La page 95 du communiqué donne « Pénicilline G … 0,25 / 0,25 », et la
   ligne ressemble à toutes les autres. Le document « Différences
   principales entre le CA-SFM et l'EUCAST », page 13, dit ce que le tableau
   ne dit pas :

     « Pour la pénicilline G, le CA-SFM ne conserve que le seuil à
       0,25 mg/L À SEULE VISÉE DE DÉPISTAGE. »

   Et la note de la page 95 le confirme : « La pénicilline G peut être
   utilisée pour le dépistage des souches de sensibilité diminuée aux
   β-lactamines. »

   Ce n'est donc pas une concentration critique clinique, et l'avoir portée
   comme telle rendait « R » un viridans à 0,5 mg/L que l'EUCAST catégorise
   « I ». Les deux lignes — CMI et disque — sont retirées.

   RESTE UNE QUESTION DE MODÈLE, et elle est écrite plutôt que tranchée :
   le CA-SFM ne conservant AUCUN seuil clinique de pénicilline G pour les
   autres streptocoques, PhénoBac retombe sur celui de l'EUCAST. Dire « le
   comité refuse d'en donner un » demanderait un marqueur que la table BP
   n'a pas en CMI — le côté disque, lui, l'a (dzCasfmDivergent).

   LEÇON, ET C'EST LA MÊME QUE POUR « ngono GEN » LE MÊME JOUR, EN MIROIR :
   un chiffre dans une colonne « S ≤ » ne dit pas à quoi il sert. Là, le
   comité adopte un ECOFF comme seuil clinique ; ici, il garde un seuil pour
   le seul dépistage. Le tableau ne distingue pas les deux ; le document des
   différences, si. Les deux textes se lisent ensemble ou pas du tout.

   NEUF, ET NON DIX : « listeria LZD 2 / 2 » a été porté le matin du
   2026-10-31 puis RETIRÉ le même jour. La page 100 n'est pas celle de
   Listeria — c'est le chapitre « 5. 13. Corynebacterium spp. (à l'exception
   de C. diphtheriae complex) ». Son titre fait soixante-six caractères, et
   le lecteur écartait les titres de plus de soixante : le chapitre
   n'existait pas pour lui, les pages suivantes gardaient l'étiquette
   « Listeria » du chapitre précédent, et le linézolide des corynébactéries
   est devenu celui de Listeria. La page 99, la vraie, ne porte AUCUNE ligne
   de linézolide. Une valeur juste, au mauvais endroit, pour la troisième
   fois de la journée et par une porte nouvelle : un garde-fou de longueur.
     et un seul dans l'autre sens — le CA-SFM ACCORDE ce que l'EUCAST refuse
       serratia SXT  p54     0,5 / 0,5     (EUCAST null / 2)

   LA PAGE 54 PORTE DEUX LIGNES DE COTRIMOXAZOLE, et c'est la seconde qui vaut
   ici : « (infections urinaires sans signes de gravité) » 2 / 2, puis
   « (autres infections) » 0,5 / 0,5. entero, morganella et salmonella
   portaient déjà 0,5 / 0,5 ; seul serratia gardait la valeur EUCAST propre à
   ce genre.

   QUATRE DIAMÈTRES VIENNENT AVEC, ET CE N'EST PAS UN AJOUT GRATUIT. Porter la
   CMI seule aurait fait se contredire les deux méthodes À L'INTÉRIEUR du même
   référentiel : sur une Serratia, la CMI aurait permis « sensible » que le
   disque refusait ; chez les viridans, la CMI aurait supprimé une zone
   intermédiaire que le disque gardait ; sur les staphylocoques, la frontière
   R tombait à un diamètre différent. Ils sont lus sur les MÊMES lignes du
   document que les CMI ci-dessus :

       scn      CIP  p74   disque 5 µg          null / 24   (EUCAST null / 22)
       serratia SXT  p54   disque 1,25-23,75    15 / 15     (EUCAST null / 15)
       staph    CIP  p74   disque 5 µg          null / 21   (EUCAST null / 17)
       viridans PEN  p95   disque 1 unité       21 / 21     (EUCAST 21 / 12)

   Les diamètres d'Acinetobacter (CAZ, FEP, TZP) étaient DÉJÀ dans le delta
   depuis le 25 octobre : c'est la CMI qui manquait. Le disque disait donc
   « aucune catégorie S » pendant que la CMI rendait « sensible », dans le
   même référentiel et sur la même souche. Le delta était à moitié porté.

   DEUX LIGNES DU DOCUMENT N'ONT PAS ÉTÉ PORTÉES, ET C'EST ÉCRIT :
     — pseudo LVX au disque : le CA-SFM renvoie à une note et demande la CMI.
       PhénoBac garde le diamètre EUCAST, et le document lui-même dirige vers
       la méthode que l'on vient de corriger ;
     — listeria LZD au disque : le CA-SFM publie 25 / 25 (10 µg), l'EUCAST
       rien. L'ajouter donnerait à PhénoBac une lecture au disque qu'elle n'a
       pas — c'est une capacité nouvelle, pas la correction d'un écart, et
       elle demande sa propre décision. */
["casfm","acineto","CAZ","cmi","standard",null,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","CAZ","disque","standard",null,18,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","FEP","cmi","standard",null,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","FEP","disque","standard",null,18,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","MIN","disque","standard",null,18,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","SXT","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","SXT","disque","standard",16,14,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","SXT","disque","urinaire",14,14,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","TZP","cmi","standard",null,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","acineto","TZP","disque","standard",null,21,"100-10",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","bfragilis","MXF","disque","standard",21,21,"5",[18,20],undefined,undefined,undefined,undefined,undefined],
["casfm","coryne","SXT","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","coryne","SXT","disque","standard",19,16,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","cperfringens","MXF","disque","standard",21,21,"5",[18,20],undefined,undefined,undefined,undefined,undefined],
["casfm","entero","AMC","cmi","urinaire",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","AMC","disque","urinaire",16,16,"20-10",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","AMX","disque","standard",19,19,"20",undefined,undefined,undefined,undefined,undefined,undefined],
/* LE CÉFIDÉROCOL AU DISQUE : LE CA-SFM N'EN VEUT PAS, OU PRESQUE.
   Décision du biologiste du 2026-11-01.

   Communiqué p50, entérobactéries : « Céfidérocol  S ≤ 2  R > 2 », colonne
   disque « Note », et la note 5/A dit « Déterminer la CMI du céfidérocol par
   microdilution en milieu liquide ». Document des différences p5 : « pour
   les Enterobacterales, le CA-SFM recommande de NE PAS UTILISER la méthode
   des disques », à cause des défauts de corrélation entre diamètres et CMI,
   « observés plus particulièrement avec les souches multi-résistantes pour
   lesquelles le testing du céfidérocol peut s'avérer utile ». C'est-à-dire :
   le disque ment précisément là où l'on a besoin de lui.

   PhénoBac appliquait un diamètre de 23 mm sous CA-SFM comme sous EUCAST.

   LA LIGNE CMI CI-DESSOUS N'EST PAS UN DOUBLON. Sa valeur est celle de
   l'EUCAST, et elle ne change aucune catégorie en CMI. Elle existe parce que
   c'est elle qui fait répondre « vrai » à dzCasfmDivergent() — « le CA-SFM
   chiffre ce couple en CMI et ne lui donne aucun diamètre » — et qui retire
   donc le disque sous CA-SFM. Le mécanisme a été écrit pour cela.

   Pour PSEUDOMONAS, le comité est moins catégorique : p59, « Céfidérocol
   S ≤ 2 · R > 2 · disque 30 µg · 27 », et la note « si le diamètre est
   < 27 mm, déterminer la CMI du céfidérocol ». Le disque ne CATÉGORISE pas :
   il DÉPISTE. C'est la colonne « dep », et sa règle est déjà celle du
   moteur — au-dessus du seuil il conclut « sensible », en dessous il ne
   conclut pas et renvoie à la CMI. */
["casfm","entero","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","FOS","cmi","standard",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","FOS","disque","standard",21,21,"200",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","FOX","disque","standard",18,18,"30",undefined,undefined,undefined,undefined,undefined,["ecoli"]],
["casfm","entero","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","SXT","disque","urinaire",14,14,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","TEM","cmi","urinaire",8,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","entero","TEM","disque","urinaire",20,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","enteroc","DAP","cmi","standard",undefined,undefined,undefined,4,undefined,undefined,undefined,undefined,undefined],
["casfm","haemo","MEM","cmi","meninge",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","AMC","cmi","urinaire",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","AMC","disque","urinaire",16,16,"20-10",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","AMX","disque","standard",19,19,"20",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","FOS","cmi","standard",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","FOS","disque","standard",21,21,"200",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","SXT","disque","urinaire",14,14,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","TEM","cmi","urinaire",8,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","morganella","TEM","disque","urinaire",20,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","ngono","GEN","cmi","standard",16,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","nmening","AMX","cmi","meninge",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
/* LA COLISTINE DE PSEUDOMONAS SOUS CA-SFM.

   CA-SFM 2026, page 61 : Colistine · S ≤ 2 · R > 2 · ZIT 4.

   PhénoBac ne portait que la ZIT. Les seuils manquant, c'est la valeur EUCAST
   (4/4) qui s'appliquait — et une CMI de colistine à 4 mg/L sur P. aeruginosa
   était rendue « SENSIBLE » alors que le comité français la tient pour
   résistante, et que 4 mg/L tombe dans sa propre zone d'incertitude. Une
   décision de dernier recours, prise sur un rendu qui contredisait le
   référentiel affiché.

   C'est le défaut propre à la façon dont PhénoBac porte le CA-SFM : elle n'en
   garde que le DELTA, et un écart qu'elle ignore ne se voit pas — le
   laboratoire croit travailler en CA-SFM et reçoit l'EUCAST, en silence.
   Trouvé par outils/comparer-casfm.py le 25 octobre 2026, vérifié dans le
   document, porté sur décision du biologiste. */
["casfm","pneumo","AMP","cmi","meninge",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","pneumo","AMX","cmi","meninge",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","pseudo","COL","cmi","standard",2,2,undefined,4,undefined,undefined,undefined,undefined,undefined],
["casfm","pseudo","FDC","disque","standard",undefined,undefined,undefined,undefined,undefined,27,undefined,undefined,undefined],
["casfm","pseudo","FOS","cmi","standard",128,128,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","pseudo","FOS","disque","standard",12,12,"200",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","pseudo","LVX","cmi","standard",null,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","AMC","cmi","urinaire",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","AMC","disque","urinaire",16,16,"20-10",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","AMX","disque","standard",19,19,"20",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","FOS","cmi","standard",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","FOS","disque","standard",21,21,"200",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","NIT","disque","urinaire",11,11,"100",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","SXT","disque","urinaire",14,14,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","TEM","cmi","urinaire",8,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","salmonella","TEM","disque","urinaire",20,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","CIP","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","CIP","disque","standard",null,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","KAN","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","KAN","disque","standard",22,22,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","OXA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,["ssaprophyticus","slugdunensis"]],
["casfm","scn","SXT","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","SXT","disque","standard",24,19,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","SXT","disque","urinaire",19,19,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","scn","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","AMC","cmi","urinaire",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","AMC","disque","urinaire",16,16,"20-10",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","AMX","disque","standard",19,19,"20",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","FOS","cmi","standard",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","FOS","disque","standard",21,21,"200",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","NIT","disque","urinaire",11,11,"100",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","SXT","disque","standard",15,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","SXT","disque","urinaire",14,14,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","TEM","cmi","urinaire",8,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","serratia","TEM","disque","urinaire",20,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","CIP","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","CIP","disque","standard",null,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","FOS","cmi","standard",32,32,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","KAN","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","KAN","disque","standard",18,18,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","NIT","disque","urinaire",13,13,"100",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","OXA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","PEN","cmi","standard",undefined,undefined,undefined,"<=0.125",undefined,undefined,undefined,undefined,undefined],
["casfm","staph","SXT","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","SXT","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","SXT","disque","standard",24,19,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","SXT","disque","urinaire",19,19,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","staph","VA","cmi","standard",1,1,undefined,2,undefined,undefined,undefined,undefined,undefined],
["casfm","steno","LVX","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","steno","MIN","disque","standard",null,21,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","strepacg","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","strepacg","NIT","disque","urinaire",15,15,"100",undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","strepacg","PEN","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["casfm","strepacg","PEN","disque","standard",undefined,undefined,undefined,undefined,undefined,23,undefined,undefined,undefined],
["eucast","acineto","AMK","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","AMK","disque","standard",19,19,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","CAZ","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","acineto","CIP","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","CIP","disque","standard",null,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","acineto","FEP","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","acineto","GEN","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","GEN","disque","standard",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","IPM","cmi","standard",2,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","IPM","disque","standard",24,21,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","LVX","disque","standard",23,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","MEM","cmi","meninge",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","MEM","disque","meninge",21,21,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","MEM","disque","standard",21,15,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","MIN","cmi","standard",null,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","acineto","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","SXT","disque","standard",16,16,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","TOB","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","TOB","cmi","urinaire",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","TOB","disque","standard",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","acineto","TOB","disque","urinaire",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","acineto","TZP","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","bfragilis","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","DA","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","bfragilis","IPM","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","MEM","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","MXF","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","bfragilis","PEN","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","bfragilis","TZP","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","AMK","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","CAZ","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","GEN","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","IPM","cmi","standard",2,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","LVX","cmi","standard",1,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","MIN","cmi","standard",null,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","SXT","cmi","standard",null,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","burk","TZP","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
/* L'AZITHROMYCINE ET LA DOXYCYCLINE DE CAMPYLOBACTER SE DÉDUISENT.
   Lignes retirées le 2026-11-02.

   EUCAST v16.1, feuille C.jejuni_C.coli : Azithromycin et Doxycycline
   portent « Note » dans les quatre colonnes. Les notes disent de quoi :

     « Susceptibility to azithromycin and clarithromycin can be inferred
       from erythromycin. »
     « Susceptibility to doxycycline can be inferred from tetracycline. »

   PhénoBac appliquait azithromycine 0,5/0,5 et doxycycline 4/8, deux
   chiffres sans source dans le document, marqués « convention de
   laboratoire ». L'érythromycine (4/4 pour C. jejuni) et la tétracycline
   (2/2), elles, sont bien chiffrées : ce sont elles qui portent la réponse.

   La reprise est dans le moteur, table CAT_DEDUITE — une déduction n'est pas
   un seuil.  */
["eucast","campylo","CIP","cmi","standard",null,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","campylo","CIP","disque","standard",null,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","campylo","E","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","campylo","E","disque","standard",20,20,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","campylo","SXT","cmi","standard",2,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","AMC","cmi","standard",4,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","DA","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","IPM","cmi","standard",2,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","MTZ","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdifficile","PEN","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","TZP","cmi","standard",8,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","cdifficile","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","coryne","AMX","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","coryne","CIP","disque","standard",null,25,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","CTX","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","coryne","DA","disque","standard",20,20,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","E","cmi","standard",1,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","coryne","GEN","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","coryne","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","LZD","disque","standard",25,25,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","MEM","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","coryne","MXF","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","MXF","disque","standard",25,25,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","PEN","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","PEN","disque","standard",null,12,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","RD","disque","standard",30,30,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","SXT","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","coryne","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","coryne","VA","disque","standard",17,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","AMC","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","AMC","disque","standard",23,23,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","AMP","disque","standard",23,23,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","DA","disque","standard",19,19,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","ETP","disque","standard",24,24,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","IPM","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","IPM","disque","standard",25,25,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","MEM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","MEM","disque","standard",25,25,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","MTZ","disque","standard",16,16,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","MXF","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","cperfringens","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","PEN","disque","standard",15,15,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","TZP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","TZP","disque","standard",24,24,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],

// Anaérobies à Gram négatif ajoutés le 24 octobre 2026, lus dans le classeur
// EUCAST v16.1 par outils/extraire-anaerobies.py — jamais recopiés à la main :
// quatre seuils de Bacteroides fragilis s'étaient révélés faux le matin même,
// plus permissifs que le document, depuis on ne sait quand.
//
// DEUX GROUPES POUR FUSOBACTERIUM, et c'est le document qui l'impose : il
// chiffre l'amoxicilline-acide clavulanique et la pipéracilline-tazobactam
// pour F. necrophorum, et les renvoie à une note pour F. nucleatum. Un seul
// groupe appliquerait les seuils de l'un à l'autre.
//
// Plusieurs couples n'ont qu'un seuil AU DISQUE : l'EUCAST y renvoie à une
// note pour la CMI. C'est fidèle — la lecture au disque conclut, la CMI non.
["eucast","entero","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","TOB","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","TOB","disque","standard",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","TOB","disque","urinaire",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","TOB","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","TOB","disque","standard",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","TOB","disque","urinaire",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","PEN","disque","standard",20,20,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","AMP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","AMP","disque","standard",25,25,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","AMX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","AMC","disque","standard",24,24,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","TZP","disque","standard",26,26,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","ETP","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","IPM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","IPM","disque","standard",35,35,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","MEM","disque","standard",34,34,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","DA","disque","standard",31,31,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","prevotella","MTZ","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","PEN","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","PEN","disque","standard",25,25,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","AMP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","AMP","disque","standard",27,27,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","AMX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
// Les deux lignes qui suivent sont propres à F. necrophorum : le document renvoie
// F. nucleatum à une note pour ces deux molécules.
["eucast","fnecrophorum","AMC","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","AMC","disque","standard",23,23,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","TZP","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","TZP","disque","standard",35,35,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","ETP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","ETP","disque","standard",35,35,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","IPM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","IPM","disque","standard",36,36,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","MEM","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","MEM","disque","standard",35,35,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","DA","disque","standard",30,30,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","MTZ","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnecrophorum","MTZ","disque","standard",30,30,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","PEN","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","PEN","disque","standard",25,25,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","AMP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","AMP","disque","standard",27,27,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","AMX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","ETP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","ETP","disque","standard",35,35,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","IPM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","IPM","disque","standard",36,36,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","MEM","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","MEM","disque","standard",35,35,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","DA","disque","standard",30,30,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","MTZ","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","fnucleatum","MTZ","disque","standard",30,30,"5",undefined,undefined,undefined,undefined,undefined,undefined],

/* LES DIAMÈTRES DE BACTEROIDES MANQUAIENT TOUS. L'EUCAST v16.1 chiffre sept
   diamètres pour le groupe — amoxicilline-clavulanate, pipéracilline-
   tazobactam, ertapénème, imipénème, méropénème, clindamycine,
   métronidazole — et la base n'en portait aucun : seules les CMI y étaient.
   Un laboratoire qui travaille au disque, c'est-à-dire presque tous ceux
   auxquels PhénoBac s'adresse, ne pouvait rien rendre sur l'anaérobie le
   plus fréquent des suppurations abdominales. Rien ne le signalait :
   outils/comparer-eucast.py ne lit que les CMI, et seulement dans le sens
   base -> document. C'est outils/verifier-couverture-eucast.py qui l'a vu.
   L'ertapénème, lui, manquait des deux côtés — et il vient entre
   parenthèses, d'où le drapeau « ecoff ». */
["eucast","bfragilis","AMC","disque","standard",14,14,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","DA","disque","standard",10,10,"2",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","bfragilis","ETP","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","bfragilis","ETP","disque","standard",23,23,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","bfragilis","IPM","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","MEM","disque","standard",28,28,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","MTZ","disque","standard",25,25,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","bfragilis","TZP","disque","standard",24,24,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],

/* Trois CMI manquaient aussi à Clostridium perfringens : l'ampicilline,
   l'amoxicilline et l'ertapénème, toutes trois chiffrées par le document. */
["eucast","cperfringens","AMP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","AMX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cperfringens","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],

/* L'amoxicilline n'a pas de disque chez les anaérobies : l'EUCAST la fait
   lire sur celui de l'ampicilline — « Susceptibility can be inferred from
   ampicillin ». Cette note vit dans la COLONNE I du classeur, que PhénoBac
   n'avait jamais lue : la CMI était portée, le disque restait sans catégorie,
   et un laboratoire qui travaille au disque — c'est-à-dire presque tous ceux
   auxquels PhénoBac s'adresse — perdait la molécule. */
["eucast","prevotella","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","fnecrophorum","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","fnucleatum","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)

/* Anaérobies à Gram positif — feuille « Anaerobic bacteria_G-positive » du
   classeur v16.1, extraite par outils/extraire-especes.py, jamais recopiée.
   Les seuils entre parenthèses (clindamycine de C. innocuum, de Parvimonas,
   de Peptostreptococcus et de Peptoniphilus) portent la colonne « ecoff » :
   ils séparent le sauvage de l'acquis et ne promettent rien en clinique. */
["eucast","cinnocuum","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","AMP","disque","standard",21,21,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","AMX","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","AMC","disque","standard",19,19,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","TZP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","TZP","disque","standard",24,24,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","DA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","cinnocuum","DA","disque","standard",17,17,"2",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","cinnocuum","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","MTZ","disque","standard",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cinnocuum","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","cramosum","PEN","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","PEN","disque","standard",21,21,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","AMP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","AMP","disque","standard",20,20,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","AMX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","AMC","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","AMC","disque","standard",21,21,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","TZP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","TZP","disque","standard",28,28,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","IPM","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","IPM","disque","standard",26,26,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","MEM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","MEM","disque","standard",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","MTZ","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cramosum","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","csepticum","PEN","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","PEN","disque","standard",21,21,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","AMP","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","AMP","disque","standard",25,25,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","AMX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","AMC","disque","standard",25,25,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","TZP","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","TZP","disque","standard",23,23,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","ETP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","ETP","disque","standard",26,26,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","IPM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","IPM","disque","standard",31,31,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","MEM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","MEM","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","VA","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","VA","disque","standard",14,14,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","DA","disque","standard",24,24,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","MTZ","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","csepticum","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","ctertium","AMP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","AMP","disque","standard",12,12,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","AMX","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","AMC","disque","standard",15,15,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","IPM","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","IPM","disque","standard",28,28,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","MEM","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","MEM","disque","standard",24,24,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","VA","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","VA","disque","standard",13,13,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","MTZ","disque","standard",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ctertium","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","cacnes","PEN","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","PEN","disque","standard",24,24,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","AMP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","AMP","disque","standard",23,23,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","AMX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","AMC","disque","standard",24,24,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","TZP","disque","standard",27,27,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","CTX","disque","standard",26,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","CRO","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","CRO","disque","standard",33,33,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","ETP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","ETP","disque","standard",28,28,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","IPM","disque","standard",39,39,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","MEM","disque","standard",28,28,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","VA","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","DA","disque","standard",26,26,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","LZD","disque","standard",34,34,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cacnes","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","cavidum","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","PEN","disque","standard",23,23,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","AMP","disque","standard",23,23,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","AMX","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","AMC","disque","standard",23,23,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","TZP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","TZP","disque","standard",28,28,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","CTX","disque","standard",24,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","CRO","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","CRO","disque","standard",30,30,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","ETP","disque","standard",28,28,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","IPM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","IPM","disque","standard",39,39,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","MEM","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","MEM","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","VA","disque","standard",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","DA","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","DA","disque","standard",33,33,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","LZD","disque","standard",28,28,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cavidum","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","finegoldia","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","PEN","disque","standard",20,20,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","AMP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","AMP","disque","standard",21,21,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","AMX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","AMC","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","AMC","disque","standard",21,21,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","TZP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","TZP","disque","standard",30,30,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","ETP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","ETP","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","IPM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","IPM","disque","standard",34,34,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","MEM","disque","standard",31,31,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","VA","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","VA","disque","standard",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","DA","disque","standard",23,23,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","MTZ","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","MTZ","disque","standard",25,25,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","finegoldia","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","parvimonas","PEN","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","PEN","disque","standard",31,31,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","AMP","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","AMP","disque","standard",29,29,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","AMX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","AMC","disque","standard",28,28,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","TZP","disque","standard",33,33,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","ETP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","ETP","disque","standard",33,33,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","IPM","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","IPM","disque","standard",40,40,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","MEM","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","MEM","disque","standard",36,36,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","VA","disque","standard",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","DA","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","parvimonas","DA","disque","standard",18,18,"2",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","parvimonas","MTZ","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","MTZ","disque","standard",28,28,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","parvimonas","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","peptostrepto","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","PEN","disque","standard",20,20,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","AMP","disque","standard",25,25,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","AMX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","AMC","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","AMC","disque","standard",22,22,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","TZP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","TZP","disque","standard",32,32,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","ETP","disque","standard",27,27,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","IPM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","IPM","disque","standard",36,36,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","MEM","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","MEM","disque","standard",30,30,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","VA","disque","standard",15,15,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","DA","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","peptostrepto","DA","disque","standard",17,17,"2",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","peptostrepto","MTZ","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","MTZ","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptostrepto","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","peptoniphilus","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","PEN","disque","standard",18,18,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","AMP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","AMP","disque","standard",21,21,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","AMX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","AMC","disque","standard",23,23,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","TZP","disque","standard",36,36,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","ETP","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","ETP","disque","standard",32,32,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","IPM","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","IPM","disque","standard",37,37,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","MEM","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","MEM","disque","standard",35,35,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","VA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","VA","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","DA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","peptoniphilus","DA","disque","standard",15,15,"2",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","peptoniphilus","MTZ","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","MTZ","disque","standard",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","peptoniphilus","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],

/* ===== COUVERTURE ÉLARGIE — 133 règles, 25 octobre 2026 =====

   Le balayage inverse de comparer-eucast.py a relevé 111 couples que le
   classeur v16.1 chiffre et que PhénoBac ne portait pas. Ce n'étaient pas des
   défauts : l'application offrait un panel choisi, celui d'un laboratoire de
   district. Le biologiste a décidé de les couvrir tous.

   Les lignes ont été PRODUITES par « comparer-eucast.py --proposer », qui
   réutilise la sélection de lignes du comparateur — indications, voies,
   restrictions d'espèce — et non recopiées. Chacune porte en commentaire
   l'intitulé du document dont elle vient, ce qui permet de la vérifier sans
   rouvrir le classeur.

   DEUX PIÈGES ÉVITÉS AU PASSAGE, parce que le proposeur les avait d'abord :
   la note 13 (« S ≤ 0,001 ») s'écrit « null » et non 0.001 — sans quoi une
   ciprofloxacine à 0,001 mg/L sur un staphylocoque serait rendue SENSIBLE,
   l'inverse exact de ce que la note veut dire ; et une ligne qui ne vaut que
   pour une partie du groupe porte la colonne « espece » — la nitrofurantoïne
   de S. saprophyticus ne concerne pas les autres SCN.                   ===== */

// --- acineto (1) ---
["eucast","acineto","LVX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin

// --- campylo (2) ---
["eucast","campylo","TET","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","campylo","TET","disque","standard",30,30,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- coryne (5) ---
["eucast","coryne","CIP","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ciprofloxacin
["eucast","coryne","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Clindamycin
["eucast","coryne","RD","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Rifampicin
["eucast","coryne","TET","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","coryne","TET","disque","standard",24,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- entero (3) ---
["eucast","entero","LVX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin
["eucast","entero","MXF","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Moxifloxacin, Enterobacterales except Morganella morganii, Proteus spp
["eucast","entero","MXF","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Moxifloxacin, Enterobacterales except Morganella morganii, Proteus spp

// --- enteroc (6) ---
["eucast","enteroc","AMX","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Amoxicillin iv
["eucast","enteroc","IPM","cmi","standard",null,4,undefined,undefined,undefined,undefined,undefined,undefined,["efaecalis"]],   // Imipenem, E. faecalis
["eucast","enteroc","LVX","cmi","urinaire",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin (uncomplicated UTI only)
["eucast","enteroc","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,["efaecalis"]],   // Nitrofurantoin (uncomplicated UTI only), E. faecalis
["eucast","enteroc","NIT","disque","urinaire",15,15,"100",undefined,undefined,undefined,undefined,undefined,["efaecalis"]],   // Nitrofurantoin (uncomplicated UTI only), E. faecalis
["eucast","enteroc","TZP","cmi","standard",null,16,undefined,undefined,undefined,undefined,undefined,undefined,["efaecalis"]],   // Piperacillin-tazobactam, E. faecalis

// --- haemo (16) ---
["eucast","haemo","CFM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefixime
["eucast","haemo","CFM","disque","standard",26,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Cefixime
["eucast","haemo","CRO","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","haemo","CRO","disque","standard",32,32,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","haemo","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","haemo","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ertapenem
["eucast","haemo","FEP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefepime
["eucast","haemo","IPM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Imipenem
["eucast","haemo","LVX","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin
["eucast","haemo","MEM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem (indications other than meningitis)
["eucast","haemo","MIN","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Minocycline
["eucast","haemo","OFX","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ofloxacin
["eucast","haemo","OFX","disque","standard",30,30,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Ofloxacin
["eucast","haemo","TET","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","haemo","TET","disque","standard",25,25,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","haemo","TZP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Piperacillin-tazobactam

// --- moraxella (16) ---
["eucast","moraxella","CFM","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefixime
["eucast","moraxella","CFM","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Cefixime
["eucast","moraxella","CRO","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","moraxella","CRO","disque","standard",24,21,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","moraxella","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","moraxella","E","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Erythromycin
["eucast","moraxella","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ertapenem
["eucast","moraxella","FEP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefepime
["eucast","moraxella","IPM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Imipenem
["eucast","moraxella","LVX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin
["eucast","moraxella","MEM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem
["eucast","moraxella","MIN","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Minocycline
["eucast","moraxella","OFX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ofloxacin
["eucast","moraxella","OFX","disque","standard",28,28,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Ofloxacin
["eucast","moraxella","TET","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","moraxella","TET","disque","standard",26,26,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- morganella (1) ---
["eucast","morganella","LVX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin

// --- ngono (4) ---
["eucast","ngono","CFM","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefixime
["eucast","ngono","CRO","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","ngono","OFX","cmi","standard",0.125,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ofloxacin
["eucast","ngono","TET","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- nmening (2) ---
["eucast","nmening","CRO","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone (all indications including prophylaxis)
["eucast","nmening","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem (all indications)

/* ET LEURS SEUILS MÉNINGÉS, SANS QUOI L'AJOUT AURAIT ÉTÉ DANGEREUX.

   Porter l'ampicilline, la ceftriaxone et le méropénème au panel du
   pneumocoque sans leurs valeurs de méningite, c'était laisser le seuil
   ORDINAIRE s'appliquer à un liquide céphalo-rachidien — et il est bien plus
   permissif :

     ceftriaxone   ordinaire S ≤ 0,5 · R > 2      méningé S ≤ 0,5 · R > 0,5
     méropénème    ordinaire S ≤ 2   · R > 2      méningé S ≤ 0,25 · R > 0,25
     ampicilline   ordinaire S ≤ 0,5 · R > 1      méningé S ≤ 0,06 · R > 0,06

   Vérifié avant correction : une CMI de ceftriaxone à 1 mg/L sur un LCR à
   pneumocoque était rendue « I » au lieu de « R », et un méropénème à
   1 mg/L « S » au lieu de « R ». C'est exactement le danger que le mode
   « --meninge » de outils/comparer-eucast.py a été écrit pour attraper, et il
   l'a attrapé le jour même — parce que les molécules venaient d'arriver au
   panel. L'élargissement de couverture et ses seuils méningés se portent donc
   ENSEMBLE, jamais l'un sans l'autre. */
["eucast","pneumo","AMP","cmi","meninge",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ampicillin iv (endocarditis and meningitis)
["eucast","pneumo","CRO","cmi","meninge",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone (endocarditis and meningitis)
["eucast","pneumo","MEM","cmi","meninge",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem (meningitis)

// --- pneumo (14) ---
["eucast","pneumo","AMC","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Amoxicillin-clavulanic acid oral
["eucast","pneumo","AMP","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ampicillin iv (indications other than endocarditis and meningitis)
["eucast","pneumo","AZM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Azithromycin
["eucast","pneumo","CRO","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone (indications other than endocarditis and meningitis)
["eucast","pneumo","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","pneumo","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ertapenem
["eucast","pneumo","FEP","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefepime
["eucast","pneumo","IPM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Imipenem
["eucast","pneumo","MEM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem (indications other than meningitis)
["eucast","pneumo","MIN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Minocycline
["eucast","pneumo","RD","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Rifampicin
["eucast","pneumo","TEC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Teicoplanin
["eucast","pneumo","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","pneumo","TET","disque","standard",25,25,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- pseudo (3) ---
["eucast","pseudo","ATM","cmi","standard",null,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Aztreonam
["eucast","pseudo","ATM","disque","standard",null,18,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Aztreonam
["eucast","pseudo","LVX","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin

// --- salmonella (4) ---
["eucast","pseudo","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","pseudo","TOB","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","TOB","disque","standard",18,18,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","pseudo","TOB","disque","urinaire",18,18,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefiderocol
["eucast","salmonella","LVX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin
["eucast","salmonella","MXF","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Moxifloxacin, Enterobacterales except Morganella morganii, Proteus spp
["eucast","salmonella","MXF","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Moxifloxacin, Enterobacterales except Morganella morganii, Proteus spp

// --- scn (11) ---
["eucast","salmonella","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","TOB","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","TOB","disque","standard",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","TOB","disque","urinaire",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","AMK","cmi","standard",16,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],   // Amikacin, Coagulase-negative staphylococci  ⟨valeur entre parenthèses⟩
["eucast","scn","AZM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Azithromycin
["eucast","scn","CIP","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],   // Ciprofloxacin, Coagulase-negative staphylococci  ⟨valeur entre parenth
["eucast","scn","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","scn","LVX","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin, Coagulase-negative staphylococci
["eucast","scn","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,["ssaprophyticus"]],   // Nitrofurantoin (uncomplicated UTI only), S. saprophyticus
["eucast","scn","NIT","disque","urinaire",13,13,"100",undefined,undefined,undefined,undefined,undefined,["ssaprophyticus"]],   // Nitrofurantoin (uncomplicated UTI only), S. saprophyticus
["eucast","scn","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","scn","TET","disque","standard",22,22,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","scn","TMP","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Trimethoprim (uncomplicated UTI only)
["eucast","scn","TMP","disque","urinaire",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Trimethoprim (uncomplicated UTI only)

// --- serratia (1) ---
["eucast","scn","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],   // Tobramycin, Coagulase-negative staphylococci  ⟨valeur entre parenthèses⟩
["eucast","scn","TOB","disque","standard",20,20,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","LVX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin

// --- staph (9) ---
["eucast","serratia","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","TOB","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","TOB","disque","standard",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","TOB","disque","urinaire",16,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","AMK","cmi","standard",16,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],   // Amikacin, S. aureus  ⟨valeur entre parenthèses⟩
["eucast","staph","AZM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Azithromycin
["eucast","staph","CIP","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],   // Ciprofloxacin, S. aureus  ⟨valeur entre parenthèses⟩
["eucast","staph","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","staph","LVX","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin, S. aureus
["eucast","staph","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","staph","TET","disque","standard",22,22,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","staph","TMP","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Trimethoprim (uncomplicated UTI only)
["eucast","staph","TMP","disque","urinaire",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],   // Trimethoprim (uncomplicated UTI only)

// --- strepacg (10) ---
["eucast","staph","TOB","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],   // Tobramycin, S. aureus  ⟨valeur entre parenthèses⟩
["eucast","staph","TOB","disque","standard",18,18,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","strepacg","AZM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Azithromycin
["eucast","strepacg","DAP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Daptomycin
["eucast","strepacg","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","strepacg","MIN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Minocycline
["eucast","strepacg","MXF","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Moxifloxacin
["eucast","strepacg","RD","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Rifampicin
["eucast","strepacg","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Trimethoprim-sulfamethoxazole
["eucast","strepacg","TEC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Teicoplanin
["eucast","strepacg","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","strepacg","TET","disque","standard",23,23,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- strepb (12) ---
["eucast","strepb","AZM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Azithromycin
["eucast","strepb","DAP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Daptomycin
["eucast","strepb","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Doxycycline
["eucast","strepb","MIN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Minocycline
["eucast","strepb","MXF","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Moxifloxacin
["eucast","strepb","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Nitrofurantoin (uncomplicated UTI only), S. agalactiae (group B strept
["eucast","strepb","NIT","disque","urinaire",15,15,"100",undefined,undefined,undefined,undefined,undefined,undefined],   // Nitrofurantoin (uncomplicated UTI only), S. agalactiae (group B strept
["eucast","strepb","RD","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Rifampicin
["eucast","strepb","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Trimethoprim-sulfamethoxazole
["eucast","strepb","TEC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Teicoplanin
["eucast","strepb","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline
["eucast","strepb","TET","disque","standard",23,23,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Tetracycline

// --- vibrio (5) ---
["eucast","vibrio","CAZ","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftazidime
["eucast","vibrio","CTX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefotaxime
["eucast","vibrio","LVX","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Levofloxacin
["eucast","vibrio","MEM","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem
["eucast","vibrio","TZP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Piperacillin-tazobactam

// --- viridans (8) ---
["eucast","viridans","AMP","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ampicillin (indications other than endocarditis)
["eucast","viridans","CRO","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","viridans","CRO","disque","standard",27,27,"30",undefined,undefined,undefined,undefined,undefined,undefined],   // Ceftriaxone
["eucast","viridans","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Ertapenem
["eucast","viridans","FEP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Cefepime
["eucast","viridans","IPM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Imipenem
["eucast","viridans","MEM","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Meropenem
["eucast","viridans","TEC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // Teicoplanin


/* ============ Espèces aérobies ajoutées le 25 octobre 2026 ============
   Lues par outils/extraire-especes.py dans le classeur v16.1, jamais
   recopiées, et confrontées dans les deux sens par
   outils/verifier-couverture-eucast.py. ============================== */

/* Pasteurella spp. — feuille « Pasteurella ».
   Morsure de chien ou de chat : c'est là qu'on l'isole. L'acide nalidixique
   et la tétracycline y servent d'ÉCRAN — le document les marque « screen
   only » et n'en tire pas de catégorie clinique ; la tétracycline porte donc
   la colonne « dep », pas un couple S/R. L'ampicilline et l'amoxicilline se
   lisent sur le disque de pénicilline G. */
["eucast","pasteurella","PEN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","PEN","disque","standard",17,17,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","AMX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","AMC","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","AMC","disque","standard",15,15,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","CTX","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","CTX","disque","standard",26,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","CIP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","CIP","disque","standard",27,27,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","LVX","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","LVX","disque","standard",27,27,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","DOX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","TET","disque","standard",undefined,undefined,"30",undefined,undefined,24,undefined,undefined,undefined],
["eucast","pasteurella","SXT","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","SXT","disque","standard",23,23,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pasteurella","AMP","disque","standard",undefined,undefined,undefined,undefined,"PEN",undefined,undefined,undefined,undefined],   // se lit sur le disque de PEN (note du classeur)
["eucast","pasteurella","AMX","disque","standard",undefined,undefined,undefined,undefined,"PEN",undefined,undefined,undefined,undefined],   // se lit sur le disque de PEN (note du classeur)

/* Aeromonas spp. — feuille « Aeromonas ».
   Eaux douces et saumâtres, plaies souillées, diarrhées. Seule famille de
   ces sept où l'EUCAST laisse une vraie zone « I » : S ≤ 1 et R > 4 sur les
   céphalosporines et l'aztréonam. */
["eucast","aeromonas","FEP","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","FEP","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","CAZ","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","CAZ","disque","standard",24,21,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","ATM","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","ATM","disque","standard",29,26,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","CIP","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","CIP","disque","standard",27,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","LVX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","LVX","disque","standard",27,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","SXT","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aeromonas","SXT","disque","standard",16,16,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],

/* Achromobacter xylosoxidans — feuille « A.xylosoxidans ».
   Bacille non fermentant des mucoviscidoses et des infections sur matériel.
   Quatre molécules seulement sont chiffrées, et c'est la réponse : le reste
   n'a pas de seuil. */
["eucast","achromobacter","TZP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","achromobacter","TZP","disque","standard",26,26,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","achromobacter","MEM","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","achromobacter","MEM","disque","standard",26,20,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","achromobacter","SXT","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","achromobacter","SXT","disque","standard",26,26,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],

/* Kingella kingae — feuille « K.kingae ».
   Arthrites et spondylodiscites du petit enfant (groupe HACEK). La
   β-lactamase, quand elle existe, suffit à rendre résistantes les
   pénicillines sans inhibiteur. L'ampicilline et l'amoxicilline se lisent sur
   le disque de pénicilline G, l'azithromycine sur celui d'érythromycine, la
   doxycycline sur celui de tétracycline. */
["eucast","kingella","PEN","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","PEN","disque","standard",25,25,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","AMP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","AMX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","AMC","disque","standard",22,22,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","CTX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","CTX","disque","standard",27,27,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","CRO","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","CRO","disque","standard",30,30,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","MEM","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","MEM","disque","standard",30,30,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","CIP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","CIP","disque","standard",28,28,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","LVX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","LVX","disque","standard",28,28,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","AZM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","E","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","E","disque","standard",20,20,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","DOX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","TET","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","TET","disque","standard",28,28,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","RD","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","RD","disque","standard",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","SXT","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","SXT","disque","standard",28,28,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","kingella","AMP","disque","standard",undefined,undefined,undefined,undefined,"PEN",undefined,undefined,undefined,undefined],   // se lit sur le disque de PEN (note du classeur)
["eucast","kingella","AMX","disque","standard",undefined,undefined,undefined,undefined,"PEN",undefined,undefined,undefined,undefined],   // se lit sur le disque de PEN (note du classeur)
["eucast","kingella","AZM","disque","standard",undefined,undefined,undefined,undefined,"E",undefined,undefined,undefined,undefined],   // se lit sur le disque de E (note du classeur)
["eucast","kingella","DOX","disque","standard",undefined,undefined,undefined,undefined,"TET",undefined,undefined,undefined,undefined],   // se lit sur le disque de TET (note du classeur)

/* Aerococcus urinae et A. sanguinicola — feuille « A.sanguinicola_A.urinae ».
   Infections urinaires de l'homme âgé, parfois endocardite. Plusieurs seuils
   sont propres à la CYSTITE SIMPLE et portent le site « urinaire » :
   ciprofloxacine, lévofloxacine, nitrofurantoïne. Les appliquer à une
   bactériémie serait rendre sensible ce qui ne l'est pas. */
["eucast","aerococcus","PEN","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","PEN","disque","standard",21,21,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","AMP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","AMP","disque","standard",26,26,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","MEM","disque","standard",31,31,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","CIP","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","CIP","disque","urinaire",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","LVX","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","VA","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","VA","disque","standard",16,16,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","NIT","cmi","urinaire",16,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","NIT","disque","urinaire",16,16,"100",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","RD","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","RD","disque","standard",25,25,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","aerococcus","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],   // se lit sur le disque de AMP (note du classeur)
["eucast","aerococcus","LVX","disque","urinaire",undefined,undefined,undefined,undefined,"CIP",undefined,undefined,undefined,undefined],   // se lit sur le disque de CIP (note du classeur)

/* Corynebacterium diphtheriae — feuille « C.diphtheriae_C.ulcerans ».
   « S ≤ 0,001 » et « S ≥ 50 mm » ne sont pas des seuils : c'est la note 13
   du classeur, un seuil hors échelle qui veut dire NE JAMAIS RENDRE S. La
   base l'écrit S = null — pénicilline G, céfotaxime et ciprofloxacine ne se
   rendent qu'en I ou en R. */
["eucast","cdiphtheriae","PEN","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","PEN","disque","standard",null,12,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","AMX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","CTX","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","CTX","disque","standard",null,15,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","MEM","disque","standard",24,24,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","CIP","cmi","standard",null,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","CIP","disque","standard",null,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","E","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","E","disque","standard",24,24,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],   // propre à C. diphtheriae
["eucast","cdiphtheriae","DA","disque","standard",15,15,"2",undefined,undefined,undefined,undefined,undefined,undefined],   // propre à C. diphtheriae
["eucast","cdiphtheriae","DOX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","TET","disque","standard",24,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","LZD","disque","standard",25,25,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","RD","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","RD","disque","standard",24,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","SXT","disque","standard",23,23,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","cdiphtheriae","DOX","disque","standard",undefined,undefined,undefined,undefined,"TET",undefined,undefined,undefined,undefined],   // se lit sur le disque de TET (note du classeur)

/* Corynebacterium ulcerans — même feuille, groupe SÉPARÉ.
   Deux groupes, et c'est le document qui l'impose : il chiffre la
   clindamycine pour C. diphtheriae seulement — « Wild-type C. ulcerans is
   less susceptible to clindamycin ». Un seul groupe appliquerait le seuil de
   l'une à l'autre. */
["eucast","culcerans","PEN","cmi","standard",null,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","PEN","disque","standard",null,12,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","AMX","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","CTX","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","CTX","disque","standard",null,15,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","MEM","disque","standard",24,24,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","CIP","cmi","standard",null,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","CIP","disque","standard",null,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","E","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","E","disque","standard",24,24,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","DOX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","TET","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","TET","disque","standard",24,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","LZD","disque","standard",25,25,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","RD","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","RD","disque","standard",24,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","SXT","disque","standard",23,23,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","culcerans","DOX","disque","standard",undefined,undefined,undefined,undefined,"TET",undefined,undefined,undefined,undefined],   // se lit sur le disque de TET (note du classeur)
   // se lit sur le disque de AMP (note du classeur)
["eucast","cperfringens","VA","disque","standard",12,12,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","AMC","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","AMC","disque","standard",19,19,"20-10",[19,20],undefined,undefined,undefined,undefined,undefined],
["eucast","entero","AMK","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","AMK","disque","standard",18,18,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","AMP","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","AMP","disque","standard",14,14,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","AMX","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],
["eucast","entero","AZM","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","entero","CAZ","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CAZ","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CIP","cmi","meninge",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CIP","cmi","standard",0.25,0.5,undefined,0.5,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CIP","disque","standard",25,22,"5",[22,24],undefined,undefined,undefined,undefined,undefined],
["eucast","entero","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","CTX","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CTX","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CTX","disque","meninge",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CTX","disque","standard",20,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","ETP","disque","standard",23,23,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","FDC","disque","standard",23,23,"30",[21,23],undefined,undefined,undefined,undefined,undefined],
["eucast","entero","FEP","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","FEP","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
/* LA FOSFOMYCINE, À LA LETTRE DU DOCUMENT.

   L'EUCAST v16.1 chiffre la fosfomycine pour E. COLI SEULEMENT et pour les
   indications URINAIRES seulement :

     Fosfomycin iv (infections originating from the urinary tract), E. coli
                                              CMI 8/8 · disque 200 µg · 24/24
     Fosfomycin oral (uncomplicated UTI only), E. coli
                                              CMI 8/8 · disque 200 µg · 24/24
     Fosfomycin iv (other indications), E. coli                        Note
     Fosfomycin iv, OTHER ENTEROBACTERALES                             Note

   PhénoBac portait « entero / FOS / cmi / standard 8-8 » : sans restriction
   d'espèce, sans restriction d'indication, et SANS DIAMÈTRE. Elle rendait donc
   « fosfomycine S » pour Klebsiella, Enterobacter et Citrobacter sur un seuil
   que le document ne leur donne pas, et répondait « l'EUCAST ne reconnaît pas
   la méthode au disque » à qui mesurait 26 mm sur un disque de 200 µg — ce
   qui est faux, et c'est le test le moins cher qui existe pour une cystite.

   UNE LIMITE ASSUMÉE. PhénoBac n'a qu'un site urinaire, et la question posée
   à l'utilisateur dit « cystite simple ». La ligne intraveineuse du document
   vise plus large — « infections d'origine urinaire », pyélonéphrite
   comprise. Rattacher la fosfomycine à ce site unique est donc un peu PLUS
   ÉTROIT que le document : sur une pyélonéphrite, la molécule restera sans
   catégorie tant que la question n'est pas cochée. C'est le sens prudent de
   l'écart, et l'usage courant — fosfomycine orale, cystite simple — est
   couvert. L'élargir demanderait un second site urinaire, que rien d'autre
   ne réclame aujourd'hui.

   Trouvé le 25 octobre 2026 par le balayage inverse de comparer-eucast.py,
   et porté sur décision du biologiste.

   ET LES TROIS GROUPES FRÈRES, OUBLIÉS CE JOUR-LÀ, CORRIGÉS LE 31 OCTOBRE.

   PhénoBac porte QUATRE groupes de seuils pour cette unique table de
   l'EUCAST — entero, morganella, salmonella, serratia — parce que le
   document sépare les genres sur d'autres molécules. La correction du 25
   octobre n'avait touché que le premier. Les trois autres gardaient

     ["eucast","morganella","FOS","cmi","standard",8,8,…]
     ["eucast","salmonella","FOS","cmi","standard",8,8,…]
     ["eucast","serratia","FOS","cmi","standard",8,8,…]

   et rendaient donc « R » à 16 mg/L hors urine pour Proteus mirabilis,
   P. vulgaris, Morganella morganii, Providencia, Salmonella et Serratia —
   là où E. coli et Klebsiella, pour la même molécule, la même famille, le
   même site et le même document, ne recevaient AUCUNE catégorie. Six jours
   durant, l'application s'est contredite d'un genre à l'autre.

   Les trois lignes sont retirées. E. coli vit dans « entero » : la ligne
   urinaire restreinte qui s'y trouve le couvre, et les autres genres n'ont
   plus rien — ce que le document dit. Leur donner la restriction ["ecoli"]
   aurait fabriqué des lignes mortes : aucune Salmonella n'est un E. coli.

   outils/verifier-fratries.py surveille désormais cette classe de défaut
   SANS AUCUN DOCUMENT : il compare la base à elle-même et signale un couple
   dont la PORTÉE — site, restriction d'espèce — diffère d'un groupe frère à
   l'autre. Les valeurs ont le droit de différer, c'est l'objet du découpage ;
   une portée est une décision, et une décision prise pour un genre se prend
   rarement pour lui seul. */
["eucast","entero","FOS","cmi","urinaire",8,8,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli"]],
["eucast","entero","FOS","disque","urinaire",24,24,"200",undefined,undefined,undefined,undefined,undefined,["ecoli"]],
["eucast","entero","FOX","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,["ecoli"],undefined],
["eucast","entero","GEN","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","GEN","disque","standard",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","entero","IPM","cmi","standard",2,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","IPM","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","LVX","disque","standard",23,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","MEM","cmi","meninge",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","MEM","disque","meninge",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","MEM","disque","standard",22,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","SXT","disque","standard",15,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","TEM","cmi","standard",null,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","TEM","disque","standard",null,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","TZP","cmi","standard",8,8,undefined,16,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","TZP","disque","standard",20,20,"30-6",[19,19],undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","AMP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","AMP","disque","standard",10,10,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","CIP","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","CIP","disque","standard",15,15,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","DAP","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","enteroc","HLG","cmi","standard",128,128,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","enteroc","IPM","disque","standard",null,21,"10",undefined,undefined,undefined,undefined,undefined,["efaecalis"]],
["eucast","enteroc","LVX","disque","standard",15,15,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","LZD","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","LZD","disque","standard",20,20,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","TEC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","enteroc","TEC","disque","standard",16,16,"30",undefined,undefined,undefined,undefined,undefined,undefined],
/* CES DEUX DIAMÈTRES ÉTAIENT RESTREINTS SANS LE DIRE. Tant que la clé de
   restriction ignorait la méthode, « espece » écrit sur la ligne de CMI
   gouvernait aussi le disque : l'imipénème et la pipéracilline-tazobactam
   de l'entérocoque étaient correctement limités à E. faecalis, mais par
   ricochet. Depuis que chaque méthode porte la sienne, le ricochet n'existe
   plus et il fallait l'écrire. Le classeur v16.1 nomme bien l'espèce sur la
   LIGNE ENTIÈRE — « Imipenem, E. faecalis » et « Piperacillin-tazobactam,
   E. faecalis » —, donc en CMI comme au disque. Le comportement ne change
   pas ; il est seulement, désormais, déclaré. */
["eucast","enteroc","TZP","disque","standard",null,18,"30-6",undefined,undefined,undefined,undefined,undefined,["efaecalis"]],
["eucast","enteroc","VA","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
/* LE DIAMÈTRE DE LA VANCOMYCINE EST CELUI DE DEUX ESPÈCES, PAS DU GENRE.
   Classeur EUCAST v16.1, feuille « Enterococcus » : TROIS lignes pour la
   vancomycine, et la CMI est la même dans deux d'entre elles — seul le
   diamètre sépare.

     l.81  Vancomycin, E. faecalis and E. faecium      CMI 4/4   disque 12/12
     l.82  Vancomycin, E. casseliflavus and            «  -  »   «   -   »
           E. gallinarum
     l.83  Vancomycin, other enterococci               CMI 4/4   disque 15/15

   PhénoBac ne couvre que E. faecalis et E. faecium : 12 mm est donc juste,
   et c'était le constat de l'arbitrage du 2026-10-25. Mais il était juste
   SANS ÊTRE DIT, et un chiffre qui ne dit pas de quelle espèce il sort ne
   peut pas être pris en défaut : le jour où le genre accueillerait une
   troisième espèce, elle hériterait du 12 mm, et personne ne le verrait. La
   restriction rend le silence impossible — un entérocoque hors des deux
   espèces n'aura AUCUN diamètre de vancomycine, ce qui est la bonne réponse
   plutôt qu'une mauvaise.

   La CMI, elle, reste SANS restriction : le document la donne à 4/4 pour les
   deux lignes. La restreindre retirerait une valeur que l'EUCAST accorde.
   « - » de la ligne 82 (VanC de E. casseliflavus et E. gallinarum) veut dire
   « ne jamais rendre sensible » ; PhénoBac ne porte pas ces deux espèces, et
   l'absence de diamètre est, pour elles aussi, le comportement juste. */
["eucast","enteroc","VA","disque","standard",12,12,"5",undefined,undefined,undefined,undefined,undefined,["efaecalis","efaecium"]],
/* L'AZITHROMYCINE DES BACTÉRIES EXIGEANTES : TROIS CHAPITRES, LE MÊME
   CHIFFRE INVENTÉ. Les trois lignes retirées le 2026-11-02.

   PhénoBac appliquait 0,25 / 0,5 à Haemophilus, au gonocoque ET au
   méningocoque, les trois marquées « convention de laboratoire ». Aucun des
   deux documents ne porte ces chiffres pour aucune des trois espèces.

   Ce que les documents disent, chapitre par chapitre :

   HAEMOPHILUS — EUCAST v16.1, feuille H.influenzae : les quatre macrolides
   portent « Note » dans les quatre colonnes, et la note 1/A dit pourquoi :

     « Clinical evidence for the efficacy of macrolides in H. influenzae
       respiratory infections is CONFLICTING due to high spontaneous cure
       rates. Should there be a need to test any macrolide against this
       species, THE EPIDEMIOLOGICAL CUT-OFFS (ECOFFs) SHOULD BE USED TO
       DETECT STRAINS WITH ACQUIRED RESISTANCE. The ECOFFs for each agent
       are: azithromycin 4 mg/L, clarithromycin 32 mg/L and erythromycin
       16 mg/L. »

     Le CA-SFM ne donne AUCUNE ligne de macrolide pour cette espèce : son
     bloc ne contient qu'une phrase — « La corrélation entre les CMI des
     macrolides et l'efficacité clinique est faible pour H. influenzae »
     (p107). Rien à contredire, donc.

   GONOCOQUE — les deux comités disent la même chose, et le même chiffre.
   EUCAST : « Azithromycin » Note / Note, et « For testing purposes with the
   aim of detecting acquired resistance mechanisms, the ECOFF is 1 mg/L. »
   CA-SFM p108, note 2 : « Pour l'azithromycine et la gentamicine, l'ECOFF
   permet de distinguer les souches sauvages (CMI ≤ 1 mg/L pour
   l'azithromycine […]) de celles ayant acquis un mécanisme de résistance. »

   MÉNINGOCOQUE — EUCAST écrit « – » : molécule inadaptée. Et le panel du
   méningocoque, dans PhénoBac, n'offre PAS l'azithromycine. La ligne ne
   pouvait donc rien catégoriser : elle est simplement retirée, comme
   l'ampicilline du gonocoque hier.

   Les deux premières passent dans EXCLUSION_ACQUISE, le mécanisme écrit la
   veille pour le linézolide des viridans : un ECOFF n'est pas un seuil
   clinique, et en dessous il ne permet pas de conclure « sensible ».  */
["eucast","haemo","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","AMC","disque","standard",15,15,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","AMP","disque","standard",18,18,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","AMX","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","CAF","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","CAF","disque","standard",28,28,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","CIP","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","CIP","disque","standard",32,32,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","CTX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","CTX","disque","standard",27,27,"5",[25,27],undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","ETP","disque","standard",23,23,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","FEP","disque","standard",28,28,"30",[28,33],undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","IPM","disque","standard",20,20,"10",[6,19],undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","LVX","disque","standard",30,30,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","MEM","disque","standard",20,20,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","MIN","disque","standard",24,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","MXF","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","MXF","disque","standard",28,28,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","PEN","cmi","standard",0.06,0.25,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","haemo","RD","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","RD","disque","standard",18,18,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","SXT","disque","standard",23,23,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","haemo","TZP","disque","standard",27,27,"30-6",[26,28],undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","AMP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","AMP","disque","standard",16,16,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","AMX","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","listeria","CTX","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","listeria","E","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","E","disque","standard",25,25,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","GEN","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","listeria","LZD","cmi","standard",2,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","listeria","MEM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","MEM","disque","standard",26,26,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","PEN","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","PEN","disque","standard",13,13,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","SXT","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","SXT","disque","standard",29,29,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","listeria","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
/* LES PÉNICILLINES DE MORAXELLA : AUCUN DES DEUX COMITÉS NE LES CHIFFRE.
   Les trois lignes retirées le 2026-11-01.

   EUCAST v16.1, feuille M.catarrhalis — pénicilline G, ampicilline et
   amoxicilline portent « – » dans les QUATRE colonnes (CMI et disque). Le
   classeur définit ce tiret ainsi : « the agent is unsuitable for treatment…
   testing and clinical use should be avoided. If included, report resistant
   without prior testing. » Et sa note : « Beta-lactamase producers should be
   reported resistant to penicillins and aminopenicillins without inhibitors. »

   CA-SFM 2026, p110, chapitre 5.20 — l'amoxicilline porte « Note » dans les
   quatre colonnes, et la note 1/A dit la conduite :

     « La très grande majorité (≈ 99 %) des souches de M. catarrhalis
       produisent une β-lactamase. […] Les souches productrices de
       β-lactamase doivent être catégorisées « résistantes » aux pénicillines
       (sans inhibiteurs de β-lactamase). Les souches non productrices de
       β-lactamase, SENSIBLES À L'AMOXICILLINE-ACIDE CLAVULANIQUE, doivent
       être catégorisées « sensibles » aux pénicillines. »

   PhénoBac appliquait pourtant amoxicilline 2/2, ampicilline 1/1 et
   pénicilline G 0,06/0,25, les trois marquées « convention de laboratoire ».
   Le drapeau disait vrai — l'EUCAST ne chiffre pas — et taisait que le
   document, lui, ne se tait pas : il prescrit une CONDUITE. Une souche de
   M. catarrhalis, dont 99 % produisent une β-lactamase, pouvait ainsi sortir
   « amoxicilline sensible » sur un chiffre sans source.

   La conduite des deux comités est portée dans le moteur
   (penicillinesMoraxella), où elle a sa place : ce n'est pas un seuil.
   L'amoxicilline-acide clavulanique, elle, GARDE ses chiffres — les deux
   comités la chiffrent, et identiquement (1/1, disque 2-1 µg, 19/19).  */
["eucast","moraxella","AMC","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","AMC","disque","standard",19,19,"2-1",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","AZM","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","CAF","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","moraxella","CIP","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","CIP","disque","standard",31,31,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","CTX","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","CTX","disque","standard",20,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","E","disque","standard",23,23,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","ETP","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","FEP","disque","standard",20,20,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","IPM","disque","standard",29,29,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","LVX","disque","standard",29,29,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","MEM","disque","standard",33,33,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","MIN","disque","standard",25,25,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","MXF","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","MXF","disque","standard",26,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","RD","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","moraxella","SXT","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","moraxella","SXT","disque","standard",15,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","AMC","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","AMC","disque","standard",19,19,"20-10",[19,20],undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","AMK","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","AMK","disque","standard",18,18,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","AMP","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","AMP","disque","standard",14,14,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","AMX","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],
["eucast","morganella","AZM","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","morganella","CAZ","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CAZ","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CIP","cmi","meninge",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CIP","cmi","standard",0.25,0.5,undefined,0.5,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CIP","disque","standard",25,22,"5",[22,24],undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","CTX","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CTX","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CTX","disque","meninge",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CTX","disque","standard",20,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","ETP","disque","standard",23,23,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","FDC","disque","standard",23,23,"30",[21,23],undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","FEP","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","FEP","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","FOX","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","morganella","GEN","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","GEN","disque","standard",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","morganella","IPM","cmi","standard",null,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","IPM","disque","standard",null,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","LVX","disque","standard",23,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","MEM","cmi","meninge",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","MEM","disque","meninge",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","MEM","disque","standard",22,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","SXT","disque","standard",15,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","TEM","cmi","standard",null,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","TEM","disque","standard",null,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","TZP","cmi","standard",8,8,undefined,16,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","TZP","disque","standard",20,20,"30-6",[19,19],undefined,undefined,undefined,undefined,undefined],
/* L'AMPICILLINE ET L'AMOXICILLINE DU GONOCOQUE : DEUX LIGNES MORTES, ET
   SANS SOURCE. Retirées le 2026-11-02.

   EUCAST v16.1, feuille N.gonorrhoeae : Ampicillin et Amoxicillin portent
   « Note / Note ». La note est un algorithme complet :

     « Always test for beta-lactamase (tests based on a chromogenic
       cephalosporin can be used). If beta-lactamase positive, report
       resistant to ampicillin and amoxicillin. If beta-lactamase negative,
       determine the MIC of benzylpenicillin. Infer the susceptibility to
       ampicillin and amoxicillin from the benzylpenicillin MIC (DO NOT
       REPORT BENZYLPENICILLIN SUSCEPTIBILITY). »

   PhénoBac appliquait ampicilline 1/1 et amoxicilline 2/2, sans source — et
   le panel du gonocoque n'offre NI l'une NI l'autre. Deux lignes qui ne
   pouvaient donc rien catégoriser, portant des chiffres que rien ne
   confrontait : le pire des deux mondes.

   La pénicilline G, elle, garde ses chiffres : le classeur écrit
   « Benzylpenicillin (SURROGATE AGENT) 0,06 / 1 », et ce sont exactement
   ceux de la base. Ce qui manquait est de DIRE qu'elle est un agent témoin
   et que le document défend de la rendre telle quelle — c'est porté dans le
   moteur.  */
["eucast","ngono","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","ngono","CAF","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","ngono","CIP","cmi","standard",0.03,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ngono","CTX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ngono","GEN","cmi","standard",undefined,undefined,undefined,undefined,undefined,undefined,undefined,true,undefined],
["eucast","ngono","PEN","cmi","standard",0.06,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","ngono","RD","cmi","standard",1,1,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","ngono","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","nmening","AMC","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","nmening","AMP","cmi","standard",0.125,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","nmening","AMX","cmi","standard",0.125,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","nmening","CAF","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","nmening","CIP","cmi","standard",0.016,0.016,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","nmening","CTX","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","nmening","PEN","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","nmening","RD","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","nmening","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","pneumo","AMP","disque","standard",22,19,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","AMX","cmi","meninge",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","AMX","cmi","standard",0.5,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","CTX","cmi","meninge",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","CTX","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","DA","disque","standard",19,19,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","E","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","E","disque","standard",22,22,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","LVX","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","LVX","disque","standard",null,16,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","LZD","disque","standard",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","MIN","disque","standard",24,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","MXF","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","MXF","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","PEN","cmi","meninge",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","PEN","cmi","standard",0.06,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","RD","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","SXT","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","SXT","disque","standard",15,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","TEC","disque","standard",17,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pneumo","VA","disque","standard",16,16,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","AMK","cmi","standard",16,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","pseudo","AMK","disque","standard",15,15,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","pseudo","CAZ","cmi","standard",null,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","CAZ","disque","standard",null,17,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","CIP","cmi","standard",null,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","CIP","disque","standard",null,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","COL","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","pseudo","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","FDC","disque","standard",22,22,"30",[20,21],undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","FEP","cmi","standard",null,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","FEP","disque","standard",null,21,"30",[19,23],undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","GEN","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","pseudo","IPM","cmi","standard",null,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","IPM","disque","standard",null,20,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","LVX","disque","standard",null,18,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","MEM","cmi","meninge",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
/* MÊME CAS, MÊME GESTE, chez Pseudomonas. Feuille « Pseudomonas » :

     l.49  Meropenem (hors méningite), P. aeruginosa         CMI 2/8  20/14
     l.50  Meropenem (hors méningite), Pseudomonas autres    CMI 2/8  24/18
           que P. aeruginosa
     l.51  Meropenem (méningite), P. aeruginosa              CMI 2/2  20/20

   Là encore la CMI est la même et seul le diamètre sépare ; là encore
   PhénoBac ne couvre que l'espèce nommée. Les deux lignes de disque portent
   donc leur espèce, et la CMI reste libre. */
["eucast","pseudo","MEM","disque","meninge",20,20,"10",undefined,undefined,undefined,undefined,undefined,["paeru"]],
["eucast","pseudo","MEM","disque","standard",20,14,"10",undefined,undefined,undefined,undefined,undefined,["paeru"]],
["eucast","pseudo","TZP","cmi","standard",null,16,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","pseudo","TZP","disque","standard",null,18,"30-6",[18,19],undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","AMC","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","AMC","disque","standard",19,19,"20-10",[19,20],undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","AMK","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","AMK","disque","standard",18,18,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","AMP","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","AMP","disque","standard",14,14,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","AMX","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],
["eucast","salmonella","AZM","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","salmonella","CAZ","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CAZ","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CIP","cmi","meninge",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CIP","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","CTX","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CTX","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CTX","disque","meninge",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CTX","disque","standard",20,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","ETP","disque","standard",23,23,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","FDC","disque","standard",23,23,"30",[21,23],undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","FEP","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","FEP","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","FOX","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","salmonella","GEN","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","GEN","disque","standard",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","salmonella","IPM","cmi","standard",2,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","IPM","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","LVX","disque","standard",23,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","MEM","cmi","meninge",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","MEM","disque","meninge",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","MEM","disque","standard",22,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","SXT","disque","standard",15,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","TEM","disque","standard",null,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","TZP","cmi","standard",8,8,undefined,16,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","TZP","disque","standard",20,20,"30-6",[19,19],undefined,undefined,undefined,undefined,undefined],
/* QUATRE RÉSERVES OUBLIÉES, TROUVÉES PAR LE MODE DIAMÈTRES.

   L'EUCAST v16.1 donne ENTRE PARENTHÈSES la ciprofloxacine et l'amikacine du
   staphylocoque — en CMI comme au disque : « Ciprofloxacin, S. aureus
   (0.001)/(2), (50)/(17) », « Amikacin (16)/(16), (15)/(15) ». PhénoBac ne
   portait la réserve que pour la gentamicine.

   Pourquoi la confrontation des CMI ne l'avait pas vu : PhénoBac n'a PAS de
   concentration critique pour ces couples, seulement un diamètre. Le
   comparateur partant de ce que l'application porte, ces couples n'étaient
   jamais visités, et l'invariant du drapeau ECOFF ne les voyait pas non plus.
   Une ciprofloxacine de staphylocoque était donc rendue « I » sans la réserve
   que la note 12 exige. */
["eucast","scn","AMK","disque","standard",15,15,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","scn","AMP","disque","standard",18,18,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","CIP","disque","standard",null,22,"5",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","scn","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","DA","disque","standard",22,22,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","E","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","E","disque","standard",21,21,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","FOX","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","scn","GEN","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","scn","GEN","disque","standard",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","scn","LVX","disque","standard",null,24,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","LZD","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","LZD","disque","standard",21,21,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","MIN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","MIN","disque","standard",23,23,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","MXF","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","MXF","disque","standard",28,28,"5",undefined,undefined,undefined,undefined,undefined,undefined],
/* Les coagulase négative : la ligne GÉNÉRALE à 0,25, et l'EXCEPTION
   nominative à 2 pour S. saprophyticus et S. lugdunensis, que la note 4
   nomme avec S. aureus. Deux lignes pour un même couple, la seconde
   l'emportant pour les espèces qu'elle nomme — voir SEUIL_ESPECE dans
   moteur.js. Le CA-SFM nomme une quatrième espèce, S. pettenkoferi, que
   PhénoBac ne porte pas : rien à écrire tant qu'elle n'y est pas.  */
["eucast","scn","OXA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","scn","OXA","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,["ssaprophyticus","slugdunensis"]],
["eucast","scn","PEN","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,["slugdunensis"]],
["eucast","scn","PEN","disque","standard",26,26,"1 unit",undefined,undefined,undefined,undefined,undefined,["slugdunensis"]],
["eucast","scn","RD","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","RD","disque","standard",30,30,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","SXT","disque","standard",24,24,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","TEC","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","scn","VA","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","AMC","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","AMC","disque","standard",19,19,"20-10",[19,20],undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","AMK","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","AMK","disque","standard",18,18,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","AMP","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","AMP","disque","standard",14,14,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","AMX","cmi","standard",8,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","AMX","disque","standard",undefined,undefined,undefined,undefined,"AMP",undefined,undefined,undefined,undefined],
["eucast","serratia","AZM","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","serratia","CAZ","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CAZ","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CIP","cmi","meninge",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CIP","cmi","standard",0.25,0.5,undefined,0.5,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CIP","disque","standard",25,22,"5",[22,24],undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","CTX","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CTX","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CTX","disque","meninge",20,20,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CTX","disque","standard",20,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","ETP","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","ETP","disque","standard",23,23,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","FDC","disque","standard",23,23,"30",[21,23],undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","FEP","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","FEP","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","FOX","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","serratia","GEN","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","GEN","disque","standard",17,17,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","serratia","IPM","cmi","standard",2,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","IPM","disque","standard",22,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","LVX","disque","standard",23,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","MEM","cmi","meninge",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","MEM","disque","meninge",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","MEM","disque","standard",22,16,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","MXF","disque","standard",22,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","SXT","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","SXT","disque","standard",null,15,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","TEM","disque","standard",null,17,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","TZP","cmi","standard",8,8,undefined,16,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","TZP","disque","standard",20,20,"30-6",[19,19],undefined,undefined,undefined,undefined,undefined],
["eucast","staph","AMK","disque","standard",15,15,"30",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","staph","AMP","disque","standard",18,18,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","CIP","disque","standard",null,17,"5",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","staph","DA","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","DA","disque","standard",22,22,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","DAP","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","E","cmi","standard",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","E","disque","standard",21,21,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","FOX","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","staph","GEN","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","staph","GEN","disque","standard",18,18,"10",undefined,undefined,undefined,undefined,undefined,undefined,true],
["eucast","staph","LVX","disque","standard",null,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","LZD","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","LZD","disque","standard",21,21,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","MIN","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","MIN","disque","standard",23,23,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","MXF","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","MXF","disque","standard",25,25,"5",undefined,undefined,undefined,undefined,undefined,undefined],
/* L'OXACILLINE DES STAPHYLOCOQUES — DEUX VALEURS, ET PHÉNOBAC N'EN
   APPLIQUAIT QU'UNE. Corrigé le 2026-11-01.

   L'EUCAST ne donne AUCUNE concentration critique clinique d'oxacilline :
   sa table écrit « Note » (feuille Staphylococcus, « Oxacillin, other
   staphylococci »), et renvoie la détection de la méticillino-résistance à
   la CÉFOXITINE. Le chiffre existe pourtant, dans la note 4 des
   pénicillines :

     « S. aureus, S. lugdunensis and S. saprophyticus with oxacillin MIC
       values > 2 mg/L are mostly methicillin resistant due to the presence
       of the mecA or mecC gene. Occasionally oxacillin MIC values are high
       in S. aureus in absence of mec-gene mediated resistance. These
       isolates have been called BORSA […]. EUCAST does not recommend
       systematic screening for BORSA. For coagulase-negative staphylococci
       other than S. saprophyticus and S. lugdunensis, the oxacillin MIC in
       methicillin resistant isolates is > 0,25 mg/L. »

   Le CA-SFM publie le même partage en table (p72) : « Oxacilline, S. aureus,
   S. lugdunensis, S. saprophyticus et S. pettenkoferi » 2/2, « Oxacilline,
   autres espèces » 0,25/0,25. LES DEUX COMITÉS DISENT LA MÊME CHOSE.

   PhénoBac appliquait 0,25 à TOUT LE MONDE sous EUCAST, S. aureus compris.
   Conséquence : un staphylocoque doré SENSIBLE à la méticilline dont la CMI
   d'oxacilline vaut 0,5 ou 2 mg/L sortait « R » ; le moteur en déduit la
   méticillino-résistance (staphInterpret : « mrsa = isRI(r.FOX) ||
   isRI(r.OXA) ») et raye ALORS TOUTES LES β-LACTAMINES. Un SASM rendu SARM,
   sur un seul chiffre, et précisément dans la plage que l'EUCAST nomme
   BORSA en disant de ne pas la rechercher.

   Le « conv » reste : la table de l'EUCAST ne chiffre pas ce couple, et
   l'interface doit continuer de le dire. Ce qui change est la valeur, et sa
   provenance est maintenant écrite.  */
["eucast","staph","OXA","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","staph","PEN","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","PEN","disque","standard",26,26,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","RD","cmi","standard",0.06,0.06,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","RD","disque","standard",26,26,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","SXT","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","SXT","disque","standard",24,24,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","TEC","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","staph","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","steno","AMK","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","steno","CAZ","cmi","standard",8,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","steno","COL","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","steno","FDC","cmi","standard",2,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","steno","GEN","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","steno","IPM","cmi","standard",2,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","steno","LVX","cmi","standard",1,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","steno","MEM","cmi","standard",2,8,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","steno","MIN","cmi","standard",null,2,undefined,undefined,undefined,undefined,true,true,undefined],
["eucast","steno","SXT","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","steno","SXT","disque","standard",null,16,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","steno","TZP","cmi","standard",16,16,undefined,undefined,undefined,undefined,true,undefined,undefined],
/* L'AMOXICILLINE ET LA CÉFOTAXIME DES STREPTOCOQUES BÊTA-HÉMOLYTIQUES
   PORTAIENT LES VALEURS DU PNEUMOCOQUE. Retirées le 2026-11-01.

   Trouvé par comparer-eucast.py --notes, qui lit enfin ce que le classeur
   met en note. Feuille « Streptococcus A,B,C,G » :

       Amoxicillin    Note / Note
       Cefotaxime     Note / Note

   AUCUN chiffre. PhénoBac appliquait pourtant 0,5 / 2 aux deux — et 0,5 / 2
   est, mot pour mot, la ligne « Cefotaxime (indications other than
   endocarditis and meningitis) » de la feuille S. PNEUMONIAE. Les deux
   lignes étaient marquées « convention de laboratoire », ce qui était
   honnête sur l'absence de seuil EUCAST et muet sur la provenance du
   chiffre. C'est la confusion de chapitre déjà rencontrée le 2026-10-31
   avec les voies d'administration : une valeur juste pour une espèce,
   appliquée à sa voisine.

   CE QUE LE DOCUMENT DIT À LA PLACE, et qui vaut mieux qu'un chiffre :

     « The susceptibility of streptococcus groups A, B, C and G to
       penicillins is inferred from the benzylpenicillin susceptibility,
       with the exception of phenoxymethylpenicillin and isoxazolylpenicillins
       for streptococcus group B […]. The susceptibility […] to cephalosporins
       is inferred from the benzylpenicillin susceptibility. […] to
       carbapenems is inferred from the benzylpenicillin susceptibility. »

   La catégorie ne se calcule donc pas : elle se REPREND à la pénicilline G.
   C'est porté dans le moteur, table CAT_DEDUITE, et non ici — une déduction
   n'est pas un seuil, et l'écrire comme un seuil serait reconduire le
   défaut qu'on corrige.  */
["eucast","strepacg","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","DA","disque","standard",17,17,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","E","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","E","disque","standard",21,21,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","LVX","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","LVX","disque","standard",null,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","LZD","disque","standard",19,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","MIN","disque","standard",23,23,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","MXF","disque","standard",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","PEN","cmi","standard",0.03,0.03,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","PEN","disque","standard",23,23,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","RD","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","SXT","disque","standard",16,16,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","TEC","disque","standard",15,15,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepacg","VA","disque","standard",13,13,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","DA","disque","standard",17,17,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","E","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","E","disque","standard",21,21,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","LVX","cmi","standard",null,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","LVX","disque","standard",null,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","LZD","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","LZD","disque","standard",19,19,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","MIN","disque","standard",23,23,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","MXF","disque","standard",19,19,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","PEN","cmi","standard",0.125,0.125,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","PEN","disque","standard",18,18,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","RD","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","SXT","disque","standard",16,16,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","TEC","disque","standard",15,15,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","strepb","VA","disque","standard",13,13,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","AZM","cmi","standard",4,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","AZM","disque","standard",16,16,"15",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","CAZ","disque","standard",22,22,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","CIP","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","CIP","disque","standard",23,23,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","CTX","disque","standard",21,21,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","DOX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","E","cmi","standard",4,4,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","vibrio","LVX","disque","standard",23,23,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","MEM","disque","standard",24,24,"10",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","SXT","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","SXT","disque","standard",21,21,"1.25-23.75",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","vibrio","TZP","disque","standard",26,26,"30-6",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","AMP","disque","standard",21,15,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","AMX","cmi","standard",0.5,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","CTX","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","CTX","disque","standard",23,23,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","DA","cmi","standard",0.5,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","DA","disque","standard",19,19,"2",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","E","cmi","standard",0.25,0.25,undefined,undefined,undefined,undefined,true,undefined,undefined],
["eucast","viridans","FEP","disque","standard",25,25,"30",undefined,undefined,undefined,undefined,undefined,undefined],
/* LA LÉVOFLOXACINE DES AUTRES STREPTOCOQUES N'EXISTE DANS AUCUN DES DEUX
   DOCUMENTS. Ligne retirée le 2026-11-02.

   EUCAST v16.1, feuille « Viridans group streptococci », bloc
   Fluoroquinolones :

       Ciprofloxacin    «  –  »     (à rendre résistant sans test)
       Levofloxacin     «  IE  »    dans les quatre colonnes
       Moxifloxacin     « Note »    (CMI > 0,5 ; diamètre < 21 mm)
       Norfloxacin      «  –  »
       Ofloxacin        «  –  »

   CA-SFM 2026, chapitre 5.11 « Autres streptocoques », p96 : le tableau des
   fluoroquinolones ne porte QUE la délafloxacine (groupe S. anginosus) et la
   moxifloxacine, avec la note 1/B — « Pour la moxifloxacine, une CMI
   ≤ 0,5 mg/L (ECOFF) [ou un diamètre ≥ 21 mm] permet de distinguer les
   souches sauvages de celles ayant acquis un mécanisme de résistance ». La
   lévofloxacine n'y a pas de ligne du tout.

   PhénoBac appliquait « null / 2 ». L'écriture empêchait de rendre
   « sensible » — ce qui était prudent — mais rendait « I » toute la plage
   basse, et 2 n'est le chiffre d'aucune des deux notes. Un seuil prudent
   reste un seuil inventé.

   Ce que le laboratoire obtient désormais : aucune catégorie, et la raison,
   grâce au jumeau de « sansDisque » posé le même jour pour les CMI. Sans
   lui, retirer cette ligne aurait fait disparaître la lévofloxacine en
   silence — ce qui aurait été pire que le seuil inventé.  */
/* LE LINÉZOLIDE DES STREPTOCOQUES VIRIDANS N'A PAS DE SEUIL CLINIQUE, et le
   2 mg/L qui était écrit ici n'en est pas un. Ligne retirée le 2026-11-01.

   EUCAST v16.1, feuille « Viridans group streptococci » : la ligne Linezolid
   porte « IE / IE » — insufficient evidence. Le chiffre existe, dans la
   note 1, mais il ne dit pas ce qu'un seuil dit :

     « Linezolid has been used in oral follow-up treatment of endocarditis
       caused by viridans group streptococci. THERE ARE NO CLINICAL
       BREAKPOINTS but acquired resistance (indicated by MIC > 2 mg/L) should
       be excluded. When excluded, the isolate should be reported "DEVOID OF
       LINEZOLID RESISTANCE MECHANISMS", BUT NOT AS SUSCEPTIBLE TO LINEZOLID. »

   2 mg/L n'est donc pas la frontière entre « sensible » et « résistant » :
   c'est le seuil au-dessus duquel une résistance ACQUISE est présente. En
   dessous, le document interdit explicitement de conclure « sensible ».

   Écrit comme un seuil — 2 / 2 —, il rendait « S » tout ce qui est en
   dessous. Écrit « null / 2 », la convention « ne jamais rendre sensible »
   du dépôt, il rendrait « I » : une catégorie de sensibilité, que le
   document refuse tout autant. Il fallait un TROISIÈME rendu, qui n'est ni
   S ni I ni R, et c'est ce que porte EXCLUSION_ACQUISE dans le moteur.  */
["eucast","viridans","PEN","cmi","standard",0.25,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","PEN","disque","standard",21,12,"1 unit",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","TEC","disque","standard",16,16,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","VA","cmi","standard",2,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","viridans","VA","disque","standard",15,15,"5",undefined,undefined,undefined,undefined,undefined,undefined],

// --- Molécules urinaires, ajoutées le 2026-10-24 ----------------------------
// Source : EUCAST, Clinical Breakpoint Tables v16.1 (classeur officiel),
// feuille « Enterobacterales ». Nécessaires à l'antibiogramme ciblé de la
// HAS, qui repose sur elles : masquer les céphalosporines sans pouvoir
// proposer les molécules de première ligne retirerait sans rien offrir.
//
// LES RÉSERVES DU RÉFÉRENTIEL SONT PORTÉES, PAS COMMENTÉES :
//   site « urinaire »  pivmécillinam, céfixime, nitrofurantoïne et
//                      triméthoprime ne sont chiffrés QUE pour la cystite
//                      simple. Hors de cette indication ils n'ont aucun
//                      seuil, et l'application le dit.
//   espece            la nitrofurantoïne n'est validée que chez E. coli,
//                      le triméthoprime chez E. coli et Klebsiella. Chez
//                      Proteus, le classeur porte « Note » : aucune valeur,
//                      donc aucune ligne ici.
["eucast","entero","ATM","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","ATM","disque","standard",26,21,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","OFX","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","OFX","disque","standard",24,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CRO","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CRO","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CRO","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CRO","disque","meninge",27,27,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","MEC","cmi","urinaire",8,8,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","entero","MEC","disque","urinaire",15,15,"10",undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","entero","CFM","cmi","urinaire",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","CFM","disque","urinaire",17,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","ATM","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","ATM","disque","standard",26,21,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","OFX","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","OFX","disque","standard",24,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CRO","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CRO","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CRO","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CRO","disque","meninge",27,27,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","MEC","cmi","urinaire",8,8,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","morganella","MEC","disque","urinaire",15,15,"10",undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","morganella","CFM","cmi","urinaire",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","morganella","CFM","disque","urinaire",17,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","ATM","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","ATM","disque","standard",26,21,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","OFX","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","OFX","disque","standard",24,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CRO","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CRO","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CRO","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CRO","disque","meninge",27,27,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","MEC","cmi","urinaire",8,8,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","salmonella","MEC","disque","urinaire",15,15,"10",undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","salmonella","CFM","cmi","urinaire",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","salmonella","CFM","disque","urinaire",17,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","ATM","cmi","standard",1,4,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","ATM","disque","standard",26,21,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","OFX","cmi","standard",0.25,0.5,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","OFX","disque","standard",24,22,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CRO","cmi","standard",1,2,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CRO","disque","standard",27,24,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CRO","cmi","meninge",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CRO","disque","meninge",27,27,"30",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","MEC","cmi","urinaire",8,8,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","serratia","MEC","disque","urinaire",15,15,"10",undefined,undefined,undefined,undefined,undefined,["ecoli","cfreundii","kpneu","koxytoca","kaerogenes","ecloacae","proteus"]],
["eucast","serratia","CFM","cmi","urinaire",1,1,undefined,undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","serratia","CFM","disque","urinaire",17,17,"5",undefined,undefined,undefined,undefined,undefined,undefined],
["eucast","entero","NIT","cmi","urinaire",64,64,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli"]],
["eucast","entero","NIT","disque","urinaire",11,11,"100",undefined,undefined,undefined,undefined,undefined,["ecoli"]],
["eucast","entero","TMP","cmi","urinaire",2,2,undefined,undefined,undefined,undefined,undefined,undefined,["ecoli","kpneu","koxytoca"]],
["eucast","entero","TMP","disque","urinaire",15,15,"5",undefined,undefined,undefined,undefined,undefined,["ecoli","kpneu","koxytoca"]],

];

/* Chaque ligne redevient un objet nommé : le moteur n'a pas à connaître
   l'ordre des colonnes, et en ajouter une ne casse rien. */
function enObjets(lignes) {
  return lignes.map(function (l) {
    const o = {};
    for (let i = 0; i < COLONNES.length; i++) o[COLONNES[i]] = l[i];
    return o;
  });
}

const BASE = { SOURCES, BASE_VERSION, COLONNES, REGLES, regles: enObjets(REGLES) };

if (typeof module !== "undefined" && module.exports) module.exports = BASE;
else racine.PhenoBacBase = BASE;

})(typeof self !== "undefined" ? self : this);
