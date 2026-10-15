# Páginas para buscadores, en español, inglés y chino simplificado.
#   node tools/export_data.js && python tools/make_seo_pages.py
# Son páginas de texto de verdad (el juego es un canvas que Google no puede leer)
# hechas con los datos del propio juego, y enlazan al juego. Genera:
#   es: guia/ pokedex/ legendarios/ shinies/ tipos/ movimientos/ objetos/ logros/ novedades/
#   en: en/ (el juego en inglés) en/guide/ en/pokedex/ en/legendaries/ ... en/news/
#   zh: zh/ (el juego en chino) zh/guide/ zh/pokedex/ ... zh/news/
#   404.html, robots.txt, sitemap.xml (con las versiones de cada idioma)
import json, os, re, datetime, html

ROOT = os.path.join(os.path.dirname(__file__), '..')
SITE = 'https://pokesurvivor.com/'
TODAY = datetime.date.today().isoformat()
D = json.load(open(os.path.join(ROOT, 'tools', 'cache', 'gamedata.json'), encoding='utf-8'))
DEX = D['dex']; BY = {p['dex']: p for p in DEX}
META = {}
for m in re.finditer(r'^\s*(\d+): (\{.*\}),?\s*$', open(os.path.join(ROOT, 'js/data/sprites-meta.js'), encoding='utf-8').read(), re.M):
    try: META[int(m.group(1))] = json.loads(m.group(2))
    except Exception: pass
esc = html.escape
N = len(DEX)

# ---------------- traducción con el diccionario del juego ----------------
LANGUAGES = ('es', 'en', 'zh-CN')
OG_LOCALES = {'es': 'es_ES', 'en': 'en_US', 'zh-CN': 'zh_CN'}
EN = D['en']
ZH = D['zh']
ZH_PATS = [(re.compile('^' + '(.+?)'.join(re.escape(p) for p in k.split('{x}')) + '$'), v)
           for k, v in sorted(ZH.items(), key=lambda kv: len(kv[0].replace('{x}', '')), reverse=True) if '{x}' in k]
def zh(s):
    if not s or re.fullmatch(r'[\d\s.,×+%–—-]+', s): return s
    if s in ZH: return ZH[s]
    for rx, v in ZH_PATS:
        m = rx.match(s)
        if m:
            args = iter(m.groups())
            return re.sub(r'\{x\}', lambda _: zh(next(args)), v)
    raise ValueError(f'Missing Chinese translation: {s}')

PATS = []
for k, v in EN.items():
    if '{x}' in k:
        parts = [re.escape(p) for p in k.split('{x}')]
        PATS.append((re.compile('^' + '(.+?)'.join(parts) + '$'), v))
def en(s):
    if s in EN: return EN[s]
    for rx, v in PATS:
        m = rx.match(s)
        if m:
            g = iter(m.groups())
            return re.sub(r'\{x\}', lambda _: en(next(g)), v)
    return s
def L(lang, es, eng=None, chinese=None):
    """Texto explícito o traducción del diccionario del juego."""
    if lang == 'zh-CN': return chinese if chinese is not None else zh(es)
    return es if lang == 'es' else (eng if eng is not None else en(es))

GEN = {1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: ('Teselia', 'Unova'), 6: 'Kalos', 7: 'Alola', 8: 'Galar', 9: 'Paldea'}
def gen_name(g, lang):
    v = GEN[g]
    return L(lang, v if isinstance(v, str) else v[0], v if isinstance(v, str) else v[1])
TN = D['typeName']; TC = D['typeColor']; TYPES = D['typeOrder']
def tname(t, lang): return L(lang, TN.get(t, t))
def tbadge(t, lang): return f'<i class="ty" style="background:{TC.get(t, "#888")}">{esc(tname(t, lang))}</i>'
LEG = set(D['legends'])

# ---------------- rutas ----------------
PAGES = ['home', 'guide', 'pokedex', 'legends', 'shinies', 'types', 'moves', 'items', 'achievements', 'news', 'support']
PATH = {
    'es': {'home': '', 'guide': 'guia/', 'pokedex': 'pokedex/', 'legends': 'legendarios/', 'shinies': 'shinies/', 'types': 'tipos/',
           'moves': 'movimientos/', 'items': 'objetos/', 'achievements': 'logros/', 'news': 'novedades/', 'support': 'apoyar/'},
    'en': {'home': 'en/', 'guide': 'en/guide/', 'pokedex': 'en/pokedex/', 'legends': 'en/legendaries/', 'shinies': 'en/shinies/', 'types': 'en/types/',
           'moves': 'en/moves/', 'items': 'en/items/', 'achievements': 'en/achievements/', 'news': 'en/news/', 'support': 'en/support/'},
}
PATH['zh-CN'] = {pid: 'zh/' + path.removeprefix('en/') for pid, path in PATH['en'].items()}
NAV = {'es': [('guide', 'Guía'), ('pokedex', 'Pokédex'), ('legends', 'Legendarios'), ('moves', 'Movimientos'), ('types', 'Tipos')],
       'en': [('guide', 'Guide'), ('pokedex', 'Pokédex'), ('legends', 'Legendaries'), ('moves', 'Moves'), ('types', 'Types')]}
FOOT = {'es': [('guide', 'Guía'), ('pokedex', 'Pokédex'), ('legends', 'Legendarios y arenas'), ('shinies', 'Shinies'), ('types', 'Tabla de tipos'),
               ('moves', 'Movimientos'), ('items', 'Objetos'), ('achievements', 'Logros'), ('news', 'Novedades'), ('support', 'Apoyar el proyecto')],
        'en': [('guide', 'Guide'), ('pokedex', 'Pokédex'), ('legends', 'Legendaries & arenas'), ('shinies', 'Shinies'), ('types', 'Type chart'),
               ('moves', 'Moves'), ('items', 'Items'), ('achievements', 'Achievements'), ('news', 'News'), ('support', 'Support the project')]}

NAV['zh-CN'] = [('guide', '指南'), ('pokedex', '宝可梦图鉴'), ('legends', '传说的宝可梦'), ('moves', '招式'), ('types', '属性')]
FOOT['zh-CN'] = [('guide', '指南'), ('pokedex', '宝可梦图鉴'), ('legends', '传说的宝可梦与竞技场'), ('shinies', '异色宝可梦'), ('types', '属性相克表'),
                 ('moves', '招式'), ('items', '携带物品'), ('achievements', '成就'), ('news', '更新公告'), ('support', '支持项目')]

def rel(frm, to):
    """Ruta relativa entre dos páginas (las dos son carpetas)."""
    up = '../' * frm.count('/')
    return up + to if (up + to) else './'

def page(pid, lang, title, desc, body, ld=None):
    me = PATH[lang][pid]
    up = '../' * me.count('/')
    alts = ''.join(f'<link rel="alternate" hreflang="{l}" href="{SITE}{PATH[l][pid]}">\n' for l in LANGUAGES)
    alts += f'<link rel="alternate" hreflang="x-default" href="{SITE}{PATH["es"][pid]}">\n'
    nav = ''.join(f'<a href="{rel(me, PATH[lang][p])}">{esc(t)}</a>' for p, t in NAV[lang])
    foot = ' · '.join(f'<a href="{rel(me, PATH[lang][p])}">{esc(t)}</a>' for p, t in FOOT[lang])
    play = L(lang, 'Jugar gratis', 'Play free', '免费游玩')
    labels = {'es': 'Español', 'en': 'English', 'zh-CN': '简体中文'}
    switch = ''.join(f'<a class="lang" hreflang="{l}" data-game-lang="{l}" href="{rel(me, PATH[l][pid])}">{labels[l]}</a>' for l in LANGUAGES if l != lang)
    legal = ('PokéSurvivor es un juego de fans <b>gratuito y sin ánimo de lucro</b>, sin anuncios ni compras (sólo donaciones voluntarias para los servidores). No está afiliado a Nintendo, Creatures, '
             'GAME FREAK ni The Pokémon Company; Pokémon y sus personajes son propiedad de sus respectivos dueños. Sprites de PMD SpriteCollab '
             '(CC BY-NC 4.0) · datos de PokéAPI · música y sonidos originales. No tiene ninguna criptomoneda ni token oficial: '
             'cualquiera que use su nombre es de terceros y no nos hacemos cargo de compras ni inversiones. '
             '<b>La única web oficial es pokesurvivor.com</b> y el juego es y será gratis: si alguien te pide pagar, no somos nosotros. '
             'Código bajo PolyForm Noncommercial 1.0.0 (hasta el 14-10-2026, MIT).') if lang == 'es' else (
             'PokéSurvivor is a <b>free, non-profit</b> fan game with no ads or purchases (only voluntary donations for the servers). It is not affiliated with Nintendo, Creatures, GAME FREAK '
             'or The Pokémon Company; Pokémon and its characters are owned by their respective owners. Sprites from PMD SpriteCollab (CC BY-NC 4.0) '
             '· data from PokéAPI · original music and sounds. It has no official cryptocurrency or token: any using its name '
             'belongs to third parties and we take no responsibility for purchases or investments. '
             '<b>The only official website is pokesurvivor.com</b> and the game is and always will be free: if anyone asks you to pay, it isn\'t us. '
             'Code under PolyForm Noncommercial 1.0.0 (MIT up to 14-10-2026).')
    if lang == 'zh-CN':
        legal = ('PokéSurvivor 是<b>免费、非营利</b>的同人游戏，没有广告或内购，仅接受用于服务器费用的自愿捐赠。'
                 '本项目与任天堂、Creatures、GAME FREAK 及 The Pokémon Company 无关联；宝可梦及相关角色的权利归各自权利人所有。'
                 '精灵图像来自 PMD SpriteCollab（CC BY-NC 4.0），数据来自 PokéAPI，音乐与音效为原创。'
                 '本游戏没有官方加密货币或代币，使用游戏名称的代币均由第三方发行，我们不承担相关购买或投资的责任。'
                 '<b>唯一官方网站为 pokesurvivor.com</b>，游戏始终免费；向你收费的网站并非我们。'
                 '代码采用 PolyForm Noncommercial 1.0.0 许可证（2026 年 10 月 14 日及之前的版本采用 MIT 许可证）。')
    ldj = ('<script type="application/ld+json">\n' + json.dumps(ld, ensure_ascii=False) + '\n</script>') if ld else ''
    return f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}{me}">
{alts}<meta name="theme-color" content="#0a1430">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PokéSurvivor">
<meta property="og:locale" content="{OG_LOCALES[lang]}">
<meta property="og:url" content="{SITE}{me}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{SITE}assets/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{up}favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="48x48" href="{up}assets/icons/icon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="{up}assets/icons/icon-96.png">
<link rel="icon" type="image/png" sizes="144x144" href="{up}assets/icons/icon-144.png">
<link rel="apple-touch-icon" href="{up}assets/icons/icon-180.png">
<link rel="stylesheet" href="{up}css/pages.css">
{ldj}
</head>
<body>
<header class="top">
  <a class="brand" data-game-lang="{lang}" href="{rel(me, PATH[lang]['home'])}">PokéSurvivor</a>
  <nav>{nav}{switch}<a class="play" data-game-lang="{lang}" href="{rel(me, PATH[lang]['home'])}">{play}</a></nav>
