# API 接口文档

<cite>
**本文引用的文件**
- [api/src/index.ts](file://api/src/index.ts)
- [api/src/config.ts](file://api/src/config.ts)
- [api/src/db.ts](file://api/src/db.ts)
- [api/src/utils.ts](file://api/src/utils.ts)
- [api/src/middleware/auth.ts](file://api/src/middleware/auth.ts)
- [api/src/coze.ts](file://api/src/coze.ts)
- [api/src/modules.ts](file://api/src/modules.ts)
- [api/src/routes/auth.ts](file://api/src/routes/auth.ts)
- [api/src/routes/files.ts](file://api/src/routes/files.ts)
- [api/src/routes/modules.ts](file://api/src/routes/modules.ts)
- [api/src/routes/runs.ts](file://api/src/routes/runs.ts)
- [api/src/routes/voice.ts](file://api/src/routes/voice.ts)
- [api/package.json](file://api/package.json)
- [web/src/lib/api.ts](file://web/src/lib/api.ts)
- [web/src/pages/VoiceGeneratorPage.tsx](file://web/src/pages/VoiceGeneratorPage.tsx)
</cite>

## 更新摘要
**变更内容**
- 语音接口实现细节更新：TTS 生成接口现在使用直接文本输入而非文件上传，提高了可靠性
- 新增 @gradio/client 依赖，支持 Gradio 语音服务集成
- 语音生成接口重构，从纯 Coze 工作流转向 Gradio 客户端驱动
- 增加语音调试记录功能，支持详细的步骤追踪
- 更新语音服务配置接口，提供 Studio 和 API 页面链接

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能与并发特性](#性能与并发特性)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件为 Coze Workflow 的后端 API 接口文档，覆盖认证、工作流、文件上传、运行（SSE 流）、语音（翻译与 TTS）等模块的完整规范。文档提供：
- RESTful 接口定义（HTTP 方法、URL 模式、请求/响应结构）
- 认证方式与鉴权流程
- 错误处理策略与状态码语义
- 安全与速率限制建议
- 常见用例与客户端实现要点
- 调试工具与监控建议
- 版本信息与兼容性说明

## 项目结构
后端基于 Express 提供 REST API，路由按功能分层挂载在 /api/* 下；前端通过 web/src/lib/api.ts 统一发起请求并处理 SSE。

```mermaid
graph TB
subgraph "后端 API"
IDX["入口: index.ts<br/>挂载各路由"]
AUTH["认证路由: /api/auth/*"]
MODS["模块路由: /api/modules/*"]
FILES["文件路由: /api/files/*"]
RUNS["运行路由: /api/runs/* (SSE)"]
VOICE["语音路由: /api/voice/*<br/>@gradio/client 集成"]
MW["中间件: auth.ts"]
CFG["配置: config.ts"]
DB["数据库: db.ts"]
UTIL["工具: utils.ts"]
COZE["Coze 客户端: coze.ts"]
MODDEF["模块定义: modules.ts"]
end
subgraph "前端"
WEBAPI["web/src/lib/api.ts<br/>统一 fetch 封装/SSE"]
PAGE["web/src/pages/VoiceGeneratorPage.tsx<br/>语音生成页面"]
end
IDX --> AUTH
IDX --> MODS
IDX --> FILES
IDX --> RUNS
IDX --> VOICE
AUTH --> MW
AUTH --> DB
AUTH --> UTIL
MODS --> MODDEF
FILES --> CFG
FILES --> COZE
RUNS --> MW
RUNS --> DB
RUNS --> COZE
VOICE --> MW
VOICE --> CFG
VOICE --> COZE
VOICE --> UTIL
WEBAPI --> IDX
PAGE --> WEBAPI
```

**图表来源**
- [api/src/index.ts:1-29](file://api/src/index.ts#L1-L29)
- [api/src/routes/auth.ts:1-115](file://api/src/routes/auth.ts#L1-L115)
- [api/src/routes/modules.ts:1-20](file://api/src/routes/modules.ts#L1-L20)
- [api/src/routes/files.ts:1-43](file://api/src/routes/files.ts#L1-L43)
- [api/src/routes/runs.ts:1-159](file://api/src/routes/runs.ts#L1-L159)
- [api/src/routes/voice.ts:1-391](file://api/src/routes/voice.ts#L1-L391)
- [api/src/middleware/auth.ts:1-23](file://api/src/middleware/auth.ts#L1-L23)
- [api/src/config.ts:1-19](file://api/src/config.ts#L1-L19)
- [api/src/db.ts:1-35](file://api/src/db.ts#L1-L35)
- [api/src/utils.ts:1-21](file://api/src/utils.ts#L1-L21)
- [api/src/coze.ts:1-8](file://api/src/coze.ts#L1-L8)
- [api/src/modules.ts:1-29](file://api/src/modules.ts#L1-L29)
- [web/src/lib/api.ts:1-160](file://web/src/lib/api.ts#L1-L160)
- [web/src/pages/VoiceGeneratorPage.tsx:1-95](file://web/src/pages/VoiceGeneratorPage.tsx#L1-L95)

**章节来源**
- [api/src/index.ts:1-29](file://api/src/index.ts#L1-L29)

## 核心组件
- 应用入口与路由挂载：在入口文件中启用 CORS、JSON 解析、健康检查，并将各子路由挂载至 /api/*。
- 配置系统：读取环境变量并校验必需项（COZE_API_TOKEN、DATABASE_URL、JWT_SECRET、VOICE_BASE_URL），同时暴露端口与服务地址。
- 数据库：使用 PostgreSQL 连接池，初始化 users 与 runs 表。
- 认证中间件：基于 JWT 的 Bearer Token 鉴权，支持用户信息注入到请求上下文。
- 工具函数：密码哈希/校验、JWT 签发/校验。
- Coze 客户端：封装 @coze/api，统一访问 Coze 平台能力。
- 模块定义：集中管理可用工作流模块及其 workflow_id。
- **新增** Gradio 客户端：封装 @gradio/client，用于语音生成服务集成。

**章节来源**
- [api/src/index.ts:1-29](file://api/src/index.ts#L1-L29)
- [api/src/config.ts:1-19](file://api/src/config.ts#L1-L19)
- [api/src/db.ts:1-35](file://api/src/db.ts#L1-L35)
- [api/src/middleware/auth.ts:1-23](file://api/src/middleware/auth.ts#L1-L23)
- [api/src/utils.ts:1-21](file://api/src/utils.ts#L1-L21)
- [api/src/coze.ts:1-8](file://api/src/coze.ts#L1-L8)
- [api/src/modules.ts:1-29](file://api/src/modules.ts#L1-L29)

## 架构总览
后端采用"路由层-业务层-数据层-外部服务"的分层设计。前端通过统一的 fetch 封装调用后端 API，其中运行接口采用 Server-Sent Events（SSE）推送增量结果。语音接口现集成了 Gradio 客户端，提供更强大的语音生成能力。

```mermaid
sequenceDiagram
participant FE as "前端应用"
participant API as "后端 API"
participant AUTH as "认证中间件"
participant DB as "PostgreSQL"
participant COZE as "Coze 平台"
participant GRADIO as "Gradio 语音服务"
FE->>API : "POST /api/auth/register"
API->>DB : "查询用户名是否存在"
DB-->>API : "结果"
API->>DB : "插入用户记录"
DB-->>API : "返回用户ID/角色"
API-->>FE : "返回 JWT Token"
FE->>API : "POST /api/runs/{key}/run"
API->>AUTH : "校验 Bearer Token"
AUTH-->>API : "通过"
API->>DB : "写入 runs 记录"
API->>COZE : "启动工作流流式执行"
COZE-->>API : "SSE 流式事件"
API-->>FE : "SSE 数据事件"
API->>DB : "更新 runs 状态/输出"
API-->>FE : "SSE done 事件"
FE->>API : "POST /api/voice/config"
API->>AUTH : "校验 Bearer Token"
AUTH-->>API : "通过"
API-->>FE : "返回语音服务配置"
FE->>API : "POST /api/voice/translate-lines"
API->>COZE : "批量翻译工作流"
COZE-->>API : "翻译结果"
API-->>FE : "返回翻译结果"
FE->>API : "POST /api/voice/tts-from-lines"
API->>GRADIO : "连接语音服务"
GRADIO-->>API : "生成音频文件"
API-->>FE : "返回 TTS 结果"
```

**图表来源**
- [api/src/routes/auth.ts:1-115](file://api/src/routes/auth.ts#L1-L115)
- [api/src/routes/runs.ts:1-159](file://api/src/routes/runs.ts#L1-L159)
- [api/src/routes/voice.ts:1-391](file://api/src/routes/voice.ts#L1-L391)
- [api/src/middleware/auth.ts:1-23](file://api/src/middleware/auth.ts#L1-L23)
- [api/src/db.ts:1-35](file://api/src/db.ts#L1-L35)
- [api/src/coze.ts:1-8](file://api/src/coze.ts#L1-L8)

## 详细组件分析

### 认证接口
- 健康检查
  - 方法与路径：GET /health
  - 成功响应：返回 { success: true }
- 注册
  - 方法与路径：POST /api/auth/register
  - 请求体：{ username, email?, password }
  - 成功响应：{ success: true, data: { token } }
  - 失败场景：缺少字段（400）、用户名已存在（409）
- 登录
  - 方法与路径：POST /api/auth/login
  - 请求体：{ username, password }
  - 成功响应：{ success: true, data: { token } }
  - 失败场景：账号或密码错误（401）
- 重置密码
  - 方法与路径：POST /api/auth/reset-password
  - 请求头：Authorization: Bearer {token}
  - 请求体：{ username?, newPassword }
  - 成功响应：{ success: true, message: "密码重置成功" }
  - 失败场景：缺少新密码（400）、无权限（403）、用户不存在（404）、登录失效（401）
- 当前用户
  - 方法与路径：GET /api/auth/me
  - 请求头：Authorization: Bearer {token}
  - 成功响应：{ success: true, data: { id, username, email, role } }
  - 失败场景：登录失效（401）

认证流程（登录/注册）时序

```mermaid
sequenceDiagram
participant C as "客户端"
participant A as "认证路由"
participant U as "工具 : utils.ts"
participant D as "数据库 : db.ts"
C->>A : "POST /api/auth/register"
A->>D : "查询用户名"
D-->>A : "结果"
A->>U : "hashPassword()"
U-->>A : "密码哈希"
A->>D : "插入用户记录"
D-->>A : "返回ID/角色"
A->>U : "signToken()"
U-->>A : "JWT"
A-->>C : "{ token }"
C->>A : "POST /api/auth/login"
A->>D : "查询用户"
D-->>A : "返回哈希"
A->>U : "verifyPassword()"
U-->>A : "匹配结果"
A->>U : "signToken()"
U-->>A : "JWT"
A-->>C : "{ token }"
```

**图表来源**
- [api/src/routes/auth.ts:1-115](file://api/src/routes/auth.ts#L1-L115)
- [api/src/utils.ts:1-21](file://api/src/utils.ts#L1-L21)
- [api/src/db.ts:1-35](file://api/src/db.ts#L1-L35)

**章节来源**
- [api/src/routes/auth.ts:1-115](file://api/src/routes/auth.ts#L1-L115)
- [api/src/middleware/auth.ts:1-23](file://api/src/middleware/auth.ts#L1-L23)
- [api/src/utils.ts:1-21](file://api/src/utils.ts#L1-L21)
- [api/src/db.ts:1-35](file://api/src/db.ts#L1-L35)

### 工作流接口
- 获取模块列表
  - 方法与路径：GET /api/modules/
  - 成功响应：{ success: true, data: ModuleInfo[] }
- 获取指定模块
  - 方法与路径：GET /api/modules/:key
  - 成功响应：{ success: true, data: ModuleInfo }
- 运行工作流（SSE）
  - 方法与路径：POST /api/runs/:key/run
  - 请求头：Authorization: Bearer {token}, Content-Type: application/json
  - 请求体：{ parameters: Record<string, unknown> }
  - 成功响应：HTTP 200，SSE 流
    - 事件类型：data（携带增量事件）、done（结束）、error（异常）
  - 失败场景：模块不存在（404）、缺少参数（400）、登录失效（401）
  - 数据持久化：首次写入 runs 记录，流结束后更新状态与输出

运行接口（SSE）时序

```mermaid
sequenceDiagram
participant FE as "前端"
participant R as "运行路由"
participant A as "认证中间件"
participant DB as "数据库"
participant C as "Coze 客户端"
FE->>R : "POST /api/runs/{key}/run"
R->>A : "校验 Bearer Token"
A-->>R : "通过"
R->>DB : "INSERT runs(RUNNING)"
R->>C : "workflows.runs.stream(...)"
C-->>R : "SSE 事件流"
R-->>FE : "data : 事件"
alt "正常完成"
R->>DB : "UPDATE runs(SUCCESS, output)"
R-->>FE : "event : done"
else "异常"
R->>DB : "UPDATE runs(FAILED, {error})"
R-->>FE : "event : error"
end
```

**图表来源**
- [api/src/routes/runs.ts:1-159](file://api/src/routes/runs.ts#L1-L159)
- [api/src/middleware/auth.ts:1-23](file://api/src/middleware/auth.ts#L1-L23)
- [api/src/db.ts:1-35](file://api/src/db.ts#L1-L35)
- [api/src/coze.ts:1-8](file://api/src/coze.ts#L1-L8)

**章节来源**
- [api/src/routes/modules.ts:1-20](file://api/src/routes/modules.ts#L1-L20)
- [api/src/routes/runs.ts:1-159](file://api/src/routes/runs.ts#L1-L159)
- [api/src/modules.ts:1-29](file://api/src/modules.ts#L1-L29)

### 文件接口
- 上传文件
  - 方法与路径：POST /api/files/upload
  - 请求头：Authorization: Bearer {token}, Content-Type: multipart/form-data
  - 表单字段：file（二进制文件）
  - 成功响应：{ success: true, data: Coze 文件对象 }
  - 失败场景：缺少文件（400）、Coze 上传失败（500）

文件上传流程

```mermaid
flowchart TD
Start(["开始"]) --> CheckFile["检查 multipart file 是否存在"]
CheckFile --> |否| Err400["返回 400 缺少文件"]
CheckFile --> |是| BuildForm["构建 FormData 并附加文件"]
BuildForm --> CallCoze["调用 https://api.coze.cn/v1/files/upload"]
CallCoze --> RespOK{"响应 ok?"}
RespOK --> |否| LogErr["记录错误并返回 500"]
RespOK --> |是| Parse["解析 JSON 响应"]
Parse --> Done["返回 {success:true,data}"]
```

**图表来源**
- [api/src/routes/files.ts:1-43](file://api/src/routes/files.ts#L1-L43)
- [api/src/config.ts:1-19](file://api/src/config.ts#L1-L19)

**章节来源**
- [api/src/routes/files.ts:1-43](file://api/src/routes/files.ts#L1-L43)
- [api/src/config.ts:1-19](file://api/src/config.ts#L1-L19)

### 语音接口
**更新** 语音接口现已集成 @gradio/client，提供更强大的语音生成能力。TTS 生成接口现在使用直接文本输入而非文件上传，提高了可靠性。

- 获取语音服务配置
  - 方法与路径：GET /api/voice/config
  - 请求头：Authorization: Bearer {token}
  - 成功响应：{ success: true, data: { studioUrl, apiUrl, baseUrl } }
  - 失败场景：未配置 VOICE_BASE_URL（500）
- 英文行翻译（批量）
  - 方法与路径：POST /api/voice/translate-lines
  - 请求头：Authorization: Bearer {token}
  - 请求体：{ lines?: string[]; text?: string }
  - 成功响应：{ success: true, data: { sourceLines, translatedLines, txt }, debugId?, debugUrl? }
  - 失败场景：未提取到英文数组（400）、内部错误（500）
- 直接基于英文行生成语音（MP3+SRT）
  - 方法与路径：POST /api/voice/tts-from-lines
  - 请求头：Authorization: Bearer {token}
  - 请求体：{ lines: string[] }
  - 成功响应：{ success: true, data: { lines, txt, tts }, debugId?, debugUrl? }
  - 失败场景：缺少 lines（400）、内部错误（500）
- 调试记录
  - 方法与路径：GET /api/voice/debug 与 GET /api/voice/debug/:id
  - 请求头：Authorization: Bearer {token}
  - 成功响应：列出调试记录或单条记录

语音工作流（翻译+TTS）时序

```mermaid
sequenceDiagram
participant FE as "前端"
participant V as "语音路由"
participant C as "Coze 客户端"
participant G as "Gradio 客户端"
FE->>V : "POST /api/voice/translate-lines"
V->>C : "workflows.runs.stream(BULK_TRANSLATION)"
C-->>V : "SSE 事件流"
V-->>FE : "翻译结果数组"
FE->>V : "POST /api/voice/tts-from-lines"
V->>G : "Client.connect(VOICE_BASE_URL)"
G-->>V : "连接语音服务"
V->>G : "predict('/lambda', {value : true})"
V->>G : "predict('/lambda_1', {value : true})"
V->>G : "predict('/lambda_3', {value : txt}) // 直接传入文本"
G-->>V : "返回音频文件/字幕"
V-->>FE : "返回 {lines, txt, tts}"
```

**图表来源**
- [api/src/routes/voice.ts:1-391](file://api/src/routes/voice.ts#L1-L391)
- [api/src/coze.ts:1-8](file://api/src/coze.ts#L1-L8)

**章节来源**
- [api/src/routes/voice.ts:1-391](file://api/src/routes/voice.ts#L1-L391)

### 数据模型
- 用户表 users
  - 字段：id（主键）、username（唯一）、email、password_hash、role、status、created_at
- 运行记录 runs
  - 字段：id（UUID 主键）、user_id（外键）、module_key、workflow_id、input（JSONB）、output（JSONB）、status、created_at、finished_at

```mermaid
erDiagram
USERS {
serial id PK
varchar username UK
varchar email
text password_hash
varchar role
varchar status
timestamptz created_at
}
RUNS {
uuid id PK
integer user_id FK
varchar module_key
varchar workflow_id
jsonb input
jsonb output
varchar status
timestamptz created_at
timestamptz finished_at
}
USERS ||--o{ RUNS : "拥有"
```

**图表来源**
- [api/src/db.ts:10-35](file://api/src/db.ts#L10-L35)

**章节来源**
- [api/src/db.ts:10-35](file://api/src/db.ts#L10-L35)

## 依赖关系分析
**更新** 新增 @gradio/client 依赖，用于语音生成服务集成。

- 后端依赖
  - @coze/api：调用 Coze 工作流与文件能力
  - **@gradio/client：** 调用 Gradio 语音服务，支持语音合成与音频处理
  - express：Web 服务器与路由
  - pg：PostgreSQL 连接池
  - bcryptjs/jsonwebtoken：密码与 JWT
  - multer/form-data/node-fetch：文件上传
  - dotenv：环境变量加载
- 前端依赖
  - web/src/lib/api.ts：统一 fetch 封装、SSE 读取、本地存储 token
  - web/src/pages/VoiceGeneratorPage.tsx：语音生成页面，展示语音服务配置

```mermaid
graph LR
P["package.json 依赖"] --> E["express"]
P --> PG["pg"]
P --> JWT["jsonwebtoken"]
P --> BC["bcryptjs"]
P --> FD["form-data"]
P --> MF["multer"]
P --> NF["node-fetch"]
P --> DOT["dotenv"]
P --> COZE["@coze/api"]
P --> GRADIO["@gradio/client"]
FE["web/src/lib/api.ts"] --> E
FE --> COZE
PAGE["web/src/pages/VoiceGeneratorPage.tsx"] --> FE
```

**图表来源**
- [api/package.json:11-34](file://api/package.json#L11-L34)
- [web/src/lib/api.ts:1-160](file://web/src/lib/api.ts#L1-L160)
- [web/src/pages/VoiceGeneratorPage.tsx:1-95](file://web/src/pages/VoiceGeneratorPage.tsx#L1-L95)

**章节来源**
- [api/package.json:11-34](file://api/package.json#L11-L34)
- [web/src/lib/api.ts:1-160](file://web/src/lib/api.ts#L1-L160)
- [web/src/pages/VoiceGeneratorPage.tsx:1-95](file://web/src/pages/VoiceGeneratorPage.tsx#L1-L95)

## 性能与并发特性
**更新** 语音接口现集成了 Gradio 客户端，需要考虑语音服务的并发处理能力。

- 并发与流式处理
  - 运行接口采用 SSE，边运行边推送事件，适合长耗时任务的实时反馈。
  - 建议前端以流式读取方式消费事件，避免阻塞。
- 数据库
  - 使用连接池，注意高并发下连接数与查询复杂度控制。
  - runs 查询默认限制数量，避免一次性返回过多数据。
- 文件上传
  - 服务端对 JSON 体大小限制，上传文件通过 multipart 传输，注意带宽与磁盘 IO。
- 外部服务
  - 对 Coze 与 Gradio 的调用可能成为瓶颈，建议增加超时与重试策略（当前实现未内置重试）。
  - Gradio 语音服务的并发连接数有限，需要合理控制请求频率。

## 故障排查指南
**更新** 新增 Gradio 语音服务相关的故障排查指导。

- 常见错误与定位
  - 401 未授权：检查 Authorization 头是否正确携带 Bearer Token；确认 token 未过期。
  - 400 缺少参数：检查请求体字段是否完整（如注册缺少用户名/密码、运行缺少 parameters、翻译缺少 lines/text）。
  - 404 模块不存在：确认模块 key 是否正确。
  - 500 文件上传失败：查看后端日志中 Coze 返回的错误文本，确认 COZE_API_TOKEN 与网络连通性。
  - 500 语音服务未配置：检查 VOICE_BASE_URL 是否设置。
  - **500 Gradio 连接失败：** 检查语音服务地址可达性，确认 Gradio 服务正常运行。
  - **500 TTS 生成失败：** 查看调试记录中的详细步骤，确认语音服务参数配置正确。
- 调试工具与监控
  - 前端可使用浏览器开发者工具 Network 面板观察 SSE 事件与响应。
  - 后端可在 /api/voice/debug 与 /api/voice/debug/:id 查看调试记录，包含每一步的 payload 与时间戳。
  - 建议在生产环境接入日志聚合与指标监控（如请求耗时、错误率、SSE 连接数、Gradio 服务状态）。

**章节来源**
- [api/src/routes/auth.ts:1-115](file://api/src/routes/auth.ts#L1-L115)
- [api/src/routes/runs.ts:1-159](file://api/src/routes/runs.ts#L1-L159)
- [api/src/routes/files.ts:1-43](file://api/src/routes/files.ts#L1-L43)
- [api/src/routes/voice.ts:1-391](file://api/src/routes/voice.ts#L1-L391)

## 结论
本 API 文档覆盖了认证、工作流、文件、运行（SSE）与语音（翻译/TTS）的完整接口规范。通过明确的请求/响应结构、认证方式与错误处理策略，结合调试与监控建议，可帮助开发者快速集成与稳定运行。**最新更新**集成了 @gradio/client，提供了更强大的语音生成能力，TTS 生成接口现在使用直接文本输入而非文件上传，显著提高了可靠性。建议在现有分层架构上新增路由与中间件，保持一致的错误与响应格式。

## 附录

### 认证与安全
- 认证方式：JWT Bearer Token
- 令牌有效期：7 天
- 建议：HTTPS、最小权限原则、定期轮换密钥、审计日志

**章节来源**
- [api/src/utils.ts:14-20](file://api/src/utils.ts#L14-L20)
- [api/src/middleware/auth.ts:8-22](file://api/src/middleware/auth.ts#L8-L22)

### 错误处理策略
- 统一响应结构：{ success: boolean, message?, data?, debugId?, debugUrl? }
- 状态码语义：400/401/403/404/409/500
- SSE 异常：通过 event: error 推送错误消息；若已有有效输出则标记为 SUCCESS 并附加 warning
- **语音接口异常：** 支持详细的调试记录，包含每个步骤的输入输出与时间戳

**章节来源**
- [api/src/routes/runs.ts:124-156](file://api/src/routes/runs.ts#L124-L156)
- [api/src/routes/auth.ts:15-24](file://api/src/routes/auth.ts#L15-L24)

### 速率限制与配额
- 当前实现未内置速率限制
- 建议：在网关或反向代理层添加限流策略；针对 Coze 与 Gradio 的调用增加超时与退避重试
- **Gradio 语音服务：** 需要特别注意并发连接数限制，建议实现队列机制

### 版本信息
- 后端版本：0.1.0（package.json 中声明）
- 外部依赖：@coze/api 1.3.1、**@gradio/client 1.12.0**、express 4.x、pg 8.x 等

**章节来源**
- [api/package.json:2-4](file://api/package.json#L2-L4)

### 客户端实现要点
- 统一 fetch 封装：自动注入 Content-Type 与 Authorization 头
- SSE 处理：逐条解析 data 与 event 行，分别触发消息回调与完成/错误回调
- 本地存储：使用 localStorage 存储 token，401 时清理并触发登出回调
- **语音服务集成：** 前端页面可直接访问语音服务的 Studio 和 API 页面

**章节来源**
- [web/src/lib/api.ts:13-36](file://web/src/lib/api.ts#L13-L36)
- [web/src/lib/api.ts:58-115](file://web/src/lib/api.ts#L58-L115)
- [web/src/pages/VoiceGeneratorPage.tsx:1-95](file://web/src/pages/VoiceGeneratorPage.tsx#L1-L95)

### 运行接口（SSE）事件流
- 数据事件：data: {...}
- 结束事件：event: done，data: { runId }
- 错误事件：event: error，data: { message }

**章节来源**
- [api/src/routes/runs.ts:111-123](file://api/src/routes/runs.ts#L111-L123)
- [api/src/routes/runs.ts:141-155](file://api/src/routes/runs.ts#L141-L155)
- [web/src/lib/api.ts:94-113](file://web/src/lib/api.ts#L94-L113)

### 语音调试记录
- 支持查看调试列表与单条记录，便于定位翻译与 TTS 步骤问题
- **调试记录包含：** 输入参数、中间步骤、输出结果、错误信息与时间戳

**章节来源**
- [api/src/routes/voice.ts:243-260](file://api/src/routes/voice.ts#L243-L260)
- [api/src/routes/voice.ts:262-328](file://api/src/routes/voice.ts#L262-L328)
- [api/src/routes/voice.ts:330-389](file://api/src/routes/voice.ts#L330-L389)

### Gradio 语音服务集成
**新增** 语音接口现集成了 @gradio/client，提供以下功能：
- 语音服务配置获取
- 批量英文行翻译
- 直接语音生成（MP3+SRT）
- 详细的调试记录与步骤追踪
- 支持多种语音参数配置

**章节来源**
- [api/src/routes/voice.ts:1-391](file://api/src/routes/voice.ts#L1-L391)
- [api/src/config.ts:1-19](file://api/src/config.ts#L1-L19)