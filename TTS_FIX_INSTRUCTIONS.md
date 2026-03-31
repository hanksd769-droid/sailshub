# TTS 语音生成修复说明

## 问题原因
前端代码中 `VITE_API_BASE` 硬编码为 `http://localhost:3000`，导致局域网其他电脑访问时请求的是自己电脑的 localhost，而不是服务器。

## 已修复内容

### 1. 修改前端 API 配置
文件：`web/src/lib/api.ts`
- 将 API 基础地址改为相对路径（优先使用环境变量，否则使用相对路径）
- 修改前：`const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';`
- 修改后：`const API_BASE = import.meta.env.VITE_API_BASE || '';`

### 2. 添加 Nginx 反向代理
文件：`web/nginx.conf`
- 添加 `/api/` 路径的反向代理配置
- 将所有 API 请求转发到后端服务（http://api:3000）

## 重新部署步骤

### 方法 1：使用 Docker Compose（推荐）

在服务器电脑上执行：

```powershell
# 1. 停止现有服务
cd E:\web
docker-compose down

# 2. 重新构建前端镜像（重要！需要重新构建才能应用新配置）
docker-compose build web

# 3. 启动所有服务
docker-compose up -d

# 4. 查看日志确认启动成功
docker-compose logs -f
```

### 方法 2：快速重启（如果已修改配置）

```powershell
# 重启 web 容器
docker-compose restart web

# 重启 api 容器（可选）
docker-compose restart api
```

## 验证步骤

### 1. 检查前端构建
查看前端容器日志，确认重新构建：
```powershell
docker-compose logs web
```

### 2. 测试 API 连通性
在局域网任意电脑的浏览器中访问：
- 前端页面：`http://服务器IP/`
- 健康检查：`http://服务器IP/api/health`

如果健康检查返回 `{"success":true}`，说明反向代理配置成功。

### 3. 测试 TTS 功能
1. 访问产品文案生成页面：`http://服务器IP/modules/product-copy`
2. 第一步：点击"开始生成" → 生成文案
3. 第二步：点击"独立英译" → 翻译文案
4. 第三步：点击"生成语音" → 应该成功调用 TTS

### 4. 检查错误
如果仍然失败，打开浏览器开发者工具（F12）：
- 查看 Console 标签页的错误信息
- 查看 Network 标签页，找到失败的 `/api/voice/tts-from-lines` 请求
- 查看请求的完整 URL 是什么

## 常见问题

### Q1: 构建后仍然失败
**原因**：Docker 镜像没有重新构建
**解决**：
```powershell
# 强制重新构建（不使用缓存）
docker-compose build --no-cache web
docker-compose up -d
```

### Q2: 语音服务地址问题
**检查**：在服务器电脑上确认语音服务是否可访问
```powershell
# 测试语音服务
curl http://192.168.2.29:3000
```

### Q3: CORS 跨域错误
如果浏览器报告 CORS 错误，检查后端 CORS 配置：
```typescript
// api/src/index.ts
app.use(cors({
  origin: '*', // 允许所有来源（内网环境）
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Q4: 环境变量未生效
**检查**：确认 `.env` 文件内容
```bash
# api/.env 应该包含：
COZE_API_TOKEN=your_token
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret
PORT=3000
VOICE_BASE_URL=http://192.168.2.29:3000

# web/.env 应该包含：
VITE_API_BASE=http://服务器IP:3000
# 或者留空（使用相对路径）
# VITE_API_BASE=
```

## 调试技巧

### 1. 查看 API 日志
```powershell
# 实时查看 API 日志
docker-compose logs -f api

# 查看最近 100 行
docker-compose logs --tail=100 api
```

### 2. 查看 Web 日志
```powershell
docker-compose logs -f web
```

### 3. 测试 TTS 接口
在服务器电脑上使用 curl 测试：
```powershell
# 测试 TTS 接口（需要替换 token）
curl -X POST http://localhost:3000/api/voice/tts-from-lines `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -d "{\"lines\":[\"Hello World\"]}"
```

### 4. 检查网络连接
```powershell
# 从 API 容器测试语音服务连通性
docker-compose exec api curl http://192.168.2.29:3000
```

## 成功标志

修复完成后，应该看到：
- ✅ 前端页面正常访问
- ✅ `/api/health` 返回成功
- ✅ TTS 语音生成请求返回 JSON 数据（不是 HTML）
- ✅ 浏览器 Console 没有 CORS 错误
- ✅ 语音任务成功执行

## 联系支持

如果以上步骤都无法解决问题，请提供：
1. 浏览器 F12 的完整错误截图
2. `docker-compose logs` 的完整输出
3. 服务器和客户端的 IP 地址