</header>
<main>
{body}
</main>
<footer>
  <p>{foot}</p>
  <p>{legal}</p>
  <p><a href="https://github.com/JPTER78/pokesurvivor">GitHub</a></p>
</footer>
<script>
document.querySelectorAll('[data-game-lang]').forEach(a => a.addEventListener('click', () => {{
  try {{ localStorage.setItem('ps.lang', a.dataset.gameLang); }} catch (e) {{}}
}}));
</script>
</body>
</html>
'''

def write(pid, lang, html_):
    p = os.path.join(ROOT, PATH[lang][pid], 'index.html')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8', newline='\r\n').write(html_)

def crumbs(pid, lang, name):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'PokéSurvivor', 'item': SITE + PATH[lang]['home']},
        {'@type': 'ListItem', 'position': 2, 'name': name, 'item': SITE + PATH[lang][pid]}]}

def sprite(d, shiny=False, up='../', anim='Idle', lang='es'):
    m = META.get(d, {}).get('a', {}).get(anim)
    if not m: return ''
    k = 2 if max(m['w'], m['h']) <= 48 else 1
    src = f'{up}assets/pokemon/{d}/{"s/" if shiny else ""}{anim}.png'
    return (f'<span class="spr" style="width:{m["w"] * k}px;height:{m["h"] * k}px"><img loading="lazy" decoding="async" src="{src}" '
            f'width="{m["w"]}" height="{m["h"]}" style="transform:scale({k})" alt="{esc(L(lang, BY[d]["name"]))}{(" 异色" if lang == "zh-CN" else " shiny") if shiny else ""}"></span>')

def upof(pid, lang): return '../' * PATH[lang][pid].count('/')
def cta(pid, lang, text):
    return f'<p class="cta"><a class="btn" data-game-lang="{lang}" href="{rel(PATH[lang][pid], PATH[lang]["home"])}">{esc(text)}</a></p>'

# ================= guía =================
FAQ = {
 'es': [
  ('¿PokéSurvivor es gratis?', 'Sí, totalmente. Es un juego de fans sin ánimo de lucro: no tiene anuncios ni compras. Si quieres, puedes apoyarlo con una donación voluntaria, que se usa sólo para los servidores y no da ventajas.'),
  ('¿Hay que descargar algo?', 'No. Se juega en el navegador, en PC, tablet o móvil. Si quieres, puedes instalarlo como app con «Añadir a pantalla de inicio».'),
  ('¿Se puede jugar en el móvil?', 'Sí, en horizontal. Pon el dedo en cualquier parte de la pantalla y arrastra para moverte (el joystick aparece donde tocas), toca un ataque para cambiarlo y el botón de arriba a la derecha para pausar.'),
  ('¿Está en inglés?', 'Sí: el juego está en español, inglés y chino simplificado; puedes cambiar el idioma en Ajustes.'),
  ('¿Puedo jugar con mis amigos?', 'Sí: el modo cooperativo online admite hasta 4 jugadores. Añade a tus amigos por su apodo, invítalos a tu sala y empezad la partida. La experiencia se comparte y podéis revivir a un compañero caído quedándoos a su lado.'),
  ('¿Cuántos Pokémon hay?', f'{N} Pokémon de las 9 regiones (de Kanto a Paldea), todos jugables como compañero y con su versión shiny cuando existe.'),
  ('¿Cómo consigo más Pokémon?', 'Con el gacha, que funciona con tickets que se ganan jugando: los Pokémon normales sueltan tickets de vez en cuando, y los jefes y los legendarios de las grietas, a veces, tickets ×10. No se pueden comprar con dinero real.'),
  ('¿Qué son las grietas?', 'Portales misteriosos que aparecen muy de vez en cuando. Si entras, luchas contra un Pokémon legendario en una arena de su tipo (hay 18 distintas). Si ganas, te llevas premio; si caes, vuelves al mapa.'),
  ('¿Se guarda mi progreso?', 'Con una cuenta (nombre y contraseña o Google) tu partida se guarda en la nube y la puedes seguir en cualquier dispositivo. Como invitado se juega al momento, pero no se guarda.'),
  ('¿Es un juego oficial de Pokémon?', 'No. Es un proyecto hecho por fans, gratuito y sin ánimo de lucro, sin relación con Nintendo, GAME FREAK ni The Pokémon Company.')],
 'en': [
  ('Is PokéSurvivor free?', 'Yes, completely. It\'s a non-profit fan game with no ads or purchases. If you like, you can support it with a voluntary donation, which only pays for the servers and gives no advantages.'),
  ('Do I need to download anything?', 'No. You play in your browser on PC, tablet or phone. If you like, you can install it as an app with “Add to Home Screen”.'),
  ('Can I play on my phone?', 'Yes, in landscape. Put your finger anywhere on the screen and drag to move (the joystick appears where you touch), tap a move to switch to it and the top-right button to pause.'),
  ('Is it in English?', 'Yes: the game supports English, Spanish and Simplified Chinese. You can change the language in Settings.'),
  ('Can I play with my friends?', 'Yes: online co-op supports up to 4 players. Add your friends by nickname, invite them to your room and start the game. Experience is shared and you can revive a fallen teammate by standing next to them.'),
  ('How many Pokémon are there?', f'{N} Pokémon from all 9 regions (Kanto to Paldea), all playable as your partner, with their shiny form when one exists.'),
  ('How do I get more Pokémon?', 'From the gacha, which uses tickets you earn by playing: regular Pokémon drop tickets now and then, and bosses and rift legendaries sometimes drop ×10 tickets. They can\'t be bought with real money.'),
  ('What are rifts?', 'Mysterious portals that open very rarely. If you go in, you fight a legendary Pokémon in an arena of its type (there are 18). Win and you get a reward; fall and you\'re sent back to the map.'),
  ('Is my progress saved?', 'With an account (name and password, or Google) your game is saved in the cloud and you can continue on any device. Guests can play right away, but nothing is saved.'),
  ('Is this an official Pokémon game?', 'No. It\'s a free, non-profit fan project, unrelated to Nintendo, GAME FREAK or The Pokémon Company.')]}

FAQ['zh-CN'] = [
 ('PokéSurvivor 免费吗？', '完全免费。这是一款非营利同人游戏，没有广告或内购。你可以自愿捐赠以支持服务器费用，但不会获得任何游戏优势。'),
 ('需要下载吗？', '无需下载，在电脑、平板或手机的浏览器中即可游玩。也可以通过“添加到主屏幕”将其安装为应用。'),
 ('手机上能玩吗？', '可以，请横屏游玩。在屏幕上拖动手指即可移动，摇杆会出现在触摸位置；轻触招式图标即可切换，点击右上角按钮暂停。'),
 ('支持哪些语言？', '支持简体中文、英语和西班牙语。首次进入时会按页面或浏览器语言选择，也可以在“设置 → 图像 → 语言”中切换。'),
 ('可以和朋友一起玩吗？', '可以，在线合作最多支持 4 人。按昵称添加好友，邀请加入房间后即可开始。队友共享经验值，站在倒下的队友身旁可以将其救起。'),
 ('共有多少只宝可梦？', f'共有来自关都至帕底亚 9 个地区的 {N} 只宝可梦，均可作为伙伴使用；有异色资源的宝可梦也可使用异色形态。'),
 ('如何获得更多宝可梦？', '使用游玩获得的奖券抽取扭蛋。普通宝可梦偶尔会掉落奖券，首领与裂隙中的传说的宝可梦还可能掉落十连奖券。奖券无法用真实货币购买。'),
 ('裂隙是什么？', '地图上不时出现的神秘入口。进入后，你会在对应属性的竞技场中挑战传说的宝可梦，共有 18 种竞技场。胜利可获得奖励，落败则返回地图。'),
 ('游戏进度会保存吗？', '使用账号（用户名与密码或 Google）登录后，进度会保存到云端，可在其他设备上继续。游客可以立即开始游玩，但进度不会保存。'),
 ('这是宝可梦官方游戏吗？', '不是。这是免费、非营利的同人项目，与任天堂、GAME FREAK 及 The Pokémon Company 无关联。')]

def guide(lang):
    pid = 'guide'; me = PATH[lang][pid]
    lk = lambda p: rel(me, PATH[lang][p])
    if lang == 'es':
        body = f'''<article class="doc">
