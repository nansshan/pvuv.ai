/* [INPUT]: 画布尺寸、示例指标与系统动效偏好。
 * [OUTPUT]: 有限时长的流量点云扫描与指标读数。
 * [POS]: 首页演示层。曲面仅取本地合成样本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md */
(() => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const buttons = [...document.querySelectorAll('.modes button')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const totals = [24816, 7942, 318];
  let mode = 0;
  let frame;
  function draw(progress) {
    if (!ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const mobile = w < 620;
    const scan = progress * 1.25 - .12;
    for (let row = 0; row <= 52; row++) {
      const v = row / 52;
      for (let col = 0; col <= 166; col++) {
        const u = col / 166;
        const ridge = Math.sin(u * 11 + mode * 1.3) * .15 + .51;
        const envelope = Math.exp(-((v-ridge)**2) * (13 + mode*4));
        const peaks = .3 + .6 * Math.sin(u*5.1 - .9 + mode*.6)**2 + .13*Math.sin(u*19+v*6);
        const z = envelope * peaks * Math.sin(Math.PI*u)**.55;
        const x = w*((mobile ? -.12 : .15) + u*(mobile ? 1.18 : .79) + (v-.5)*.27);
        const y = h*((mobile ? .72 : .65) + v*.29 - u*.16 - z*(mobile ? .42 : .61));
        const hot = Math.abs(scan-u)<.021 || (z>.74 && v<ridge+.075);
        ctx.fillStyle = hot ? '#ff9568' : z>.53 ? '#c5e3b0' : z>.22 ? '#83a888' : '#4c7161';
        const r = hot ? 1.85 : 1.35;
        ctx.fillRect(x,y,r,r);
      }
    }
  }
  function replay() {
    cancelAnimationFrame(frame);
    if (reduced.matches) { draw(1); return; }
    const start = performance.now();
    function step(now) {
      const progress = Math.min(1,(now-start)/2200);
      draw(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
  }
  function update() {
    const metric = document.querySelector('#metric');
    metric.dataset.i18n = buttons[mode].dataset.i18n;
    metric.textContent = window.PVI18N.t(metric.dataset.i18n);
    document.querySelector('#value').textContent = totals[mode].toLocaleString(window.PVI18N.lang);
  }
  buttons.forEach((button,index) => button.onclick = () => {
    mode = index;
    buttons.forEach((item,i) => item.setAttribute('aria-pressed', String(i===mode)));
    update();
    replay();
  });
  new ResizeObserver(() => {
    const scale = Math.min(devicePixelRatio,2);
    canvas.width = Math.round(canvas.clientWidth*scale);
    canvas.height = Math.round(canvas.clientHeight*scale);
    ctx?.setTransform(scale,0,0,scale,0,0);
    replay();
  }).observe(canvas);
  reduced.addEventListener('change', replay);
  document.addEventListener('pvuv:lang', update);
  update();
})();
