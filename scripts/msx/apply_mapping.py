#!/usr/bin/env python3
"""Replace bitlands charSpans with MShockXotto+ tile refs in the 5 DB files.
ONLY confident matches are swapped; weak/fallback matches keep their bitlands charSpans
(so unmapped entities still render). Line-targeted edit preserves formatting + comments.
Schema written: "charSpans": [ {"sheet": "mshock", "tile": "<id>"} ]
Validates JSON (comment-stripped) before writing."""
import re, json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "src/lib/game/database")
MAN = os.path.join(ROOT, "static/dev/ultica/manifest.json")

man = json.load(open(MAN))
pool = defaultdict(list)
for a in man["atlases"]:
    if a["name"].startswith("mshock"):
        cat = a["name"].split(" ", 1)[1].rstrip(" 0123456789").strip()
        pool[cat] += [t for t in a["tiles"] if t]
def P(*cats):
    out = []
    for c in cats: out.extend(pool.get(c, []))
    return out

SYN = {
 'campfire':['f_campfire','f_firering'],'hearth':['f_fireplace','f_brazier'],'fire':['f_fireplace','f_brazier','f_firering'],
 'bench':['f_workbench','f_counter','f_table'],'workbench':['f_workbench'],'table':['f_table','f_desk','f_counter'],
 'butcher':['f_butcher_rack','f_rack'],'forge':['f_anvil','f_forge'],'anvil':['f_anvil'],'smith':['f_anvil'],
 'kiln':['f_clay_kiln','f_kiln'],'smelt':['f_furnace','f_anvil'],'bloomery':['f_furnace'],'furnace':['f_furnace','f_home_furnace'],
 'oven':['f_clay_oven','f_woodstove'],'quern':['f_water_mill','f_still'],'mill':['f_water_mill','f_wind_mill'],
 'tanning':['t_vat','f_rack'],'tannery':['t_vat'],'loom':['f_loom','f_spinwheel'],'weav':['f_loom','f_spinwheel'],
 'spinning':['f_spinwheel'],'wheel':['f_spinwheel'],'pottery':['f_clay_kiln'],'potter':['f_spinwheel','f_clay_kiln'],
 'stool':['f_stool','f_chair'],'chair':['f_armchair','f_chair'],'couch':['f_sofa'],'sofa':['f_sofa'],
 'bed':['f_bed','f_makeshift_bed'],'sleeping':['f_makeshift_bed'],'chest':['f_crate','f_locker'],'basket':['f_basket','f_crate_o'],
 'cupboard':['f_cupboard','f_dresser'],'larder':['f_cupboard','f_fridge'],'jar':['f_standing_tank'],'barrel':['f_standing_tank','wooden_barrel'],
 'storage':['f_crate','f_locker'],'granary':['f_crate','f_rack'],'rack':['f_rack'],'drying':['f_smoking_rack','f_rack'],
 'compost':['f_compost','f_recycle_bin'],'fermenter':['t_vat','f_standing_tank'],'brewing':['f_still','t_vat'],'still':['f_still'],
 'well':['t_water_well','f_well','t_well'],'door':['t_door_c','t_door'],'window':['t_window'],'wall':['t_wall'],
 'palisade':['t_palisade','t_fence'],'barricade':['f_barricade'],'gate':['t_palisade_gate','t_gate'],'fence':['t_fence'],
 'roof':['t_shingle','t_roof'],'floor':['t_floor','t_dirtfloor'],'altar':['f_altar','f_magic_circle'],'lab':['f_chemistry','f_magic_bench'],
 'alchemy':['f_chemistry','f_magic_bench'],'rune':['f_magic_bench'],'mana':['f_magic_bench','f_huge_mana_crystal'],'arcane':['f_magic_circle'],
 'manaforge':['f_anvil','f_magic_bench'],'attunement':['f_magic_circle'],'alembic':['f_alembic'],
 'carpenter':['f_workbench'],'mason':['f_workbench'],'lapidary':['f_workbench'],'clockwork':['f_workbench'],'sawtable':['f_workbench'],
 'dressing':['f_rack'],'chopping':['t_stump'],'snare':['tr_beartrap'],'deadfall':['tr_beartrap'],'resin':['t_resin'],
 'soil':['t_dirtmound','t_dirt'],
 'wolf':['mon_wolf'],'bear':['mon_bear'],'deer':['mon_deer'],'rabbit':['mon_rabbit'],'boar':['mon_boar','mon_pig'],
 'goat':['mon_goat'],'chicken':['mon_chicken'],'spider':['mon_demon_spider','mon_spider'],'snake':['mon_snake'],
 'viper':['mon_snake'],'crocodile':['mon_crocodile'],'goblin':['mon_goblin'],'orc':['mon_orc'],'harpy':['mon_harpy','mon_bird'],
 'owlbear':['mon_owlbear'],'cat':['mon_cougar'],'sabretooth':['mon_cougar'],'mammoth':['mon_mammoth'],
 'elk':['mon_moose','mon_deer'],'aurochs':['mon_cow','mon_bull'],'jackal':['mon_coyote','mon_wolf'],'worg':['mon_direwolf','mon_wolf'],
 'kobold':['mon_kobold','mon_goblin'],'gnoll':['mon_gnoll','mon_jabberwock'],'troll':['mon_troll'],'ogre':['mon_ogre'],
 'wraith':['mon_wraith'],'bullywug':['mon_lizardfolk','mon_frog'],'hippogriff':['mon_griffon','mon_eagle'],
 'hoarfowl':['mon_chicken','mon_bird'],'tree':['t_tree'],'pine':['t_tree_pine','t_pine'],'birch':['t_tree_birch'],
 'oak':['t_tree_oak'],'apple':['t_tree_apple'],'stump':['t_stump'],'log':['t_log','f_log'],'rock':['t_rock'],'outcrop':['t_rock'],
 'grass':['t_grass'],'mushroom':['t_fungus','f_mushroom'],'berry':['t_shrub_blueberry','t_shrub'],'bush':['t_shrub'],
 'flower':['f_flower','t_flower'],'clay':['t_clay'],'mud':['t_mud'],'water':['t_water'],'shallow':['t_swater','t_water'],
 'crop':['f_planter'],'savanna':['t_grass_long'],'scrub':['t_shrub'],'moss':['t_moss'],'cave':['t_rock_floor'],
 'crystal':['f_huge_mana_crystal'],'glade':['f_magic_circle'],'rocky':['t_rock'],'riverbank':['t_riverbank','t_sandbeach'],
}
STOP = {'the','and','spot','wild','stone'}
def best(eid, ename, cats):
    cand = P(*cats)
    toks = [t for t in re.split(r'[_\s]+', (eid + ' ' + ename).lower()) if len(t) > 2 and t not in STOP]
    for t in toks:
        for k, v in SYN.items():
            if k == t or (len(k) > 3 and k in t):
                for sub in v:
                    hit = [c for c in cand if c == sub] or [c for c in cand if sub in c]
                    if hit: return sorted(hit, key=len)[0]
    for t in toks:
        hit = [c for c in cand if t in c.lower()]
        if hit: return sorted(hit, key=len)[0]
    return None