<h1>Guía de PokéSurvivor</h1>
<p class="lead">PokéSurvivor es un <b>juego de supervivencia con Pokémon</b> al estilo de Survivor.io o Vampire Survivors, gratis y en el
navegador: eliges un compañero, te mueves por un mapa infinito y tus ataques salen solos mientras hordas de Pokémon salvajes intentan rodearte.
¿Cuánto aguantarás?</p>
{cta(pid, lang, 'Jugar gratis ahora')}
<h2>Cómo se juega</h2>
<ul>
<li><b>En PC:</b> muévete con <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o las flechas. Cambia de ataque con <kbd>1</kbd>–<kbd>4</kbd>, <kbd>Q</kbd>/<kbd>E</kbd> o haciendo clic en su icono. Pausa con <kbd>Esc</kbd>.</li>
<li><b>En móvil o tablet (horizontal):</b> arrastra el dedo en cualquier parte para moverte, toca un ataque para cambiarlo y el botón de arriba a la derecha para pausar.</li>
<li>Tu Pokémon <b>ataca solo</b> con el movimiento activo. Tú te encargas de esquivar y de colocarte bien.</li>
<li>Recoge la experiencia para <b>subir de nivel</b> y elige entre tres cartas: <a href="{lk('moves')}">movimientos</a> nuevos, mejorar los que tienes o potenciar a tu Pokémon.</li>
</ul>
<h2>Características</h2>
<ul class="feat">
<li><b>{N} Pokémon de las 9 regiones</b> (<a href="{lk('pokedex')}">ver la Pokédex</a>), cada uno con sus ataques y sus propias mejoras permanentes.</li>
<li><b>Los movimientos evolucionan</b>: al nivel máximo y con la mejora adecuada, Ascuas se convierte en Llamarada, Burbuja en Surf…</li>
<li><b>Enemigos con personalidad</b>: hay Pokémon que curan, ponen escudos, invocan ayuda, explotan o disparan rayos avisando en el suelo.</li>
<li><b>Jefes</b> y <a href="{lk('legends')}"><b>grietas</b> con 18 arenas legendarias</a>, una por tipo.</li>
<li><a href="{lk('types')}"><b>Clima y tabla de tipos</b></a>: con lluvia el Agua se potencia y el Fuego se debilita; sol, arena, nieve y niebla.</li>
<li><a href="{lk('shinies')}"><b>Shinies</b></a> salvajes (1 entre 4096) y en el gacha.</li>
<li><b>Gacha con forma de tragaperras</b>, por región, con tickets que se ganan jugando.</li>
<li><a href="{lk('items')}"><b>Objetos equipables</b></a> como Restos, Cinta Elección o Vidasfera.</li>
<li><b>Cooperativo online hasta 4</b> con tu lista de amigos.</li>
<li><b>Misiones</b> diarias y semanales, <a href="{lk('achievements')}"><b>{len(D['achievements'])} logros</b></a> con medallas y títulos, perfil público y ranking.</li>
<li>En <b>español, inglés y chino simplificado</b>, en PC y en móvil, e <b>instalable como app</b>.</li>
</ul>
<h2>Consejos para aguantar más</h2>
<ol>
<li>No te quedes quieto: muévete en círculos amplios para que las hordas te sigan en fila.</li>
<li>Aprovecha la tabla de tipos: cambia al ataque que sea muy eficaz contra lo que tienes delante.</li>
<li>Los avisos en el suelo (círculos y rayas que se llenan) son ataques a punto de caer: sal de ellos.</li>
<li>Elimina primero a los Pokémon que curan o ponen escudos.</li>
<li>Gasta tus monedas en las mejoras de tu compañero favorito.</li>
</ol>
<h2>Preguntas frecuentes</h2>
{''.join(f'<h3>{esc(q)}</h3><p>{esc(a)}</p>' for q, a in FAQ[lang])}
{cta(pid, lang, 'Jugar a PokéSurvivor')}
</article>'''
        title = 'Guía de PokéSurvivor: cómo jugar, trucos y preguntas frecuentes'
        desc = f'Cómo se juega a PokéSurvivor en PC y móvil, sus características ({N} Pokémon, cooperativo, grietas legendarias, gacha), trucos y preguntas frecuentes.'
    elif lang == 'zh-CN':
        body = f'''<article class="doc">
<h1>PokéSurvivor 游戏指南</h1>
<p class="lead">PokéSurvivor 是一款以宝可梦为主题的<b>生存游戏</b>，玩法类似 Survivor.io 或 Vampire Survivors，可直接在浏览器中免费游玩。选择你的伙伴，在无尽地图上移动，自动施放招式，躲避不断包围你的野生宝可梦。你能坚持多久？</p>
{cta(pid, lang, '立即免费游玩')}
<h2>操作方法</h2><ul>
<li><b>电脑：</b>使用 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动。使用 <kbd>1</kbd>–<kbd>4</kbd>、<kbd>Q</kbd>/<kbd>E</kbd> 或点击图标切换招式，按 <kbd>Esc</kbd> 暂停。</li>
<li><b>手机或平板（横屏）：</b>在屏幕上拖动手指即可移动，轻触招式图标切换招式，点击右上角按钮暂停。</li>
<li>宝可梦会使用当前招式<b>自动攻击</b>，你需要专心躲避攻击、调整位置。</li>
<li>收集经验值<b>提升等级</b>，从三张卡牌中选择一张：学习新<a href="{lk('moves')}">招式</a>、升级已有招式，或强化宝可梦。</li></ul>
<h2>游戏内容</h2><ul class="feat">
<li><b>来自 9 个地区的 {N} 只宝可梦</b>（<a href="{lk('pokedex')}">查看图鉴</a>），各有招式与永久强化。</li>
<li><b>招式进化：</b>升到最高等级并获得所需强化后，火花可进化为大字爆炎，泡沫可进化为冲浪。</li>
<li><b>各具特点的敌人：</b>部分宝可梦会治疗、保护同伴、召唤援军、自爆，或施放带预警的光束。</li>
<li><b>首领</b>和通往 <a href="{lk('legends')}">18 座传说竞技场的裂隙</a>，每种属性各一座。</li>
<li><a href="{lk('types')}"><b>天气与属性相克</b></a>：下雨时水属性增强、火属性减弱，此外还有大晴天、沙暴、下雪和雾天。</li>
<li>可在野外遇到<a href="{lk('shinies')}"><b>异色宝可梦</b></a>（概率为 1/4096），也能通过扭蛋获得。</li>
<li>各地区都有<b>老虎机式扭蛋</b>，使用游玩获得的奖券抽取。</li>
<li><a href="{lk('items')}"><b>携带物品</b></a>，包括吃剩的东西、讲究头带和生命宝珠等。</li>
<li>通过好友列表进行<b>最多 4 人的在线合作</b>。</li>
<li>每日与每周<b>任务</b>、附带奖章与称号的 <a href="{lk('achievements')}"><b>{len(D['achievements'])} 项成就</b></a>，以及公开资料与排行榜。</li>
<li>支持<b>简体中文、英语和西班牙语</b>，适配电脑与移动设备，并可<b>安装为应用</b>。</li></ul>
<h2>生存技巧</h2><ol>
<li>保持移动，绕大圈引导敌群，避免被包围。</li><li>利用属性相克，切换对眼前敌人效果绝佳的招式。</li>
<li>地上逐渐填满的圆圈和线条是攻击预警，及时离开标记范围。</li><li>优先击败能治疗或施加护盾的敌人。</li><li>用金币强化最喜欢的伙伴。</li></ol>
<h2>常见问题</h2>{''.join(f'<h3>{esc(q)}</h3><p>{esc(a)}</p>' for q, a in FAQ[lang])}
{cta(pid, lang, '开始游玩 PokéSurvivor')}</article>'''
        title = 'PokéSurvivor 游戏指南：操作、生存技巧与常见问题'
        desc = f'了解 PokéSurvivor 在电脑和手机上的操作、{N} 只宝可梦、在线合作、传说裂隙与扭蛋玩法，以及生存技巧和常见问题。'
    else:
        body = f'''<article class="doc">
