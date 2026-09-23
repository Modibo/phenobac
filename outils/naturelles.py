# -*- coding: utf-8 -*-
"""Résistances naturelles attendues, transcrites du document officiel
EUCAST « Expected Resistant Phenotypes » v1.2 (janvier 2023), restreintes
aux antibiotiques que PhénoBac teste. Chaque entrée cite sa règle."""

# germe PhénoBac -> (règle du document, {code: libellé})
NATURELLES = {
 'kpneu':        ("1.7",  {'AMX': "aminopénicillines"}),
 'koxytoca':     ("1.8",  {'AMX': "aminopénicillines"}),
 'ecloacae':     ("1.3",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'FOX': "céfoxitine (céphalosporinase AmpC)"}),
 'kaerogenes':   ("1.6",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'FOX': "céfoxitine (céphalosporinase AmpC)"}),
 'cfreundii':    ("1.2",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'FOX': "céfoxitine (céphalosporinase AmpC)"}),
 'serratia':     ("1.18", {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'FOX': "céfoxitine", 'COL': "polymyxines"}),
 'proteus':      ("1.12", {'DOX': "tétracyclines", 'COL': "polymyxines"}),
 'pvulgaris':    ("1.14", {'AMX': "aminopénicillines", 'DOX': "tétracyclines", 'COL': "polymyxines"}),
 'paeru':        ("2.7",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'CTX': "céfotaxime / ceftriaxone", 'ETP': "ertapénème", 'CAF': "chloramphénicol", 'DOX': "tétracyclines"}),
 'acineto':      ("2.1",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'CTX': "céfotaxime / ceftriaxone", 'ETP': "ertapénème", 'FOS': "fosfomycine", 'DOX': "tétracyclines"}),
 'steno':        ("2.8",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'TZP': "pipéracilline-tazobactam", 'CTX': "céfotaxime / ceftriaxone", 'ETP': "ertapénème", 'IPM': "imipénème", 'MEM': "méropénème", 'GEN': "aminosides", 'AMK': "aminosides", 'FOS': "fosfomycine"}),
 # Doxycycline écartée : la règle 2.8 coche « tétracyclines », mais la note du
 # document restreint — la sensibilité à la doxycycline, à la minocycline et à
 # la tigécycline VARIE chez S. maltophilia. Seule la tétracycline est
 # constamment inactive, et PhénoBac ne la teste pas.
 'burk':         ("2.3",  {'AMX': "aminopénicillines", 'AMC': "aminopénicilline + inhibiteur", 'TZP': "pipéracilline-tazobactam", 'CTX': "céfotaxime / ceftriaxone", 'ETP': "ertapénème", 'CIP': "ciprofloxacine", 'CAF': "chloramphénicol", 'GEN': "aminosides", 'AMK': "aminosides", 'FOS': "fosfomycine", 'COL': "polymyxines"}),
 'saureus':      ("4.5",  {'CAZ': "ceftazidime"}),
 'sepidermidis': ("4.5",  {'CAZ': "ceftazidime"}),
 'shaemolyticus':("4.5",  {'CAZ': "ceftazidime"}),
 'slugdunensis': ("4.5",  {'CAZ': "ceftazidime"}),
 'ssaprophyticus':("4.1", {'CAZ': "ceftazidime", 'FOS': "fosfomycine"}),
 'efaecalis':    ("4.7",  {'CAZ': "ceftazidime", 'CTX': "céphalosporines (hors ceftazidime)", 'FOX': "céphalosporines (hors ceftazidime)", 'FEP': "céphalosporines (hors ceftazidime)", 'GEN': "aminosides (bas niveau)", 'E': "macrolides", 'AZM': "macrolides", 'DA': "lincosamides"}),
 'efaecium':     ("4.9",  {'CAZ': "ceftazidime", 'CTX': "céphalosporines (hors ceftazidime)", 'FOX': "céphalosporines (hors ceftazidime)", 'FEP': "céphalosporines (hors ceftazidime)", 'GEN': "aminosides (bas niveau)", 'E': "macrolides", 'AZM': "macrolides"}),
 'spyogenes':    ("4.6",  {'CAZ': "ceftazidime", 'GEN': "aminosides"}),
 'sagalactiae':  ("4.6",  {'CAZ': "ceftazidime", 'GEN': "aminosides"}),
 'sviridans':    ("4.6",  {'CAZ': "ceftazidime", 'GEN': "aminosides"}),
 'pneumocoque':  ("4.6",  {'CAZ': "ceftazidime", 'GEN': "aminosides"}),
 'coryne':       ("4.10", {'FOS': "fosfomycine"}),
 'listeria':     ("4.11", {'CAZ': "ceftazidime", 'CTX': "céphalosporines (hors ceftazidime)", 'FOX': "céphalosporines (hors ceftazidime)", 'FEP': "céphalosporines (hors ceftazidime)"}),
}
