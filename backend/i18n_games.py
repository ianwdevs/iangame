# -*- coding: utf-8 -*-
"""
16 款游戏的元数据翻译(name/desc/controls)。
zh(中文)不在此维护 —— DB 存的就是中文,直接回退 DB 值。
缺语言/缺 slug 时同样回退 DB 中文。
"""

# 每语言:{slug: (name, desc, controls)}
GAMES_META = {
    'en': {
        'plantguard': ('Plant Guardians', 'Deploy your plant army and hold the lawn against waves of zombies', 'Click empty tiles to plant, collect sun'),
        'arcadefighter': ('Arcade Fighter', 'Classic fighting duels with combos and supers', 'A/D move · W jump · J punch · K kick · L super'),
        'snake': ('Neon Snake', 'Steer the neon snake, eat light dots, grow longer and faster', 'Arrow keys to steer'),
        'neonblocks': ('Neon Blocks', 'Classic block-stacking, clear full lines to score', '←→ move · ↑ rotate · ↓ soft drop · Space hard drop'),
        'g2048': ('2048', 'Slide and merge equal numbers, chase the 2048 tile', 'Arrow keys to merge'),
        'breakout': ('Breakout', 'Move the paddle, bounce the ball, smash every brick', 'Mouse / arrow keys to move paddle'),
        'minesweeper': ('Minesweeper', 'Use logic to flag mines and reveal every safe cell', 'Left click reveal · Right click flag'),
        'gomoku': ('Gomoku', 'Play against the AI — five in a row wins', 'Click the board to place a stone'),
        'flappy': ('Pixel Bird', 'Tap to flap through the pipes, chase your limit', 'Click / Space to flap'),
        'shooter': ('Sky Shooter', 'Fly your fighter, destroy enemies, grab power-ups', 'Mouse / arrows to move, auto fire'),
        'tankbattle': ('Tank Battle', 'Command your tank, wipe out enemies, defend the base', 'Arrow keys to move · Space to fire'),
        'memory': ('Memory Match', 'Flip cards and find all the matching pairs', 'Click cards to flip and match'),
        'ironcommand': ('Iron Commander', 'Classic RTS: mine, build a base, produce armies and crush the enemy HQ (fog of war, tech tree, optional nuke)', 'LMB drag-select · RMB move/attack · WASD pan camera · right panel to build'),
        'starfall': ('Starfall Defense', 'Sci-fi path tower defense: 5 turret types counter 6 enemy types across a 7-level campaign with bosses and 3 difficulties', 'Pick a turret card → click to build · click turret to upgrade/sell · 1-5 hotkeys · Tab fast-forward'),
        'plantguard-deluxe': ('Plant Guardians Deluxe', 'Deluxe tower defense: bezier-drawn plants, elemental reactions (ice/fire/poison/volt), aura buffs, 12 plants, 12 zombies, 12 levels + bosses', 'Pick a plant in the shop → click a tile to place · collect sun · shovel to remove'),
        'tankbattle-deluxe': ('Tank Battle Deluxe', 'Deluxe shooter: hand-drawn tanks, 3-star upgrades, 8 power-ups, 5 enemy AI types, 20 handcrafted levels + bosses', 'WASD/arrows to move · Space to fire · grab power-ups'),
    },
    'es': {
        'plantguard': ('Guardianes Vegetales', 'Despliega tu ejército vegetal y defiende el césped de oleadas de zombis', 'Clic en casillas vacías para plantar, recoge soles'),
        'arcadefighter': ('Lucha Arcade', 'Duelos de lucha clásicos con combos y superataques', 'A/D mover · W saltar · J puño · K patada · L super'),
        'snake': ('Serpiente Neón', 'Guía la serpiente neón, traga puntos de luz y crece cada vez más rápido', 'Flechas para dirigir'),
        'neonblocks': ('Bloques Neón', 'Bloques clásicos: completa líneas para puntuar', '←→ mover · ↑ rotar · ↓ bajar · Space caída'),
        'g2048': ('2048', 'Desliza y fusiona números igles hasta llegar a 2048', 'Flechas para fusionar'),
        'breakout': ('Rompeladrillos', 'Mueve la pala, rebota la bola y destroza todos los ladrillos', 'Ratón / flechas para mover la pala'),
        'minesweeper': ('Buscaminas', 'Usa la lógica para marcar minas y descubrir todas las casillas seguras', 'Clic izq. descubrir · clic der. bandera'),
        'gomoku': ('Gomoku', 'Partida contra la IA: alinea cinco y gana', 'Clic en el tablero para colocar'),
        'flappy': ('Pájarito Píxel', 'Toca para volar entre tuberías y supera tu récord', 'Clic / Espacio para aletear'),
        'shooter': ('Guerra Aérea', 'Pilota tu caza, destruye enemigos y recoge mejoras', 'Ratón / flechas para mover, disparo automático'),
        'tankbattle': ('Batalla de Tanques', 'Dirige tu tanque, elimina enemigos y defiende la base', 'Flechas para mover · Espacio disparar'),
        'memory': ('Parejas de Memoria', 'Da vuelta a las cartas y encuentra todas las parejas', 'Clic para girar y emparejar'),
        'ironcommand': ('Comandante de Hierro', 'RTS clásico: mina, construye la base, produce tropas y destruye el cuartel enemigo (niebla, tecnología, nucleares)', 'Clic izq. seleccionar · clic der. mover/atacar · WASD cámara · panel derecho para construir'),
        'starfall': ('Defensa Starfall', 'Tower defense espacial: 5 torretas contra 6 enemigos, 7 niveles con jefes y 3 dificultades', 'Elige torreta → clic para construir · clic en torreta para mejorar/vender · 1-5 atajos · Tab acelerar'),
        'plantguard-deluxe': ('Guardianes Vegetales Deluxe', 'Tower defense deluxe: plantas dibujadas con curvas, reacciones elementales (hielo/fuego/veneno/rayo), auras, 12 plantas, 12 zombis, 12 niveles + jefes', 'Elige planta en la tienda → clic en casilla · recoge soles · pala para quitar'),
        'tankbattle-deluxe': ('Batalla de Tanques Deluxe', 'Shooter deluxe: tanques dibujados a mano, mejora de 3 estrellas, 8 power-ups, 5 IA enemigas, 20 niveles + jefes', 'WASD/flechas mover · Espacio disparar · recoge power-ups'),
    },
    'fr': {
        'plantguard': ('Gardiens Végétaux', 'Déployez votre armée végétale et tenez la pelouse face aux vagues de zombies', 'Clic sur une case vide pour planter, ramassez les soleils'),
        'arcadefighter': ("Combat d'Arcade", 'Duels de combat classiques avec combos et coups spéciaux', 'A/D déplacer · W saut · J poing · K pied · L super'),
        'snake': ('Serpent Néon', 'Pilotez le serpent néon, avalez les points lumineux et grandissez', 'Flèches pour diriger'),
        'neonblocks': ('Blocs Néon', 'Empilement classique de blocs, complétez des lignes pour marquer', '←→ déplacer · ↑ tourner · ↓ descendre · Espace chute'),
        'g2048': ('2048', 'Faites glisser et fusionnez les nombres égaux jusqu\'à 2048', 'Flèches pour fusionner'),
        'breakout': ('Casse-briques', 'Déplacez la raquette, renvoyez la balle, détruisez toutes les briques', 'Souris / flèches pour la raquette'),
        'minesweeper': ('Démineur', 'Marquez les mines par logique et révélez toutes les cases sûres', 'Clic gauche révéler · clic droit drapeau'),
        'gomoku': ('Gomoku', 'Affrontez l\'IA — cinq pierres alignées gagnent', 'Clic sur le plateau pour poser'),
        'flappy': ('Oiseau Pixel', 'Tapez pour voler entre les tuyaux et battre votre record', 'Clic / Espace pour battre des ailes'),
        'shooter': ('Guerre Aérienne', 'Pilotez votre chasseur, détruisez les ennemis, ramassez les bonus', 'Souris / flèches, tir automatique'),
        'tankbattle': ('Bataille de Chars', 'Commandez votre char, éliminez les ennemis, défendez la base', 'Flèches pour bouger · Espace tirer'),
        'memory': ('Paires de Mémoire', 'Retournez les cartes et trouvez toutes les paires', 'Clic pour retourner et apparier'),
        'ironcommand': ('Commandant de Fer', 'RTS classique : minez, bâtissez, produisez des armées et rasez le QG ennemi (brouillard, techno, nucléaire)', 'Clic gauche sélection · clic droit déplacer/attaquer · WASD caméra · panneau droit'),
        'starfall': ('Défense Starfall', 'Tower defense spatial : 5 tourelles contre 6 ennemis, 7 niveaux avec boss et 3 difficultés', 'Choisissez une tourelle → clic pour poser · clic pour améliorer/vendre · 1-5 raccourcis · Tab accélérer'),
        'plantguard-deluxe': ('Gardiens Végétaux Deluxe', 'Tower defense deluxe : plantes dessinées, réactions élémentaires (glace/feu/poison/éclair), auras, 12 plantes, 12 zombies, 12 niveaux + boss', 'Choisissez une plante → clic sur une case · ramassez les soleils · pelle pour retirer'),
        'tankbattle-deluxe': ('Bataille de Chars Deluxe', 'Shooter deluxe : chars dessinés à la main, amélioration 3 étoiles, 8 bonus, 5 IA ennemies, 20 niveaux + boss', 'WASD/flèches bouger · Espace tirer · ramassez les bonus'),
    },
    'de': {
        'plantguard': ('Pflanzenwächter', 'Stelle deine Pflanzenarmee auf und halte den Rasen gegen Zombie-Wellen', 'Klicke freie Felder zum Pflanzen, sammle Sonnen'),
        'arcadefighter': ('Arcade-Kampf', 'Klassische Kampfduelle mit Combos und Supers', 'A/D laufen · W springen · J Faust · K Kick · L Super'),
        'snake': ('Neon-Schlange', 'Steuere die Neonschlange, frisse Lichtpunkte, werde schneller', 'Pfeiltasten zum Steuern'),
        'neonblocks': ('Neon-Blöcke', 'Klassisches Blockstapeln, volle Reihen räumen für Punkte', '←→ bewegen · ↑ drehen · ↓ schneller · Leiste Fallen'),
        'g2048': ('2048', 'Gleiche Zahlen zusammenziehen bis zur 2048-Kachel', 'Pfeiltasten zum Zusammenziehen'),
        'breakout': ('Breakout', 'Schläger bewegen, Ball abprallen, alle Ziegel zerschlagen', 'Maus / Pfeiltasten für den Schläger'),
        'minesweeper': ('Minesweeper', 'Logisch Minen markieren und alle sicheren Felder aufdecken', 'Linksklick aufdecken · Rechtsklick Fahne'),
        'gomoku': ('Gomoku', 'Duell gegen die KI — fünf in einer Reihe gewinnt', 'Klicke aufs Brett zum Setzen'),
        'flappy': ('Pixel-Vogel', 'Tippe, um durch die Rohre zu flattern und den Rekord zu jagen', 'Klick / Leertaste zum Flattern'),
        'shooter': ('Luftkampf', 'Flieg deinen Jäger, zerstöre Gegner, sammle Power-ups', 'Maus / Pfeile bewegen, Auto-Feuer'),
        'tankbattle': ('Panzerduell', 'Kommandiere deinen Panzer, schalte Gegner aus, verteidige die Basis', 'Pfeile bewegen · Leertaste feuern'),
        'memory': ('Memory-Paare', 'Karten umdrehen und alle Paare finden', 'Klicken zum Umdrehen und Paaren'),
        'ironcommand': ('Eiserner Kommandant', 'Klassisches RTS: abbauen, Basis bauen, Armeen produzieren, feindliches HQ zerstören (Nebel, Tech, Atombombe)', 'Linksklick Auswahl · Rechtsklick Bewegen/Angreifen · WASD Kamera · rechtes Panel'),
        'starfall': ('Starfall-Verteidigung', 'Sci-Fi-Tower-Defense: 5 Geschütztürme gegen 6 Gegnertypen, 7 Level mit Bossen und 3 Schwierigkeiten', 'Turm wählen → Klick bauen · Turm anklicken für Upgrade/Verkauf · 1-5 Hotkeys · Tab schnell'),
        'plantguard-deluxe': ('Pflanzenwächter Deluxe', 'Deluxe-Tower-Defense: gezeichnete Pflanzen, Elementarreaktionen (Eis/Feuer/Gift/Blitz), Auren, 12 Pflanzen, 12 Zombies, 12 Level + Bosse', 'Pflanze im Shop wählen → Feld anklicken · Sonnen sammeln · Schaufel zum Entfernen'),
        'tankbattle-deluxe': ('Panzerduell Deluxe', 'Deluxe-Shooter: handgezeichnete Panzer, 3-Sterne-Upgrades, 8 Power-ups, 5 Gegner-KIs, 20 Level + Bosse', 'WASD/Pfeile bewegen · Leertaste feuern · Power-ups einsammeln'),
    },
    'it': {
        'plantguard': ('Guardiani Vegetali', 'Schiera il tuo esercito vegetale e difendi il prato dalle ondate di zombie', 'Clicca le celle vuote per piantare, raccogli i soli'),
        'arcadefighter': ('Combattimento Arcade', 'Dueli di lotta classici con combo e mosse speciali', 'A/D muovi · W salta · J pugno · K calcio · L super'),
        'snake': ('Serpente Neon', 'Guida il serpente neon, mangia i punti luminosi e cresci', 'Frecce per sterzare'),
        'neonblocks': ('Blocchi Neon', 'Impilamento classico di blocchi, completa le righe per punti', '←→ muovi · ↑ ruota · ↓ giù · Spazio caduta'),
        'g2048': ('2048', 'Unisci i numeri uguali fino al 2048', 'Frecce per unire'),
        'breakout': ('Breakout', 'Muovi la racchetta, rimbalza la palla, rompi tutti i mattoni', 'Mouse / frecce per la racchetta'),
        'minesweeper': ('Campo Minato', 'Usa la logica: segnala le mine e rivela tutte le caselle sicure', 'Clic sinistro rivela · destro bandiera'),
        'gomoku': ('Gomoku', 'Sfida l\'IA — cinque in fila per vincere', 'Clic sulla scacchiera per posare'),
        'flappy': ('Uccello Pixel', 'Tocca per svolazzare tra i tubi e superare i limiti', 'Clic / Spazio per sbattere le ali'),
        'shooter': ('Battaglia Aerea', 'Pilota il caccia, distruggi i nemici, raccogli potenziamenti', 'Mouse / frecce, fuoco automatico'),
        'tankbattle': ('Battaglia di Carri', 'Guida il carro, elimina i nemici, difendi la base', 'Frecce per muoverti · Spazio per sparare'),
        'memory': ('Coppie di Memoria', 'Gira le carte e trova tutte le coppie', 'Clic per girare e abbinare'),
        'ironcommand': ('Comandante di Ferro', 'RTS classico: estrai, costruisci, produci eserciti e distruggi il QG nemico (nebbia, tecnologia, nucleare)', 'Clic sx seleziona · clic dx muovi/attacca · WASD camera · pannello destro'),
        'starfall': ('Difesa Starfall', 'Tower defense spaziale: 5 torrette contro 6 nemici, 7 livelli con boss e 3 difficoltà', 'Scegli torretta → clic per costruire · clic per potenziare/vendere · 1-5 tasti · Tab veloce'),
        'plantguard-deluxe': ('Guardiani Vegetali Deluxe', 'Tower defense deluxe: piante disegnate, reazioni elementali (ghiocco/fuoco/veleno/fulmine), aure, 12 piante, 12 zombie, 12 livelli + boss', 'Scegli pianta → clic su cella · raccogli soli · pala per rimuovere'),
        'tankbattle-deluxe': ('Battaglia di Carri Deluxe', 'Shooter deluxe: carri disegnati a mano, potenziamenti a 3 stelle, 8 power-up, 5 IA nemiche, 20 livelli + boss', 'WASD/frecce muovi · Spazio spara · raccogli power-up'),
    },
    'pt': {
        'plantguard': ('Guardiões Vegetais', 'Posicione seu exército vegetal e defenda o gramado contra ondas de zumbis', 'Clique em células vazias para plantar, colete sóis'),
        'arcadefighter': ('Luta Arcade', 'Duelos de luta clássicos com combos e golpes especiais', 'A/D mover · W pular · J soco · K chute · L super'),
        'snake': ('Cobra Neon', 'Pilote a cobra neon, coma pontos de luz e cresça', 'Setas para dirigir'),
        'neonblocks': ('Blocos Neon', 'Empilhe blocos clássicos, complete linhas para pontuar', '←→ mover · ↑ girar · ↓ descer · Espaço soltar'),
        'g2048': ('2048', 'Deslize e junte números iguais até o 2048', 'Setas para juntar'),
        'breakout': ('Quebra-Blocos', 'Mova a raquete, rebata a bola, quebre todos os tijolos', 'Mouse / setas para a raquete'),
        'minesweeper': ('Campo Minado', 'Use a lógica: marque as minas e revele todas as casas seguras', 'Clique esq. revelar · dir. bandeira'),
        'gomoku': ('Gomoku', 'Encare a IA — cinco em linha vence', 'Clique no tabuleiro para posicionar'),
        'flappy': ('Passarinho Pixel', 'Toque para voar entre os canos e bater seu recorde', 'Clique / Espaço para bater asas'),
        'shooter': ('Batalha Aérea', 'Voe seu caça, destrua inimigos, pegue power-ups', 'Mouse / setas, tiro automático'),
        'tankbattle': ('Batalha de Tanques', 'Comande seu tanque, elimine inimigos, defenda a base', 'Setas mover · Espaço atirar'),
        'memory': ('Pares da Memória', 'Vire as cartas e encontre todos os pares', 'Clique para virar e combinar'),
        'ironcommand': ('Comandante de Ferro', 'RTS clássico: extraia, construa a base, produza exércitos e destrua o QG inimigo (neblina, tecnologia, nuclear)', 'Clique esq. selecionar · dir. mover/atacar · WASD câmera · painel direito'),
        'starfall': ('Defesa Starfall', 'Tower defense espacial: 5 torres contra 6 inimigos, 7 níveis com chefes e 3 dificuldades', 'Escolha torre → clique para construir · clique para melhorar/vender · 1-5 atalhos · Tab acelerar'),
        'plantguard-deluxe': ('Guardiões Vegetais Deluxe', 'Tower defense deluxe: plantas desenhadas, reações elementais (gelo/fogo/veneno/raio), auras, 12 plantas, 12 zumbis, 12 níveis + chefes', 'Escolha planta → clique na célula · colete sóis · pá para remover'),
        'tankbattle-deluxe': ('Batalha de Tanques Deluxe', 'Shooter deluxe: tanques desenhados à mão, upgrade de 3 estrelas, 8 power-ups, 5 IAs inimigas, 20 níveis + chefes', 'WASD/setas mover · Espaço atirar · pegue power-ups'),
    },
}

