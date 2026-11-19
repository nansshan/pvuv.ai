# pvuv.ai - 自托管网站流量分析
TypeScript + Cloudflare Workers + D1 + KV + Queues

<directory>
workers/ - 接收事件、写入数据、查询统计并展示控制台。
shared/ - 定义事件、评分规则与统计契约。
sdk/ - 构建浏览器采集脚本。
scripts/ - 生成配置并初始化部署。
migrations/ - 记录数据库结构变更。
cli/ - 提供命令行查询。
mcp/ - 提供 MCP 查询工具。
docs/ - 定义 API 接口。
</directory>
<config>
package.json - 声明构建、类型检查与部署入口。
wrangler.toml - 提供根级 Worker 配置。
config.example.toml - 提供可复制的实例配置。
</config>
