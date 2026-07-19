# 本机自托管（第一、二步）

本目录把原有 `unionOp` 云函数接到普通 Node.js + MongoDB 服务，并提供与 EMAS Mini Program SDK 相同的最小调用接口。业务函数目录仍使用 `functionsEMAS/unionOp`，没有复制业务代码。

## 以子路径复用 NATAPP 地址（不使用 Docker）

当前机器的 8787 已被其他服务监听，不能再直接绑定猫谱 API。让猫谱监听仅本机可访问的 **8788**，再由 Nginx 按路径转发：

1. 运行 `selfhost/scripts/start-mongodb.sh`。本机 MongoDB 数据保存在 `selfhost/.runtime/mongo-data`，只监听 `127.0.0.1:27017`。
2. 复制 `selfhost/.env.example` 为 `selfhost/.env`，填写 `JWT_SECRET` 和微信小程序密钥；本机 MongoDB 使用示例中的 `MONGO_URL`。
3. 在 `selfhost/api` 执行 `npm ci && npm run bootstrap-db`，然后启动：`npm start`。服务会自动读取 `selfhost/.env`。
4. 将原 FeishuWebChat 服务由 8787 改为 8789；服务自身所有者需执行该步骤。随后在 `selfhost/gateway` 执行 `npm start`，接管器会监听 8787。
5. NATAPP 继续指向 8787，无须改地址。接管器会将 `/maopu/api/` 转给猫谱，将其余路径转给 8789 的原服务。
6. 小程序 `miniprogram/selfhost.config.js` 写为 `https://你的-natapp-域名/maopu/api`，并将域名配置为微信小程序 request 合法域名。

这样同一个公网地址会按路径复用：

```text
https://你的-natapp-域名/                 → 现有服务（由网关转到 127.0.0.1:8789）
https://你的-natapp-域名/maopu/api/...    → 猫谱 API（127.0.0.1:8788）
```

健康检查地址是 `https://你的-natapp-域名/maopu/api/healthz`。

### 重启后自动恢复

运行 `selfhost/scripts/install-user-services.sh` 安装用户级 systemd 服务。完成 `.env` 后启用 MongoDB 和 API：

```bash
systemctl --user enable --now maopu-mongodb maopu-api
```

只有原 8787 服务移到 8789 后，才启用路径网关：

```bash
systemctl --user enable --now maopu-gateway
```

如果本机重启后用户服务没有自动启动，需要管理员执行 `loginctl enable-linger kimoji` 一次。

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
