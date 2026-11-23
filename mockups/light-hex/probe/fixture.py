import json, sys, numpy as np
src = open('table.py').read().replace("same = []\nfor h, op in zip(hours, ops):", "same = []\nfor h, op in []:")
src = src[:src.index("hexs = lambda")]
ns = {'__name__': 'fx'}
sys.argv = ['x', 'fx']
exec(src, ns)
hours, ops, comp, LS, M = ns['hours'], ns['ops'], ns['comp'], ns['LS'], ns['M']
keys = ['grass', 'foliage', 'water', 'rock', 'shadow']
table = []
for h, op in zip(hours, ops):
    m = comp(LS, op)
    table.append({'hour': h, **{k: [round(float(v), 2) for v in m[M[k]].mean(0)] for k in keys}})
fx = {'albedo': {k: [round(float(v), 2) for v in LS['day'][M[k]].mean(0)] for k in keys}, 'hours': table}
json.dump(fx, open('mockup-light-table.json', 'w'))
print(json.dumps(fx['albedo']), len(table))