<h1>PokéSurvivor guide</h1>
<p class="lead">PokéSurvivor is a free <b>Pokémon survival game</b> in the style of Survivor.io and Vampire Survivors that you play in your
browser: pick a partner, roam an endless map and your moves fire on their own while hordes of wild Pokémon try to surround you.
How long can you last?</p>
{cta(pid, lang, 'Play free now')}
<h2>How to play</h2>
<ul>
<li><b>On PC:</b> move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys. Switch moves with <kbd>1</kbd>–<kbd>4</kbd>, <kbd>Q</kbd>/<kbd>E</kbd> or by clicking their icon. Pause with <kbd>Esc</kbd>.</li>
<li><b>On phone or tablet (landscape):</b> drag your finger anywhere to move, tap a move to switch to it and the top-right button to pause.</li>
<li>Your Pokémon <b>attacks on its own</b> with the active move. Your job is to dodge and position yourself well.</li>
<li>Collect experience to <b>level up</b> and pick one of three cards: new <a href="{lk('moves')}">moves</a>, upgrades to the ones you have, or boosts for your Pokémon.</li>
</ul>
<h2>Features</h2>
<ul class="feat">
<li><b>{N} Pokémon from all 9 regions</b> (<a href="{lk('pokedex')}">see the Pokédex</a>), each with its own moves and permanent upgrades.</li>
<li><b>Moves evolve</b>: at max level with the right upgrade, Ember becomes Fire Blast, Bubble becomes Surf…</li>
<li><b>Enemies with personality</b>: some Pokémon heal, shield their allies, summon help, explode or fire telegraphed beams.</li>
<li><b>Bosses</b> and <a href="{lk('legends')}"><b>rifts</b> with 18 legendary arenas</a>, one per type.</li>
<li><a href="{lk('types')}"><b>Weather and type chart</b></a>: in the rain Water gets stronger and Fire weaker; plus sun, sand, snow and fog.</li>
<li>Wild <a href="{lk('shinies')}"><b>shinies</b></a> (1 in 4096) and in the gacha.</li>
<li>A <b>slot-machine gacha</b> for each region, with tickets you earn by playing.</li>
<li><a href="{lk('items')}"><b>Held items</b></a> such as Leftovers, Choice Band and Life Orb.</li>
<li><b>Online co-op for up to 4</b> with your friends list.</li>
<li>Daily and weekly <b>missions</b>, <a href="{lk('achievements')}"><b>{len(D['achievements'])} achievements</b></a> with medals and titles, a public profile and leaderboards.</li>
<li>In <b>English, Spanish and Simplified Chinese</b>, on PC and mobile, and <b>installable as an app</b>.</li>
</ul>
<h2>Tips to survive longer</h2>
<ol>
<li>Don't stand still: move in wide circles so the hordes follow you in a line.</li>
<li>Use the type chart: switch to the move that's super effective against what's in front of you.</li>
<li>Markers on the ground (circles and lines filling up) are attacks about to land: step out of them.</li>
<li>Take out healers and shield-casters first.</li>
<li>Spend your coins on upgrades for your favorite partner.</li>
</ol>
<h2>Frequently asked questions</h2>
{''.join(f'<h3>{esc(q)}</h3><p>{esc(a)}</p>' for q, a in FAQ[lang])}
{cta(pid, lang, 'Play PokéSurvivor')}
</article>'''
        title = 'PokéSurvivor guide: how to play, tips and FAQ'
        desc = f'How to play PokéSurvivor on PC and mobile, its features ({N} Pokémon, online co-op, legendary rifts, gacha), tips and frequently asked questions.'
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in FAQ[lang]]},
        crumbs(pid, lang, L(lang, 'Guía', 'Guide', '指南'))]}
    write(pid, lang, page(pid, lang, title, desc, body, ld))

# ================= Pokédex =================
def dexcard(e, lang, up):
    d = e['dex']
    tag = f'<b class="leg">{L(lang, "Legendario", "Legendary", "传说的宝可梦")}</b>' if d in LEG else (
          f'<b class="st">{L(lang, "Inicial", "Starter", "最初的伙伴")}</b>' if e.get('starter') else '')
    return (f'<li id="p{d}">{sprite(d, up=up, lang=lang)}<span class="n">#{d:03d}</span><span class="nm">{esc(L(lang, e["name"]))}</span>'
            f'<span class="tys">{"".join(tbadge(t, lang) for t in e.get("types", []))}</span>{tag}</li>')

def pokedex(lang):
    pid = 'pokedex'; up = upof(pid, lang)
    secs = []
    for g in range(1, 10):
        mons = [e for e in DEX if e.get('gen') == g]
        gn = gen_name(g, lang)
        head = L(lang, f'(generación {g} · {len(mons)} Pokémon)', f'(generation {g} · {len(mons)} Pokémon)', f'（第 {g} 世代 · {len(mons)} 只宝可梦）')
        secs.append(f'<section id="{gn.lower()}"><h2>{gn} <small>{head}</small></h2><ul class="dexgrid">{"".join(dexcard(e, lang, up) for e in mons)}</ul></section>')
    gens = ''.join(f'<a href="#{gen_name(g, lang).lower()}">{gen_name(g, lang)}</a>' for g in range(1, 10))
    if lang == 'es':
        h1, lead, c = f'Pokédex de PokéSurvivor: los {N} Pokémon jugables', (f'Todos estos Pokémon pueden ser tu compañero en PokéSurvivor, el juego gratis de supervivencia con Pokémon para '
              f'navegador y móvil. Hay {N} de las 9 regiones; los consigues como compañero inicial o en el gacha (con tickets que se ganan jugando), y también '
              f'aparecen como enemigos salvajes, jefes y legendarios en las grietas.'), 'Elige tu compañero y juega gratis'
        title, desc = f'Pokédex de PokéSurvivor: los {N} Pokémon jugables (9 regiones)', f'Lista completa de los {N} Pokémon que puedes usar en PokéSurvivor, de Kanto a Paldea, con sus tipos. Juego de Pokémon gratis en el navegador.'
    elif lang == 'zh-CN':
        h1 = f'PokéSurvivor 宝可梦图鉴：{N} 只可用伙伴'
        lead = f'图鉴中的每一只宝可梦都能成为你的伙伴。本作共有来自 9 个地区的 {N} 只宝可梦，可在开局选择或通过扭蛋获得，奖券由游玩赚取。它们也会作为野生敌人、首领或裂隙中的传说的宝可梦出现。'
        c = '选择伙伴，免费游玩'
        title, desc = f'PokéSurvivor 宝可梦图鉴：9 个地区的 {N} 只伙伴', f'查看 PokéSurvivor 全部 {N} 只可用宝可梦及其属性，涵盖关都到帕底亚的 9 个地区。'
    else:
        h1, lead, c = f'PokéSurvivor Pokédex: all {N} playable Pokémon', (f'Every one of these Pokémon can be your partner in PokéSurvivor, the free Pokémon survival game for your browser and phone. '
              f'There are {N} from all 9 regions; you get them as a starter or from the gacha (with tickets you earn by playing), and they also show up as wild '
              f'enemies, bosses and legendaries in rifts.'), 'Pick your partner and play free'
        title, desc = f'PokéSurvivor Pokédex: all {N} playable Pokémon (9 regions)', f'The full list of the {N} Pokémon you can play in PokéSurvivor, from Kanto to Paldea, with their types. A free Pokémon game in your browser.'
    body = f'<article class="doc wide"><h1>{esc(h1)}</h1><p class="lead">{esc(lead)}</p><nav class="gens">{gens}</nav>{"".join(secs)}{cta(pid, lang, c)}</article>'
    ld = {'@context': 'https://schema.org', '@graph': [{'@type': 'CollectionPage', 'name': h1, 'url': SITE + PATH[lang][pid], 'inLanguage': lang}, crumbs(pid, lang, L(lang, 'Pokédex', 'Pokédex', '宝可梦图鉴'))]}
    write(pid, lang, page(pid, lang, title, desc, body, ld))

# ================= legendarios y arenas =================
def legends(lang):
    pid = 'legends'; up = upof(pid, lang)
    cards = ''.join(dexcard(BY[d], lang, up) for d in sorted(LEG))
    ar = ''.join(f'<li>{tbadge(t, lang)} <b>{esc(L(lang, D["arenas"][t]))}</b></li>' for t in TYPES if t in D['arenas'])
    if lang == 'es':
        h1 = 'Legendarios y grietas: las 18 arenas de PokéSurvivor'
        intro = ('<p class="lead">De vez en cuando se abre una <b>grieta misteriosa</b> en el mapa. Si entras, te enfrentas a un <b>Pokémon legendario</b> '
                 'en una arena de su tipo, con su propio terreno y clima. Si ganas te llevas un <b>ticket ×10</b> para el gacha; si caes, vuelves al mapa sin premio. '
                 'En grupo, entráis todos juntos.</p>')
        h2a, h2b = '18 arenas, una por tipo', f'Los {len(LEG)} legendarios'
        tip = '<p>Los legendarios de dos tipos eligen uno al azar para la arena. El terreno cuenta: hay lava que quema, hielo que resbala, agua que frena…</p>'
        title, desc, c = 'Legendarios y grietas de PokéSurvivor: las 18 arenas por tipo', f'Cómo funcionan las grietas de PokéSurvivor, las 18 arenas legendarias (una por tipo) y los {len(LEG)} Pokémon legendarios a los que te puedes enfrentar.', 'Busca una grieta: jugar gratis'
    elif lang == 'zh-CN':
        h1 = '传说的宝可梦与裂隙：18 座竞技场'
        intro = ('<p class="lead">地图上会不时出现<b>神秘裂隙</b>。进入后，你将在对应属性的竞技场中挑战<b>传说的宝可梦</b>，每座竞技场都有自己的地形和天气。'
                 '获胜可获得一张<b>十连奖券</b>；落败则返回地图，没有奖励。合作游玩时，全队会一起进入。</p>')
        h2a, h2b = '18 座竞技场，每种属性各一座', f'{len(LEG)} 只传说的宝可梦'
        tip = '<p>双属性的传说的宝可梦会随机选择其中一种属性作为竞技场属性。注意地形：熔岩会灼伤，冰面会打滑，水域会减速。</p>'
        title, desc, c = 'PokéSurvivor 传说的宝可梦、裂隙与竞技场', f'了解裂隙的挑战方式、18 座属性竞技场，以及可挑战的 {len(LEG)} 只传说的宝可梦。', '寻找裂隙，免费游玩'
    else:
        h1 = 'Legendaries and rifts: PokéSurvivor\'s 18 arenas'
        intro = ('<p class="lead">Every now and then a <b>mysterious rift</b> opens on the map. Step inside and you face a <b>legendary Pokémon</b> in an arena '
                 'of its type, with its own terrain and weather. Win and you get a <b>×10 ticket</b> for the gacha; fall and you\'re sent back to the map with no reward. '
                 'In a group, you all go in together.</p>')
        h2a, h2b = '18 arenas, one per type', f'The {len(LEG)} legendaries'
        tip = '<p>Dual-type legendaries pick one of their types at random for the arena. Terrain matters: lava burns, ice is slippery, water slows you down…</p>'
        title, desc, c = 'PokéSurvivor legendaries and rifts: the 18 type arenas', f'How rifts work in PokéSurvivor, the 18 legendary arenas (one per type) and the {len(LEG)} legendary Pokémon you can battle.', 'Find a rift: play free'
    body = f'<article class="doc wide"><h1>{esc(h1)}</h1>{intro}<h2>{h2a}</h2><ul class="arenas">{ar}</ul>{tip}<h2>{h2b}</h2><ul class="dexgrid">{cards}</ul>{cta(pid, lang, c)}</article>'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= shinies =================
SHOW = [1, 4, 7, 25, 133, 6, 150, 151, 152, 155, 158, 249, 250, 252, 255, 258, 384, 393, 448, 445, 495, 658, 722, 906]
def shinies(lang):
    pid = 'shinies'; up = upof(pid, lang)
    pairs = ''.join(f'<li><span class="pair">{sprite(d, up=up, lang=lang)}{sprite(d, True, up=up, lang=lang)}</span><span class="nm">{esc(L(lang, BY[d]["name"]))}</span></li>'
                    for d in SHOW if META.get(d, {}).get('sh'))
    if lang == 'es':
        h1 = 'Shinies en PokéSurvivor: cómo conseguirlos'
        body = f'''<article class="doc wide"><h1>{h1}</h1>
<p class="lead">Los <b>shiny</b> son versiones de otro color, muy raras. En PokéSurvivor casi todos los {N} Pokémon tienen su forma shiny, con sprites de verdad.</p>
<h2>Cómo conseguirlos</h2>
<ul><li><b>Salvajes:</b> cada Pokémon que aparece tiene <b>1 entre 4096</b> de salir shiny (como en los juegos clásicos). Lo verás brillar y saldrá un aviso: derrótalo y es tuyo.</li>
<li><b>En el gacha:</b> cada tirada tiene <b>1 entre 100</b> de ser shiny.</li>
<li>Un shiny repetido da el triple de Pokémonedas.</li>
<li>Cuando tienes la forma shiny de tu compañero, puedes jugar con ella (se elige en la colección).</li></ul>
<h2>Normal y shiny</h2><ul class="dexgrid pairs">{pairs}</ul>{cta(pid, lang, 'Sal a cazar shinies')}</article>'''
        title, desc = 'Shinies en PokéSurvivor: probabilidades y cómo conseguirlos', 'Cómo conseguir Pokémon shiny en PokéSurvivor: 1 entre 4096 en estado salvaje y 1 entre 100 en el gacha. Galería de formas normales y shiny.'
    elif lang == 'zh-CN':
        h1 = 'PokéSurvivor 异色宝可梦：获取方式与概率'
        body = f'''<article class="doc wide"><h1>{h1}</h1>
<p class="lead"><b>异色宝可梦</b>拥有与平常不同的颜色，十分稀有。本作的 {N} 只宝可梦中，几乎每一只都有独立的异色精灵图像。</p>
<h2>获取方式</h2><ul><li><b>野外：</b>每只出现的宝可梦都有 <b>1/4096</b> 的概率为异色。出现时会闪光并显示提示，击败后即可获得。</li>
<li><b>扭蛋：</b>每次抽取有 <b>1/100</b> 的概率获得异色宝可梦。</li><li>重复获得异色宝可梦可得到三倍宝可币。</li>
<li>获得伙伴的异色形态后，即可在收藏中选择并使用。</li></ul>
<h2>通常颜色与异色对照</h2><ul class="dexgrid pairs">{pairs}</ul>{cta(pid, lang, '寻找异色宝可梦')}</article>'''
        title, desc = h1, '了解异色宝可梦的获取方式：野外概率为 1/4096，扭蛋概率为 1/100，并查看通常颜色与异色的对照图。'
    else:
        h1 = 'Shinies in PokéSurvivor: how to get them'
        body = f'''<article class="doc wide"><h1>{h1}</h1>