FILES = {'subterrains':['terrain','field'],'resources':['terrain','furniture','field'],
         'buildings':['furniture','terrain','magiclysm'],'creatures':['monsters','magiclysm','megafauna'],
         'items':['items','furniture','terrain']}
ID_RE = re.compile(r'"id"\s*:\s*"([^"]+)"')
NAME_RE = re.compile(r'"(?:name|displayName)"\s*:\s*"([^"]+)"')
CS_RE = re.compile(r'^(\s*"charSpans"\s*:\s*)(\[.*\])(.*)$')
def strip_jsonc(s):
    s = re.sub(r'//.*', '', s); s = re.sub(r'/\*.*?\*/', '', s, flags=re.S); return re.sub(r',(\s*[}\]])', r'\1', s)

total_swap = total_keep = 0
for f, cats in FILES.items():
    path = os.path.join(DB, f + ".jsonc"); lines = open(path).read().split("\n")
    cur_id = cur_name = ""; swap = keep = 0
    for i, ln in enumerate(lines):
        m = ID_RE.search(ln); n = NAME_RE.search(ln)
        if m: cur_id = m.group(1); cur_name = ""
        if n: cur_name = n.group(1)
        cm = CS_RE.match(ln)
        if cm:
            tile = best(cur_id, cur_name or cur_id, cats)
            if tile:
                lines[i] = f'{cm.group(1)}[ {{"sheet": "mshock", "tile": "{tile}"}} ]{cm.group(3)}'; swap += 1
            else: keep += 1
    new = "\n".join(lines)
    try: json.loads(strip_jsonc(new))
    except Exception as e:
        print(f"!! {f}: JSON broke ({e}); NOT writing"); sys.exit(1)
    open(path, "w").write(new)
    print(f"{f:12s} swapped {swap:4d}  kept-bitlands {keep:4d}")
    total_swap += swap; total_keep += keep
print(f"\nTOTAL swapped to MSX+: {total_swap}   kept bitlands: {total_keep}")