# 分类标签翻译
CATEGORY_LABELS_I18N = {
    'zh': {'casual': '休闲', 'puzzle': '益智', 'shooter': '射击', 'battle': '对战', 'defense': '塔防', 'strategy': '策略'},
    'en': {'casual': 'Casual', 'puzzle': 'Puzzle', 'shooter': 'Shooter', 'battle': 'Battle', 'defense': 'Defense', 'strategy': 'Strategy'},
    'es': {'casual': 'Casual', 'puzzle': 'Puzles', 'shooter': 'Disparos', 'battle': 'Combate', 'defense': 'Defensa', 'strategy': 'Estrategia'},
    'fr': {'casual': 'Décontracté', 'puzzle': 'Réflexion', 'shooter': 'Shooter', 'battle': 'Combat', 'defense': 'Défense', 'strategy': 'Stratégie'},
    'de': {'casual': 'Gelegenheit', 'puzzle': 'Puzzle', 'shooter': 'Shooter', 'battle': 'Kampf', 'defense': 'Verteidigung', 'strategy': 'Strategie'},
    'it': {'casual': 'Casual', 'puzzle': 'Puzzle', 'shooter': 'Sparatutto', 'battle': 'Combattimento', 'defense': 'Difesa', 'strategy': 'Strategia'},
    'pt': {'casual': 'Casual', 'puzzle': 'Quebra-cabeça', 'shooter': 'Tiro', 'battle': 'Combate', 'defense': 'Defesa', 'strategy': 'Estratégia'},
}


def get_game_meta(slug, lang, db_name, db_desc, db_controls):
    """取某语言的游戏元数据;缺翻译回退 DB 中文值。返回 dict(name, desc, controls)"""
    entry = GAMES_META.get(lang, {}).get(slug)
    if not entry:
        return {'name': db_name, 'desc': db_desc, 'controls': db_controls}
    return {'name': entry[0], 'desc': entry[1], 'controls': entry[2]}