<p class="lead"><b>Shiny</b> Pokémon are rare, differently colored versions. In PokéSurvivor almost all {N} Pokémon have a shiny form, with real sprites.</p>
<h2>How to get them</h2>
<ul><li><b>In the wild:</b> every Pokémon that spawns has a <b>1 in 4096</b> chance of being shiny (just like the classic games). You'll see it sparkle and get an alert: defeat it and it's yours.</li>
<li><b>From the gacha:</b> every pull has a <b>1 in 100</b> chance of being shiny.</li>
<li>A duplicate shiny gives triple PokéCoins.</li>
<li>Once you own your partner's shiny form, you can play with it (pick it in your collection).</li></ul>
<h2>Normal and shiny</h2><ul class="dexgrid pairs">{pairs}</ul>{cta(pid, lang, 'Go shiny hunting')}</article>'''
        title, desc = 'Shinies in PokéSurvivor: odds and how to get them', 'How to get shiny Pokémon in PokéSurvivor: 1 in 4096 in the wild and 1 in 100 from the gacha. A gallery of normal and shiny forms.'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= tabla de tipos =================
def types_page(lang):
    pid = 'types'
    M = D['matrix']
    def cell(v):
        cls = 'x16' if v > 1.05 else ('x03' if v < 0.35 else ('x06' if v < 0.95 else ''))
        num = f'{v:g}'.replace('.', ',') if lang == 'es' else f'{v:g}'
        return f'<td class="{cls}">{"×" + num if cls else ""}</td>'
    head = ''.join(f'<th class="vt" title="{esc(tname(t, lang))}"><span style="background:{TC[t]}">{esc(tname(t, lang)[:3])}</span></th>' for t in TYPES)
    rows = ''.join(f'<tr><th>{tbadge(a, lang)}</th>{"".join(cell(M[a][d]) for d in TYPES)}</tr>' for a in TYPES)
    table = f'<div class="tablewrap"><table class="chart" id="chart"><thead><tr><th></th>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
    script = '''<script>
