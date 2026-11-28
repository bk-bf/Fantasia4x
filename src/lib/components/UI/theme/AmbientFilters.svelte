<script lang="ts">
  import { panelAmbient } from './ambientStore';
</script>

<svg width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false">
  <filter id="ambient-tint" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={$panelAmbient.panel} />
  </filter>
  <filter id="ambient-tint-legible" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={$panelAmbient.legible} />
  </filter>
  <filter id="ambient-tint-data" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={$panelAmbient.data} />
  </filter>
  <filter id="ambient-tint-lit" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values={$panelAmbient.lit} />
  </filter>
</svg>
