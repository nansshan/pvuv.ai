/* [INPUT]: 控制台语言选择与 OAuth 回调错误。
 * [OUTPUT]: 本地化首页、登录弹框与滚动揭示。
 * [POS]: 首页交互层。认证委托给同源 GitHub 入口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md */
(() => {
  const i18n = window.PVI18N;
  const keys = ['category','line1','line2','intro','explore','sample','source','journey','quality','login','close'];
  const copy = {
    en: ['Web analytics','Traffic,','in focus.','Follow the people, sources and suspicious activity behind each visit.','Explore the signals','Traffic sample','Trace visits back to search, campaigns and referring sites.','Follow entry pages, session paths and exits in order.','Inspect bot scores and see which visits were flagged.','Sign in','Close'],
    zh: ['网站流量分析','每次访问，','都有来路。','从来源渠道到页面足迹，看清谁在访问，也看见藏在流量里的异常。','探索流量信号','流量示例','追溯搜索、推广活动和引荐网站带来的访问。','沿时间线查看入口页、浏览路径和离开页。','查看机器人评分，辨识被标记的可疑访问。','登录','关闭'],
    ja: ['ウェブ解析','アクセスの','軌跡を読む。','訪問者、流入元、不審な動きをひとつの画面で捉えます。','指標を見る','サンプルデータ','検索、キャンペーン、参照サイトからの流入を調べます。','入口から離脱までの閲覧経路をたどります。','ボットスコアと不審な訪問を確認します。','ログイン','閉じる'],
    ko: ['웹 분석','방문 흐름을','한눈에.','방문자와 유입 경로를 파악하고 의심스러운 활동을 살펴보세요.','지표 살펴보기','트래픽 예시','검색, 캠페인, 추천 사이트별 방문을 추적합니다.','첫 페이지부터 이탈까지 방문 경로를 확인합니다.','봇 점수와 의심스러운 방문을 확인합니다.','로그인','닫기'],
    de: ['Webanalyse','Verkehr','im Fokus.','Erkunden Sie Besucher, Quellen und auffällige Aktivitäten.','Signale erkunden','Beispieldaten','Ordnen Sie Besuche der Suche, Kampagnen und Verweisen zu.','Verfolgen Sie den Weg vom Einstieg bis zum Ausstieg.','Prüfen Sie Bot-Werte und markierte Besuche.','Anmelden','Schließen'],
    fr: ['Analyse web','Le trafic','à la loupe.','Suivez les visiteurs, les sources et les activités suspectes.','Explorer les signaux','Exemple de trafic','Repérez les visites issues des recherches, campagnes et sites référents.','Suivez les pages consultées de l’entrée à la sortie.','Examinez les scores de bot et les visites signalées.','Connexion','Fermer'],
    es: ['Analítica web','El tráfico,','en detalle.','Descubre los visitantes, las fuentes y la actividad sospechosa de cada visita.','Explorar señales','Datos de ejemplo','Atribuye las visitas a búsquedas, campañas y sitios de referencia.','Sigue el recorrido desde la entrada hasta la salida.','Consulta la puntuación de bots y las visitas señaladas.','Acceder','Cerrar']
  };
  const dialog = document.querySelector('dialog');
  const close = document.querySelector('#close');
  const error = new URLSearchParams(location.search).get('error');
  const errors = {
    not_admin: 'That account is not an admin — login not allowed.',
    bad_state: 'Login session expired — please try again.',
    bad_request: 'Login was interrupted — please try again.',
    no_email: 'No verified email was returned by the provider.',
    token_exchange: 'OAuth exchange failed — check the provider configuration.',
    userinfo: 'Could not read your profile from the provider.'
  };
  function translate() {
    const words = Object.fromEntries(keys.map((key, index) => [key, copy[i18n.lang][index]]));
    document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = words[el.dataset.copy]; });
    close.setAttribute('aria-label', words.close);
    if (error) {
      const message = document.querySelector('#error');
      message.hidden = false;
      message.textContent = i18n.t(Object.hasOwn(errors,error) ? errors[error] : 'Sign-in failed — please try again.');
    }
  }
  i18n.mountSelect(document.querySelector('#lang'));
  i18n.applyStatic();
  translate();
  document.addEventListener('pvuv:lang', translate);
  document.querySelector('#login').onclick = () => dialog.showModal();
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  if (error) dialog.showModal();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('enter');
      observer.unobserve(entry.target);
    }
  });
  document.querySelectorAll('article').forEach(row => observer.observe(row));
})();