document.querySelectorAll('#chart td').forEach(td => {
  td.onmouseenter = () => { const r = td.parentElement, i = [...r.children].indexOf(td);
    document.querySelectorAll('#chart tr').forEach(tr => tr.children[i] && tr.children[i].classList.add('hl')); r.classList.add('hl'); };
  td.onmouseleave = () => document.querySelectorAll('#chart .hl').forEach(e => e.classList.remove('hl'));
});
</script>'''
    if lang == 'es':
        h1 = 'Tabla de tipos de PokéSurvivor'
        intro = ('<p class="lead">La tabla de tipos de los juegos, pero <b>suavizada</b> para un survivor (sólo llevas un ataque activo y no puedes cambiar '
                 'de Pokémon): lo muy eficaz hace <b>×1,6</b>, lo poco eficaz <b>×0,6</b> y las inmunidades se quedan en <b>×0,3</b>. Con dos tipos se multiplican '
                 '(tope ×2,4). Vale en los dos sentidos: tus ataques contra los enemigos y los suyos contra ti.</p>'
                 '<p>Filas: tipo del ataque · columnas: tipo del Pokémon que lo recibe.</p>')
        wx = ('<h2>El clima también cuenta</h2><ul><li><b>Lluvia:</b> el Agua se potencia y el Fuego se debilita.</li><li><b>Sol abrasador:</b> el Fuego se potencia y el Agua se debilita.</li>'
              '<li><b>Tormenta de arena:</b> Roca, Tierra y Acero se potencian; el resto sufre.</li><li><b>Nevada:</b> el Hielo se potencia; el resto sufre y va más lento.</li>'
              '<li><b>Niebla:</b> Fantasma, Hada y Psíquico se potencian.</li></ul>')
        title, desc, c = 'Tabla de tipos de PokéSurvivor (interactiva) y efectos del clima', 'Tabla de tipos interactiva de PokéSurvivor: multiplicadores ×1,6 / ×0,6 / ×0,3 para los 18 tipos y cómo afectan la lluvia, el sol, la arena, la nieve y la niebla.', 'Ponlo en práctica: jugar gratis'
    elif lang == 'zh-CN':
        h1 = 'PokéSurvivor 属性相克表'
        intro = ('<p class="lead">本作参考宝可梦游戏的属性相克关系，并为生存玩法<b>调整了倍率</b>：你只能使用一个当前招式，也无法中途更换宝可梦。'
                 '效果绝佳为 <b>×1.6</b>，效果不好为 <b>×0.6</b>，原本无效的攻击改为 <b>×0.3</b>。双属性的倍率相乘，最高为 ×2.4。'
                 '这一规则同时适用于你对敌人和敌人对你造成的伤害。</p><p>行表示攻击招式的属性，列表示受击宝可梦的属性。</p>')
        wx = ('<h2>天气的影响</h2><ul><li><b>下雨：</b>水属性增强，火属性减弱。</li><li><b>大晴天：</b>火属性增强，水属性减弱。</li>'
              '<li><b>沙暴：</b>岩石、地面和钢属性增强，其他属性受到不利影响。</li><li><b>下雪：</b>冰属性增强，其他属性受到不利影响并减速。</li>'
              '<li><b>雾天：</b>幽灵、妖精和超能力属性增强。</li></ul>')
        title, desc, c = 'PokéSurvivor 互动属性相克表与天气效果', '查看 18 种属性的伤害倍率（×1.6、×0.6、×0.3），以及下雨、大晴天、沙暴、下雪与雾天对战斗的影响。', '开始实战，免费游玩'
    else:
        h1 = 'PokéSurvivor type chart'
        intro = ('<p class="lead">The type chart from the main games, but <b>softened</b> for a survivor game (you only have one active move and can\'t swap Pokémon): '
                 'super effective deals <b>×1.6</b>, not very effective <b>×0.6</b>, and immunities become <b>×0.3</b>. Two types multiply (capped at ×2.4). '
                 'It works both ways: your attacks against enemies and theirs against you.</p><p>Rows: attacking type · columns: type of the Pokémon being hit.</p>')
        wx = ('<h2>Weather matters too</h2><ul><li><b>Rain:</b> Water is boosted and Fire is weakened.</li><li><b>Harsh sunlight:</b> Fire is boosted and Water is weakened.</li>'
              '<li><b>Sandstorm:</b> Rock, Ground and Steel are boosted; the rest suffer.</li><li><b>Snowfall:</b> Ice is boosted; the rest suffer and slow down.</li>'
              '<li><b>Fog:</b> Ghost, Fairy and Psychic are boosted.</li></ul>')
        title, desc, c = 'PokéSurvivor type chart (interactive) and weather effects', 'Interactive PokéSurvivor type chart: ×1.6 / ×0.6 / ×0.3 multipliers for all 18 types, plus how rain, sun, sand, snow and fog change the fight.', 'Put it into practice: play free'
    body = f'<article class="doc wide"><h1>{h1}</h1>{intro}{table}{wx}{cta(pid, lang, c)}</article>{script}'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= movimientos =================
KIND = {'es': {'projectile': 'Proyectil', 'melee': 'Cuerpo a cuerpo', 'beam': 'Rayo', 'orbit': 'Órbita', 'nova': 'Ráfaga', 'aura': 'Aura', 'buff': 'Mejora',
               'boomerang': 'Bumerán', 'chain': 'Cadena', 'mine': 'Minas', 'meteor': 'Meteoros', 'turret': 'Torreta', 'dash': 'Embestida',
               'trail': 'Rastro', 'cone': 'Abanico'},
        'en': {'projectile': 'Projectile', 'melee': 'Melee', 'beam': 'Beam', 'orbit': 'Orbit', 'nova': 'Burst', 'aura': 'Aura', 'buff': 'Buff',
               'boomerang': 'Boomerang', 'chain': 'Chain', 'mine': 'Mines', 'meteor': 'Meteors', 'turret': 'Turret', 'dash': 'Dash',
               'trail': 'Trail', 'cone': 'Spray'}}
KIND['zh-CN'] = {'projectile': '弹丸', 'melee': '近战', 'beam': '光束', 'orbit': '环绕', 'nova': '爆发', 'aura': '光环', 'buff': '强化',
                 'boomerang': '回旋', 'chain': '连锁', 'mine': '地雷', 'meteor': '流星', 'turret': '炮台', 'dash': '突进', 'trail': '轨迹', 'cone': '扇形'}
def moves_page(lang):
    pid = 'moves'
    rows = []
    for t in TYPES:
        for m in [x for x in D['moves'] if x['type'] == t]:
            evo = m['evo']
            evo_txt = (f'<b>{esc(L(lang, evo["name"]))}</b><small>{L(lang, "con", "with", "需要")} {esc(L(lang, evo["needs"]))} · {esc(L(lang, evo["text"]))}</small>' if evo else '—')
            rows.append(f'<tr><td><b>{esc(L(lang, m["name"]))}</b></td><td>{tbadge(t, lang)}</td><td>{KIND[lang].get(m["kind"], m["kind"])}</td>'
                        f'<td>{esc(L(lang, m["desc"]))}</td><td class="evo">{evo_txt}</td></tr>')
    th = ('<th>Movimiento</th><th>Tipo</th><th>Clase</th><th>Qué hace</th><th>Evoluciona a</th>' if lang == 'es'
          else '<th>Move</th><th>Type</th><th>Kind</th><th>What it does</th><th>Evolves into</th>')
    if lang == 'zh-CN': th = '<th>招式</th><th>属性</th><th>攻击方式</th><th>效果</th><th>进化招式</th>'
    nevo = sum(1 for m in D['moves'] if m['evo'])
    nm = len(D['moves'])
    if lang == 'es':
        h1 = 'Movimientos de PokéSurvivor y sus evoluciones'
        intro = (f'<p class="lead">Hay <b>{nm} movimientos</b> de los 18 tipos. Tu Pokémon ataca solo con el activo, y al subir de nivel eliges cartas '
                 f'para aprender otros o mejorarlos hasta el nivel 5. <b>{nevo} pueden evolucionar</b>: llévalos al nivel máximo, consigue la carta de mejora '
                 f'que indican (Potencia, Vigor, Reflejos…) y aparecerá una carta dorada de evolución.</p>')
        title, desc, c = f'Movimientos de PokéSurvivor: los {nm} ataques y sus evoluciones', f'Lista de los {nm} movimientos de PokéSurvivor por tipo, qué hace cada uno y en qué evoluciona (Ascuas → Llamarada, Burbuja → Surf…).', 'Pruébalos: jugar gratis'
    elif lang == 'zh-CN':
        h1 = 'PokéSurvivor 招式与招式进化'
        intro = (f'<p class="lead">本作共有涵盖 18 种属性的 <b>{nm} 个招式</b>。宝可梦会自动使用当前招式攻击；升级时可选择卡牌学习新招式，或将已有招式提升至 5 级。'
                 f'其中 <b>{nevo} 个招式可以进化</b>：升至最高等级，并获得所需的强化卡牌（威力、活力、反应等），即可遇到金色的招式进化卡牌。</p>')
        title, desc, c = f'PokéSurvivor 招式一览：{nm} 个招式与进化条件', f'查看 {nm} 个招式的属性、攻击方式、效果与进化条件，包括火花 → 大字爆炎、泡沫 → 冲浪等。', '试试这些招式'
    else:
        h1 = 'PokéSurvivor moves and their evolutions'
        intro = (f'<p class="lead">There are <b>{nm} moves</b> across all 18 types. Your Pokémon attacks on its own with the active one, and when you level up '
                 f'you pick cards to learn new moves or upgrade them up to level 5. <b>{nevo} of them can evolve</b>: max them out, get the upgrade card they ask for '
                 f'(Power, Vigor, Reflexes…) and a golden evolution card will appear.</p>')
        title, desc, c = f'PokéSurvivor moves: all {nm} attacks and their evolutions', f'All {nm} PokéSurvivor moves by type, what each one does and what it evolves into (Ember → Fire Blast, Bubble → Surf…).', 'Try them: play free'
    hint = '<p>表格可左右滑动，查看完整招式信息。</p>' if lang == 'zh-CN' else ''
    body = f'<article class="doc wide"><h1>{h1}</h1>{intro}{hint}<div class="tablewrap"><table class="list moves"><thead><tr>{th}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>{cta(pid, lang, c)}</article>'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= objetos =================
def items_page(lang):
    pid = 'items'
    rows = ''.join(f'<li><b>{esc(L(lang, i["name"]))}</b><span>{esc(L(lang, i["desc"]))}</span></li>' for i in D['items'])
    ni = len(D['items'])
    if lang == 'es':
        h1 = 'Objetos equipables de PokéSurvivor'
        intro = ('<p class="lead">Durante la partida puedes encontrar <b>objetos equipables</b> en los cofres y al derrotar a los jefes. Sólo puedes llevar <b>uno</b> '
                 'a la vez: si encuentras otro, eliges con cuál quedarte. Duran lo que dura la run.</p>')
        title, desc, c = f'Objetos de PokéSurvivor: los {ni} objetos equipables', f'Los {ni} objetos equipables de PokéSurvivor (Restos, Cinta Elección, Banda Focus, Vidasfera…) y qué hace cada uno.', 'Encuéntralos: jugar gratis'
    elif lang == 'zh-CN':
        h1 = 'PokéSurvivor 携带物品'
        intro = '<p class="lead">游玩时可从宝箱或击败首领的奖励中获得<b>携带物品</b>。同一时间只能携带<b>一件</b>，获得新物品时需要选择保留哪一件。物品效果持续至本局结束。</p>'
        title, desc, c = f'PokéSurvivor 携带物品一览：{ni} 件物品', f'查看全部 {ni} 件携带物品及其效果，包括吃剩的东西、讲究头带、气势披带、生命宝珠等。', '进入游戏，寻找物品'
    else:
        h1 = 'PokéSurvivor held items'
        intro = ('<p class="lead">During a run you can find <b>held items</b> in chests and by defeating bosses. You can only hold <b>one</b> at a time: '
                 'if you find another, you choose which one to keep. They last for the whole run.</p>')
        title, desc, c = f'PokéSurvivor items: all {ni} held items', f'The {ni} held items in PokéSurvivor (Leftovers, Choice Band, Focus Sash, Life Orb…) and what each one does.', 'Find them: play free'
    body = f'<article class="doc"><h1>{h1}</h1>{intro}<ul class="items">{rows}</ul>{cta(pid, lang, c)}</article>'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= logros =================
def ach_page(lang):
    pid = 'achievements'
    cats = D['achCats'] or []
    secs = []
    for cid, cname in cats:
        items = [a for a in D['achievements'] if a['cat'] == cid]
        if not items: continue
        li = ''.join('<li><b>' + esc(L(lang, a['name'])) + '</b><span>' + esc(L(lang, a['desc'])) + '</span>'
                     + ('<em>' + esc(L(lang, a['title'])) + '</em>' if a['title'] else '') + '</li>' for a in items)
        secs.append(f'<h2>{esc(L(lang, cname))} <small>({len(items)})</small></h2><ul class="items ach">{li}</ul>')
    na = len(D['achievements'])
    if lang == 'es':
        h1 = f'Los {na} logros de PokéSurvivor'
        intro = ('<p class="lead">Cada logro da una <b>medalla</b>, un <b>premio</b> (tickets y monedas) y, los más difíciles, un <b>título</b> para tu perfil público. '
                 'Hay uno por cada legendario, por coleccionar Pokémon, por aguantar, por derrotar jefes, por evolucionar movimientos…</p>'
                 '<p>En cursiva, el título que desbloquea.</p>')
        title, desc, c = f'Logros de PokéSurvivor: los {na} logros, medallas y títulos', f'Lista completa de los {na} logros de PokéSurvivor con sus medallas y títulos: colección, supervivencia, combate, grietas y legendarios.', 'Empieza a conseguirlos'
    elif lang == 'zh-CN':
        h1 = f'PokéSurvivor 成就一览：{na} 项成就'
        intro = ('<p class="lead">完成成就可获得<b>奖章</b>与<b>奖券、金币奖励</b>，部分高难度成就还能解锁公开资料中的<b>称号</b>。'
                 '挑战涵盖传说的宝可梦、收集、生存、击败首领与招式进化等内容。</p><p>斜体文字表示该成就解锁的称号。</p>')
        title, desc, c = h1 + '、奖章与称号', f'查看全部 {na} 项成就与解锁条件，涵盖收集、生存、战斗、裂隙及传说的宝可梦。', '开始挑战成就'
    else:
        h1 = f'All {na} PokéSurvivor achievements'
        intro = ('<p class="lead">Every achievement gives you a <b>medal</b>, a <b>reward</b> (tickets and coins) and, for the hardest ones, a <b>title</b> for your public profile. '
                 'There\'s one for each legendary, for collecting Pokémon, surviving, defeating bosses, evolving moves…</p><p>In italics, the title it unlocks.</p>')
        title, desc, c = f'PokéSurvivor achievements: all {na} achievements, medals and titles', f'The full list of the {na} PokéSurvivor achievements with their medals and titles: collection, survival, combat, rifts and legendaries.', 'Start unlocking them'
    body = f'<article class="doc wide"><h1>{h1}</h1>{intro}{"".join(secs)}{cta(pid, lang, c)}</article>'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= novedades =================
NEWS = [
 ('2026-10-15', ('Guías en chino simplificado', 'Simplified Chinese guides', '简体中文指南'),
  ('Las guías y las páginas de datos ya están disponibles en chino simplificado, con los mismos nombres que en el juego.', 'The guides and reference pages now support Simplified Chinese and use the same names as the game.', '指南与资料页现已支持简体中文，宝可梦、招式和道具名称与游戏保持一致。')),
 ('2026-10-14', ('Coloca los botones a tu gusto en el móvil', 'Place the buttons your way on mobile', '在手机上自由摆放按钮'),
  ('En Ajustes > Controles > Colocar los botones puedes arrastrar los ataques, la pausa y el joystick a donde quieras, y elegir un joystick fijo.', 'In Settings > Controls > Place the buttons you can drag the attacks, the pause button and the joystick wherever you want, and choose a fixed joystick.', '在“设置 → 操作 → 调整按钮位置”中，可以拖动招式、暂停按钮和摇杆，还可以选择固定摇杆。')),
 ('2026-10-14', ('La única web oficial es pokesurvivor.com', 'The only official website is pokesurvivor.com', '唯一官方网站为 pokesurvivor.com'),
  ('PokéSurvivor es y será gratis. Si alguna otra web te pide pagar por tickets, monedas o lo que sea, no somos nosotros: es una copia. Desde hoy el código del juego va bajo una licencia no comercial (PolyForm Noncommercial 1.0.0).', 'PokéSurvivor is and always will be free. If any other website asks you to pay for tickets, coins or anything else, it isn’t us: it is a copy. From today the game’s code is under a non-commercial license (PolyForm Noncommercial 1.0.0).', 'PokéSurvivor 始终免费。要求为奖券、金币或其他内容付费的网站并非我们，而是仿冒网站。从今天起，游戏代码采用非商业许可证 PolyForm Noncommercial 1.0.0。')),
 ('2026-10-14', ('Recupera tu cuenta con Gmail', 'Recover your account with Gmail', '使用 Gmail 找回账号'),
  ('Si juegas con nombre y contraseña, ya puedes vincular tu Gmail: si olvidas la contraseña, entras con Google y es tu misma cuenta.', 'If you play with a name and password, you can now link your Gmail: if you forget your password, sign in with Google and it is the same account.', '使用用户名和密码游玩的玩家，现在可以绑定 Gmail。忘记密码后，通过 Google 登录即可找回同一账号。')),
 ('2026-10-13', ('La Sentencia de Arceus', 'The Judgment of Arceus', '阿尔宙斯的制裁'),
  ('Al llegar al minuto 30, Arceus baja del cielo y te lleva a las Ruinas del Juicio: es invencible, te persigue cada vez más deprisa y cada 5 segundos acude un legendario con el doble de vida y de daño que el anterior. Tres logros nuevos, música nueva y el ranking histórico empieza de cero.', 'At minute 30, Arceus descends from the sky and takes you to the Ruins of Judgment: it is invincible, chases you faster and faster, and every 5 seconds a legendary joins with twice the HP and damage of the previous one. Three new achievements, new music, and the all-time leaderboard starts from scratch.', '到达第 30 分钟时，阿尔宙斯会从天而降，将你带往制裁遗迹。它无法被击败，并会越来越快地追赶你；每隔 5 秒，还会出现一只传说的宝可梦，其 HP 与伤害是上一只的两倍。新增三项成就和战斗音乐，历史排行榜重新开始统计。')),
 ('2026-10-12', ('Partidas sin límite, grietas con menos azar y novedades en el juego', 'Endless runs, less random rifts and a "What\'s new" screen', '无限时长的对局、更稳定的裂隙与游戏内公告'),
  ('Arreglado el fallo que dejaba la pantalla en negro o subía de nivel sin fin pasados 84 minutos; si algo falla, la partida se guarda sola. Las grietas salen como mucho cada 2,5 minutos y los legendarios que te faltan aparecen más. Los curanderos curan según lo fuerte que pegas, con tope. En cooperativo, si el anfitrión cambia de pestaña la partida se pausa para todos. Arreglos para iPhone, selector shiny en el menú, ataques cuerpo a cuerpo más fuertes y un botón de Novedades dentro del juego.', 'Fixed the bug that turned the screen black or levelled you up forever after 84 minutes; if something fails, the run saves itself. Rifts show up at least every 2.5 minutes and the legendaries you are missing appear more often. Healers heal based on how hard you hit, with a cap. In co-op, if the host switches tabs the run pauses for everyone. iPhone fixes, a shiny toggle in the menu, stronger melee attacks and a "What\'s new" button inside the game.', '修复了对局超过 84 分钟后黑屏或无限升级的问题；发生异常时会自动保存。裂隙最迟每 2.5 分钟出现一次，尚未获得的传说的宝可梦更容易出现。治疗量会参考你的攻击强度，并设有上限。合作模式下，房主切换标签页时全队暂停。此外还有 iPhone 修复、菜单异色切换、近战招式增强，以及游戏内的更新公告按钮。')),
 ('2026-10-11', ('Vínculos: fusiona movimientos al vencer legendarios', 'Bonds: fuse moves by defeating legendaries', '羁绊：击败传说的宝可梦以融合招式'),
  ('Cada legendario que vences en una grieta te da un vínculo: une dos movimientos para que se lancen a la vez y ocupen un solo hueco, y con cada legendario siguiente se suma otro, hasta 4 a la vez. Así queda sitio para aprender más movimientos. Además, las grietas salen más a menudo.', 'Every legendary you defeat in a rift gives you a bond: link two moves so they fire at the same time from a single slot, and each further legendary adds another one, up to 4 at once. That frees slots to learn more moves. Rifts also show up more often.', '每次在裂隙中击败传说的宝可梦，都会获得羁绊：将两个招式连结，在同一栏位同时施放。此后每击败一只，可再加入一个招式，最多同时施放 4 个，为学习其他招式腾出栏位。裂隙也会更频繁地出现。')),
 ('2026-10-10', ('Jefes con varios ataques, 8 tipos de movimiento nuevos y más reto', 'Bosses with several attacks, 8 new move kinds and a tougher game', '多招式首领、8 种新攻击方式与更高难度'),
  ('Los jefes y legendarios tienen 4 ataques avisados, se acercan o pelean de lejos y se enfurecen a media vida. 12 movimientos nuevos y 8 formas de atacar: bumerán, cadena, minas, meteoros, torreta, embestida, rastro y abanico. Menos enemigos pero más duros, eventos a mitad de partida (hordas de un tipo, hora dorada, Pokémon perdidos), Meowth que huyen cargados de monedas, los de tipo Agua nadan sin frenarse y el ranking tiene anti-trampas.', 'Bosses and legendaries have 4 telegraphed attacks, close in or fight from range and get enraged at half health. 12 new moves and 8 new ways to attack: boomerang, chain, mines, meteors, turret, dash, trail and spray. Fewer but tougher enemies, mid-run events (single-type hordes, golden hour, lost Pokémon), Meowth running away loaded with coins, Water types swim at full speed and the leaderboard has anti-cheat.', '首领与传说的宝可梦拥有 4 个带预警的攻击招式，会近身或远程作战，并在 HP 降至一半时进入狂暴。新增 12 个招式和 8 种攻击方式：回旋、连锁、地雷、流星、炮台、突进、轨迹和扇形。敌人数量减少，但更强；新增同属性敌群、黄金时刻、迷路宝可梦等局内事件，以及携带大量金币逃跑的喵喵。水属性宝可梦游泳不会减速，排行榜加入反作弊机制。')),
 ('2026-10-09', ('Móvil, inglés y ajustes', 'Mobile, English and settings', '移动设备、英语与设置'),
  ('Ya se puede jugar en móvil y tablet con joystick táctil, en español y en inglés, e instalar como app. Nueva pantalla de ajustes con calidad gráfica automática, y menos enemigos en pantalla pero más fuertes.', 'You can now play on phones and tablets with a touch joystick, in English and Spanish, and install it as an app. New settings screen with automatic graphics quality, and fewer but stronger enemies on screen.', '现在可以在手机和平板上使用触摸摇杆游玩，支持西班牙语和英语，并可安装为应用。新增设置页面与自动画质，减少同屏敌人数量并提升其强度。')),
 ('2026-10-08', ('Misiones, logros y enemigos con personalidad', 'Missions, achievements and enemies with personality', '任务、成就与各具特点的敌人'),
  ('Misiones diarias y semanales, 127 logros con medallas y títulos, perfil público, objetos equipables, evoluciones de movimientos y enemigos que curan, protegen, invocan o explotan.', 'Daily and weekly missions, 127 achievements with medals and titles, a public profile, held items, move evolutions and enemies that heal, shield, summon or explode.', '新增每日和每周任务、带奖章与称号的 127 项成就、公开资料、携带物品、招式进化，以及会治疗、保护、召唤或自爆的敌人。')),
 ('2026-10-08', ('Grietas legendarias y clima', 'Legendary rifts and weather', '传说裂隙与天气'),
  ('Grietas que llevan a 18 arenas legendarias, una por tipo; clima que cambia la batalla; tabla de tipos y gacha tragaperras con tickets.', 'Rifts leading to 18 legendary arenas, one per type; weather that changes the fight; a type chart and a slot-machine gacha with tickets.', '新增通往 18 座传说竞技场的裂隙，每种属性各一座；天气会影响战斗，并加入属性相克表和使用奖券的老虎机式扭蛋。')),
 ('2026-10-08', ('Cooperativo y ranking', 'Co-op and leaderboards', '合作模式与排行榜'),
  ('Cooperativo online hasta 4 con tu lista de amigos y ranking diario, semanal, mensual, anual e histórico.', 'Online co-op for up to 4 with your friends list, plus daily, weekly, monthly, yearly and all-time leaderboards.', '支持通过好友列表进行最多 4 人的在线合作，并提供每日、每周、每月、每年和历史排行榜。')),
]

def news(lang):
    pid = 'news'
    i = LANGUAGES.index(lang)
    items = ''.join(f'<article class="news"><time datetime="{d}">{d}</time><h2>{esc(t[i])}</h2><p>{esc(x[i])}</p></article>' for d, t, x in NEWS)
    h1 = 'Novedades de PokéSurvivor' if lang == 'es' else 'PokéSurvivor news'
    title = h1 + (' · actualizaciones del juego' if lang == 'es' else ' · game updates')
    desc = ('Las últimas actualizaciones de PokéSurvivor: nuevas funciones, mejoras y arreglos.' if lang == 'es'
            else 'The latest PokéSurvivor updates: new features, improvements and fixes.')
    if lang == 'zh-CN':
        h1, title, desc = 'PokéSurvivor 更新公告', 'PokéSurvivor 更新公告与版本记录', '查看 PokéSurvivor 的最新功能、改进与问题修复。'
    body = f'<div class="doc"><h1>{h1}</h1>{items}{cta(pid, lang, L(lang, "Jugar gratis", "Play free", "免费游玩"))}</div>'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= apoyar el proyecto =================
def support(lang):
    pid = 'support'
    F = D['funding']
    val = lambda v: (L(lang, f'{v} €/mes', f'€{v}/month', f'{v} 欧元/月')) if isinstance(v, (int, float)) else esc(L(lang, v))
    rows = ''.join(f'<tr><td>{esc(L(lang, c))}</td><td class="num">{val(v)}</td></tr>' for c, v in F['costs'])
    kofi = f'https://ko-fi.com/{F["kofi"]}' if F['kofi'] else ''
    spons = f'https://github.com/sponsors/{F["sponsors"]}' if F['sponsors'] else ''
    if lang == 'es':
        h1 = 'Apoyar PokéSurvivor'
        btns = ''.join(x for x in [f'<a class="btn" href="{kofi}" rel="noopener">Donar en Ko-fi</a>' if kofi else '',
                                   f'<a class="btn ghost" href="{spons}" rel="noopener">GitHub Sponsors</a>' if spons else ''])
        body = f"""<article class="doc"><h1>{h1}</h1>
<p class="lead">PokéSurvivor es y será <b>gratis</b>: sin anuncios, sin compras y sin ventajas de pago. Si te gusta y quieres ayudar a que siga en línea,
puedes hacer una <b>donación voluntaria</b>. <b>Todo el dinero se usa para los servidores y el dominio</b>; lo que sobre se guarda para los meses siguientes.</p>
<p>Donar no da ninguna ventaja dentro del juego: todos los jugadores juegan igual.</p>
<h2>Qué cuesta mantenerlo</h2>
<table class="list"><tbody>{rows}</tbody></table>
<p>Los servidores guardan las partidas y las cuentas, el ranking y las partidas en grupo: cuanta más gente juega, más cuestan.</p>
<h2>Cómo apoyar</h2>
<p>{btns or 'Muy pronto podrás donar desde aquí.'}</p>
<p>También ayuda mucho, y gratis: compartir el juego con tus amigos, recomendarlo y avisar de fallos.</p>
{cta(pid, lang, 'Volver al juego')}</article>"""
        title, desc = 'Apoyar PokéSurvivor: donaciones para los servidores', 'PokéSurvivor es gratis y sin anuncios. Las donaciones voluntarias se usan sólo para los servidores y el dominio.'
    elif lang == 'zh-CN':
        h1 = '支持 PokéSurvivor'
        btns = ''.join(x for x in [f'<a class="btn" href="{kofi}" rel="noopener">通过 Ko-fi 捐赠</a>' if kofi else '',
                                   f'<a class="btn ghost" href="{spons}" rel="noopener">GitHub Sponsors</a>' if spons else ''])
        body = f'''<article class="doc"><h1>{h1}</h1>
