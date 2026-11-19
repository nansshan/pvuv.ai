# workers/console/public/
> L2 | 父级: ../CLAUDE.md

成员清单
.assetsignore: 排除模块文档，避免将代码地图发布为网页资源。
theme.js: 首屏解析系统与手动偏好，绑定顶栏主题选择。
theme.css: 映射明暗配色，覆盖首页、看板与统计视图。
console.css: 静态视图的共同视觉层。
health.html: 静态展示层；数据库访问由 Worker 负责。
i18n.js: 只改变展示文本，不改变统计语义。
index.html: 公开首页承载流量演示与 GitHub 登录弹框。
landing.css: 首页版式、标题遮罩与滚动揭示。
landing.js: 复用控制台语言偏好，展示登录与回调错误。
signal.js: 绘制三个示例指标，切换指标时重扫点云。
login.html: 旧登录入口回到首页，保留授权错误。
public.html: 静态展示层；数据库访问由 Worker 负责。
site.html: 承载详情页导航、报表与站点操作。
site-detail.css: 详情页宽幅布局、指标排版与窄屏导航。
site-metrics.js: 指标、响应式趋势图与维度排行。概览与受众共用查询和维度定义。
site-reports.js: 质量诊断、防护、AI 报告与数据导出。专题报表复用详情页的筛选范围。
site-navigation.js: 导航、实时状态、漏斗与详情页初始化。按活动标签调度查询并恢复访问偏好。
sites.html: 顶栏切换卡片、排名与设置，登录默认展示卡片。
sites-board.js: 按域名排列卡片，以浏览量分位和本站历史标记流量。
sites-board.css: 卡片区与排名表居中留边。行底色区分位置，指标文字区分流量与突增。
visitor.html: 静态展示层；数据库访问由 Worker 负责。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
