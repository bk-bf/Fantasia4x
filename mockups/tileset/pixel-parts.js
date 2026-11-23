'use strict';
const PARTS = (() => {
  const { part, run, profile } = PX;
  const span = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const side = (band, reach) => band * 3 < -reach ? 'l' : band * 3 > reach ? 'd' : 'm';

  const POMMEL = {
    dot: part(0, ['m']),
    block: part(-1, ['l ', 'mm', 'd ']),
    plus: part(-1, ['ll', ' m', 'dd']),
    jewel: part(-1, ['ll', ' M', 'dd']),
    wheel: part(-2, [' l ', 'll ', 'mmm', 'dd ', ' d ']),
    ring: part(-2, [' l ', 'll ', 'mom', 'dd ', ' d '])
  };

  const grip = (n, wrap) => run(0, [wrap || 'md'], n);
  const haft = n => run(-1, ['m', 'd'], n);
  const pole = n => run(-1, ['l', 'm', 'd'], n);
  const binding = n => run(-1, ['lm', 'md'], n);
  const quillons = reach => part(-reach, span(-reach, reach).map(b => b % 2 ? ' ' : side(b, reach)));
  const crossbar = reach => part(-reach, span(-reach, reach).map(b => side(b, reach)));

  const BLADE = {
    arming: n => profile([[-1, 0, n, 'l'], [0, 1, n + 2, 'm'], [1, 0, n, 'd']]),
    spatha: n => profile([[-1, 0, n, 'l'], [0, 1, n + 1, 'm'], [1, 0, n, 'd']]),
    runed: n => profile([[-1, 0, n, 'l'], [0, 1, n + 2, 'mmL'], [1, 0, n, 'd']]),
    leaf: (n, swell) => profile([[-2, swell, n - 3, 'l'], [-1, 0, n - 1, 'm'], [0, 1, n + 1, 'm'], [1, 0, n - 1, 'd'], [2, swell, n - 3, 'd']]),
    broad: n => profile([[-2, 1, n - 2, 'l'], [-1, 0, n - 1, 'l'], [0, 1, n + 1, 'm'], [1, 0, n - 1, 'm'], [2, 1, n - 2, 'd']]),
    fullered: (n, fuller) => profile([[-2, 1, n - 2, 'l'], [-1, 0, n - 1, 'l'], [0, 1, n + 1, 'm'], [0, 1, fuller, 'd'], [1, 0, n - 1, 'm'], [2, 1, n - 2, 'd']]),
    verse: (n, fuller) => profile([[-2, 1, n - 2, 'l'], [-1, 0, n - 1, 'l'], [0, 1, n + 1, 'm'], [0, 1, fuller, 'DL'], [1, 0, n - 1, 'm'], [2, 1, n - 2, 'd']]),
    seax: n => profile([[-2, 1, n - 4, 'd'], [-1, 0, n - 3, 'm'], [0, 1, n - 1, 'm'], [1, 0, n - 1, 'l'], [2, 1, n, 'l']]),
    needle: n => profile([[0, 1, n + 1, 'lm']]),
    spike: (n, stout) => profile([[-1, 0, stout, 'l'], [0, 1, n + 1, 'm'], [1, 0, stout, 'd']]),
    jagged: n => profile([[-3, 2, n - 4, 'l  '], [-2, 1, n - 2, 'l'], [-1, 0, n - 2, 'm'], [0, 1, n, 'd'], [1, 0, n - 2, 'm'], [2, 1, n - 2, 'd'], [3, 3, n - 4, 'd  ']]),
    slab: n => profile([[-6, 2, n - 1, 'l'], [-5, 1, n - 1, 'l'], [-4, 1, n, 'm'], [-3, 0, n, 'm'], [-2, 1, n + 1, 'm'], [-1, 0, n, 'd'], [0, 1, n + 1, 'd'], [1, 0, n, 'd']])
  };

  const HEAD = {
    leaf: n => profile([[-2, 1, n - 3, 'l'], [-1, 0, n - 1, 'l'], [0, 0, n + 1, 'm'], [1, 0, n - 1, 'd'], [2, 1, n - 3, 'd']]),
    narrow: n => profile([[-1, 0, n - 1, 'l'], [0, 0, n + 1, 'm'], [1, 0, n - 1, 'd']])
  };

  return { POMMEL, BLADE, HEAD, grip, haft, pole, binding, quillons, crossbar, span, side };
})();
