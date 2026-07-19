# 本机自托管（第一、二步）

本目录把原有 `unionOp` 云函数接到普通 Node.js + MongoDB 服务，并提供与 EMAS Mini Program SDK 相同的最小调用接口。业务函数目录仍使用 `functionsEMAS/unionOp`，没有复制业务代码。

## 以子路径复用 NATAPP 地址（不使用 Docker）

当前机器的 8787 已被其他服务监听，不能再直接绑定猫谱 API。让猫谱监听仅本机可访问的 **8788**，再由 Nginx 按路径转发：

1. 复制 `selfhost/.env.example` 为 `selfhost/.env`，填写 `MONGO_URL`、`JWT_SECRET` 和微信小程序密钥。
2. 在 `selfhost/api` 执行 `npm ci`，然后启动：`npm start`。服务会自动读取 `selfhost/.env`。
3. 将 `nginx-maopu-location.example.conf` 的 `location` 块加入 NATAPP 所转发的 Nginx `server` 块，执行 `nginx -t` 后重载 Nginx。
4. 将 NATAPP 的本地目标改为该 Nginx 监听端口（通常为 80），而不是旧服务的 8787。
5. 小程序 `miniprogram/selfhost.config.js` 写为 `https://你的-natapp-域名/maopu/api`，并将域名配置为微信小程序 request 合法域名。

这样同一个公网地址会按路径复用：

```text
https://你的-natapp-域名/                 → 现有服务（127.0.0.1:8787）
https://你的-natapp-域名/maopu/api/...    → 猫谱 API（127.0.0.1:8788）
```

健康检查地址是 `https://你的-natapp-域名/maopu/api/healthz`。

## Docker 启动（可选）

1. 复制 `.env.example` 为 `.env`，填写 MongoDB 密码、JWT 密钥和微信小程序凭据。
2. 在仓库根目录运行：`docker compose -f selfhost/docker-compose.yml --env-file selfhost/.env up -d --build`。
3. 将反向代理的 HTTPS 域名写入 `miniprogram/selfhost.config.js`，并把该域名加入微信小程序的 request 合法域名。
4. 从 EMAS 导出真实数据后导入 MongoDB。仓库内的 `LafToEMAS/json/` 当前均为空占位文件，不能用于迁移。可在 API 容器中运行 `node src/import-data.js /data/export`；该脚本接受 JSON 数组或 JSONL，并会拒绝空文件以避免误清库。

API 默认只绑定 `127.0.0.1`，请使用 Caddy 或 Nginx 提供 HTTPS；不要把 MongoDB 端口暴露到公网。
`Caddyfile.example` 提供了最小反向代理配置。

## 目前完成范围

- 微信 `wx.login` code 换取 `openid` 并签发 API JWT。
- 小程序数据库 `find/findOne/count/aggregate` 兼容接口。
- 保留原 `unionOp` 的业务函数与权限判断。
- 直接数据库写入严格沿用原小程序策略；后台/权限写操作走 `unionOp`。

文件上传、COS/MinIO 以及 `timeTrigger` 属于第三步，尚未迁移。使用图片上传、消息发送或照片处理功能前，先完成第三步。