<p class="lead">PokéSurvivor 始终<b>免费</b>，没有广告、内购或付费优势。如果你喜欢这款游戏，希望帮助它持续运营，可以进行<b>自愿捐赠</b>。
<b>所有捐款都用于服务器和域名</b>，剩余款项会留作后续月份的开支。</p><p>捐赠不会带来任何游戏优势，所有玩家享有同样的游戏体验。</p>
<h2>运营费用</h2><table class="list"><tbody>{rows}</tbody></table>
<p>服务器用于保存存档和账号、维护排行榜与合作游戏；玩家越多，费用也会越高。</p>
<h2>支持方式</h2><p>{btns or '捐赠渠道即将开放。'}</p>
<p>向朋友分享和推荐游戏，或反馈遇到的问题，也能提供很大帮助，而且完全免费。</p>
{cta(pid, lang, '返回游戏')}</article>'''
        title, desc = '支持 PokéSurvivor：为服务器捐赠', 'PokéSurvivor 免费且没有广告。自愿捐赠仅用于服务器和域名费用，不提供游戏优势。'
    else:
        h1 = 'Support PokéSurvivor'
        btns = ''.join(x for x in [f'<a class="btn" href="{kofi}" rel="noopener">Donate on Ko-fi</a>' if kofi else '',
                                   f'<a class="btn ghost" href="{spons}" rel="noopener">GitHub Sponsors</a>' if spons else ''])
        body = f"""<article class="doc"><h1>{h1}</h1>
<p class="lead">PokéSurvivor is and will stay <b>free</b>: no ads, no purchases and no pay-to-win. If you enjoy it and want to help keep it online,
you can make a <b>voluntary donation</b>. <b>All the money goes to the servers and the domain</b>; anything left over is saved for the following months.</p>
<p>Donating gives no advantage in the game: everyone plays on equal terms.</p>
<h2>What it costs to run</h2>
<table class="list"><tbody>{rows}</tbody></table>
<p>The servers store saves and accounts, the leaderboards and group games: the more people play, the more they cost.</p>
<h2>How to support</h2>
<p>{btns or 'You\'ll be able to donate from here very soon.'}</p>
<p>Sharing the game with your friends, recommending it and reporting bugs helps a lot too, and it\'s free.</p>
{cta(pid, lang, 'Back to the game')}</article>"""
        title, desc = 'Support PokéSurvivor: donations for the servers', 'PokéSurvivor is free and ad-free. Voluntary donations only pay for the servers and the domain.'
    write(pid, lang, page(pid, lang, title, desc, body, {'@context': 'https://schema.org', '@graph': [crumbs(pid, lang, h1)]}))

# ================= el juego en otros idiomas =================
def game(lang):
    # Parte de dev.html (con lo de SEO) y usa el mismo app.min.js que index.html,
    # así sale bien aunque index.html se haya generado con --sin-seo.
    dev = open(os.path.join(ROOT, 'dev.html'), encoding='utf-8').read()
    idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    app = re.search(r'<script defer src="js/app\.min\.js\?v=[^"]+"></script>', idx).group(0)
    a, b = dev.index('<!-- scripts:begin -->'), dev.index('<!-- scripts:end -->') + len('<!-- scripts:end -->')
    src = dev[:a] + app + dev[b:]
    src = re.sub(r'<!-- seo:(begin|end) -->\n?', '', src)
    src = re.sub(r'<meta name="robots" content="noindex">\s*', '', src)
    src = re.sub(r'<!-- dev\.html: página fuente[^>]*-->\n?', '', src)
    s = src.replace('<html lang="es">', f'<html lang="{lang}">')
    s = s.replace('<head>\n<meta charset="utf-8">', '<head>\n<meta charset="utf-8">\n<base href="../">', 1)
    rep = [
        ('<title>PokéSurvivor – Juego Pokémon gratis online estilo Survivor.io</title>', '<title>PokéSurvivor – Free online Pokémon survival game (Survivor.io style)</title>'),
        ('content="Sobrevive a hordas de Pokémon con tu compañero en este fan game gratis para navegador y móvil: 966 Pokémon, shinies, legendarios y cooperativo con amigos. Sin descargas ni anuncios."',
         f'content="Survive hordes of Pokémon with your partner in this free fan game for browser and mobile: {N} Pokémon, shinies, legendaries and online co-op with friends. No downloads, no ads."'),
        ('<link rel="canonical" href="https://pokesurvivor.com/">', '<link rel="canonical" href="https://pokesurvivor.com/en/">'),
        ('<meta property="og:locale" content="es_ES">', '<meta property="og:locale" content="en_US">'),
        ('<meta property="og:url" content="https://pokesurvivor.com/">', '<meta property="og:url" content="https://pokesurvivor.com/en/">'),
        ('<meta property="og:title" content="PokéSurvivor – Sobrevive a las hordas Pokémon">', '<meta property="og:title" content="PokéSurvivor – Survive the Pokémon hordes">'),
        ('<meta property="og:description" content="Fan game gratis para navegador y móvil: 966 Pokémon, shinies, legendarios y cooperativo hasta 4 amigos. Sin descargas ni anuncios.">',
         f'<meta property="og:description" content="A free fan game for browser and mobile: {N} Pokémon, shinies, legendaries and co-op with up to 4 friends. No downloads, no ads.">'),
        ('<meta name="twitter:title" content="PokéSurvivor – Sobrevive a las hordas Pokémon">', '<meta name="twitter:title" content="PokéSurvivor – Survive the Pokémon hordes">'),
        ('<meta name="twitter:description" content="Fan game gratis para navegador y móvil, con cooperativo hasta 4. Sin descargas ni anuncios.">',
         '<meta name="twitter:description" content="A free fan game for browser and mobile, with co-op for up to 4. No downloads, no ads.">'),
        ('<p>Juego de supervivencia con Pokémon, gratis en el navegador y en el móvil.</p>', '<p>A Pokémon survival game, free in your browser and on mobile.</p>'),
        ('<p class="boot-ld">Cargando…</p>', '<p class="boot-ld">Loading…</p>'),
    ]
    for a, b in rep:
        assert a in s, a[:60]
        s = s.replace(a, b)
    # Enlaces a las páginas: las de inglés.
    s = s.replace('href="guia/"', 'href="en/guide/"').replace('href="pokedex/"', 'href="en/pokedex/"')
    s = s.replace('"description": "Fan game gratuito de supervivencia (bullet heaven, estilo Survivor.io) con Pokémon: elige compañero, sobrevive a hordas, sube de nivel, evoluciona tus ataques, enfréntate a legendarios en grietas y juega en cooperativo con hasta 4 amigos."',
                  '"description": "A free Pokémon survival fan game (bullet heaven, Survivor.io style): pick a partner, survive the hordes, level up, evolve your moves, fight legendaries in rifts and play co-op with up to 4 friends."')
    s = s.replace('"inLanguage": "es"', '"inLanguage": ["es", "en"]')
    if lang == 'zh-CN':
        title = 'PokéSurvivor – 免费在线宝可梦生存游戏'
        description = f'与伙伴一起迎战宝可梦群，体验 {N} 只宝可梦、异色形态、传说裂隙与最多 4 人在线合作。浏览器和手机免费游玩，无需下载，没有广告。'
        s = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', s)
        for attr, key, value in [('name', 'description', description), ('property', 'og:title', title), ('property', 'og:description', description),
                                 ('property', 'og:locale', 'zh_CN'), ('property', 'og:url', SITE + 'zh/'),
                                 ('property', 'og:image:alt', 'PokéSurvivor：像素地图上被敌群包围的宝可梦'),
                                 ('name', 'twitter:title', title), ('name', 'twitter:description', description)]:
            s = re.sub(f'<meta {attr}="{key}" content="[^"]*">', f'<meta {attr}="{key}" content="{esc(value)}">', s)
        s = s.replace('<link rel="canonical" href="https://pokesurvivor.com/en/">', '<link rel="canonical" href="https://pokesurvivor.com/zh/">')
        s = s.replace('href="en/guide/"', 'href="zh/guide/"').replace('href="en/pokedex/"', 'href="zh/pokedex/"')
        s = s.replace('<p>A Pokémon survival game, free in your browser and on mobile.</p>', '<p>宝可梦生存游戏，在浏览器和手机上免费游玩。</p>')
        s = s.replace('<p class="boot-ld">Loading…</p>', '<p class="boot-ld">加载中…</p>')
        s = re.sub(r'<noscript>.*?</noscript>', '<noscript><div class="boot noscript"><div class="boot-in"><h1>PokéSurvivor</h1>'
                   '<p>PokéSurvivor 需要 JavaScript 才能运行，请启用后开始游玩。</p>'
                   f'<p>{description}</p><p><a href="zh/guide/">游戏指南</a> · <a href="zh/pokedex/">宝可梦图鉴</a></p>'
                   '</div></div></noscript>', s, flags=re.S)
        match = re.search(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
        ld = json.loads(match.group(1))
        for node in ld['@graph']:
            node['url'] = SITE + 'zh/'
            node['inLanguage'] = ['es', 'en', 'zh-CN']
            if 'description' in node:
                node['description'] = description
                node['genre'] = ['Roguelike', '弹幕生存', '动作', '生存']
                node['gamePlatform'] = ['网页浏览器', 'PC', 'Android', 'iOS']
                node['operatingSystem'] = '支持现代网页浏览器的操作系统'
        s = s[:match.start(1)] + '\n' + json.dumps(ld, ensure_ascii=False, indent=2) + '\n' + s[match.end(1):]
    s = s.replace('"inLanguage": ["es", "en"]', '"inLanguage": ["es", "en", "zh-CN"]')
    write('home', lang, s)

# ================= 404, robots y sitemap =================
def extra():
    nf = '''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>404 · PokéSurvivor</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/assets/icons/icon-48.png"><link rel="stylesheet" href="/css/pages.css"></head>
