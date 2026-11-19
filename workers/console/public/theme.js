/* [INPUT]: 系统配色、同源存储与控制台语言偏好。
 * [OUTPUT]: 首屏主题与导航栏三态选择器。
 * [POS]: 首页与控制台共用主题状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md */
(() => {
  const key = 'superminimax.theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const modes = ['system', 'light', 'dark'];
  const labels = {
    en: ['Theme', 'System', 'Light', 'Dark'],
    zh: ['主题', '跟随系统', '浅色', '深色'],
    ja: ['テーマ', 'システム', 'ライト', 'ダーク'],
    ko: ['테마', '시스템', '라이트', '다크'],
    de: ['Design', 'System', 'Hell', 'Dunkel'],
    fr: ['Thème', 'Système', 'Clair', 'Sombre'],
    es: ['Tema', 'Sistema', 'Claro', 'Oscuro']
  };
  let mode = 'system';
  let select;
  let icon;
  function read() {
    try {
      const stored = localStorage.getItem(key);
      mode = modes.includes(stored) ? stored : 'system';
    } catch { /* 存储不可用时保留本页选择。 */ }
  }
  function apply() {
    root.dataset.theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    if (!select) return;
    const words = labels[window.PVI18N?.lang || navigator.language.split('-')[0]] || labels.en;
    select.setAttribute('aria-label', words[0]);
    modes.forEach((value, index) => select.options[index].textContent = words[index+1]);
    select.value = mode;
    select.title = words[0] + ' · ' + select.selectedOptions[0].textContent;
    icon.textContent = root.dataset.theme === 'light' ? '☀' : '☾';
  }
  read();
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { read(); apply(); }
  });
  document.addEventListener('pvuv:lang', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('header .hdr-right, header nav:not(.workspace-nav)') || document.querySelector('header');
    const control = document.createElement('label');
    control.className = 'theme-control';
    icon = document.createElement('span');
    icon.setAttribute('aria-hidden','true');
    select = document.createElement('select');
    for (const value of modes) select.add(new Option(value, value));
    select.addEventListener('change', () => {
      mode = select.value;
      try { localStorage.setItem(key, mode); } catch { /* 仍在本页生效。 */ }
      apply();
    });
    control.append(icon, select);
    const anchor = host.querySelector('#lang');
    if (anchor) anchor.before(control);
    else host.append(control);
    apply();
  });
})();
