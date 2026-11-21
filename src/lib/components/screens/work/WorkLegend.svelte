<p class="legend">
  <span class="l0">— off</span><span class="l1">low</span><span class="l2">nrm</span><span
    class="l3">hi</span
  ><span class="l4">urg</span><span class="top">best at</span><span class="weak">worst at</span>
  <em>click ↑ · right-click ↓ · right-click ▸ splits a job</em>
</p>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin: 0;
    padding: 5px 0 6px 8px;
    color: var(--text-muted);
  }
  .legend em {
    margin-left: auto;
    font-style: normal;
    opacity: 0.8;
  }
  .l0 {
    opacity: 0.7;
  }
  .l1 {
    color: var(--text-dim);
  }
  .l2 {
    color: var(--text);
  }
  .l3 {
    color: var(--accent-hi);
  }
  .l4 {
    color: var(--neg);
  }
  .top::before {
    content: '★ ';
    color: var(--accent-hi);
  }
  .weak::before {
    content: '▾ ';
    color: var(--neg);
  }
</style>