<body><header class="top"><a class="brand" href="/">PokéSurvivor</a><nav><a href="/guia/">Guía</a><a href="/en/">English</a><a class="play" href="/">Jugar gratis</a></nav></header>
<main><article class="doc center"><h1>404 · Te has perdido en la mazmorra</h1><p class="lead">Esta página no existe. Pero las hordas siguen esperando…</p>
<p class="lead" lang="en">This page doesn't exist. But the hordes are still waiting…</p>
<p class="lead" lang="zh-CN">这个页面不存在，但宝可梦群仍在等着你……</p>
<p class="cta"><a class="btn" href="/">Volver al juego</a> <a class="btn ghost" href="/en/">Play in English</a> <a class="btn ghost" href="/zh/" lang="zh-CN">用简体中文游玩</a></p></article></main></body></html>
'''
    open(os.path.join(ROOT, '404.html'), 'w', encoding='utf-8', newline='\r\n').write(nf)
    open(os.path.join(ROOT, 'robots.txt'), 'w', encoding='utf-8', newline='\r\n').write(f'# PokéSurvivor\nUser-agent: *\nAllow: /\nDisallow: /tools/\nDisallow: /docs/\nDisallow: /dev.html\n\nSitemap: {SITE}sitemap.xml\n')
    PRI = {'home': '1.0', 'guide': '0.8', 'pokedex': '0.7', 'legends': '0.7', 'moves': '0.6', 'types': '0.6', 'shinies': '0.6', 'achievements': '0.5', 'items': '0.5', 'news': '0.5', 'support': '0.4'}
    urls = []
    for pid in PAGES:
        for lang in LANGUAGES:
            alts = ''.join(f'<xhtml:link rel="alternate" hreflang="{l}" href="{SITE}{PATH[l][pid]}"/>' for l in LANGUAGES)
            alts += f'<xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{PATH["es"][pid]}"/>'
            urls.append(f'  <url><loc>{SITE}{PATH[lang][pid]}</loc><lastmod>{TODAY}</lastmod><priority>{PRI[pid]}</priority>{alts}</url>\n')
    open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\r\n').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + ''.join(urls) + '</urlset>\n')

for lang in LANGUAGES:
    guide(lang); pokedex(lang); legends(lang); shinies(lang); types_page(lang); moves_page(lang); items_page(lang); ach_page(lang); news(lang); support(lang)
game('en'); game('zh-CN'); extra()
print('ok:', len(LANGUAGES) * (len(PAGES) - 1), 'páginas + en/ y zh/, 404, robots, sitemap')
