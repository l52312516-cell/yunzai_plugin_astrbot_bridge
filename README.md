# Yunzai AstrBot Bridge

Yunzai 侧联动插件。它在 Yunzai 进程中监听 HTTP JSON RPC，把 AstrBot Agent 的请求转换为标准 Yunzai 消息事件，并交给统一的 `PluginsLoader.deal(event)` 处理。

因此桥接能力不限于游戏面板。主人可以调用任意已加载插件的指令；普通用户只允许 UID、面板和基础游戏查询等低风险能力。

- 作者：[l52312516-cell](https://github.com/l52312516-cell)
- 仓库：[l52312516-cell/yunzai_plugin_astrbot_bridge](https://github.com/l52312516-cell/yunzai_plugin_astrbot_bridge)
- 配套 AstrBot 插件：[l52312516-cell/astrbot_plugin_yunzai_bridge](https://github.com/l52312516-cell/astrbot_plugin_yunzai_bridge)
- 当前版本：`1.3.5`

## 兼容性

- TRSS Yunzai
- Miao-Yunzai
- Node.js 内置 HTTP 服务，无额外 npm 运行依赖
- 锅巴插件配置后台

插件兼容两种 loader 结构：

- TRSS：`PluginsLoader.priority[*].plugin`
- Miao：`PluginsLoader.priority[*].class`

Miao 插件类只会为读取名称、描述、优先级和规则元数据而实例化，不会调用 `init`、`accept` 或业务 handler。

## 工作方式

```text
AstrBot RPC
  -> Bearer Token 鉴权
  -> 读取 Yunzai 本地主人配置
  -> 匹配已加载插件 rule
  -> 主人/普通用户权限判定
  -> 构造群聊或私聊 event
  -> Bot.prepareEvent(event) 或 Miao 兼容准备
  -> PluginsLoader.deal(event)
  -> 捕获 event.reply
  -> JSON 返回 AstrBot
```

任何符合权限策略且能被 Yunzai loader 匹配的插件指令都可以通过桥接调用，包括游戏、帮助、状态及其他第三方插件。桥接不会直接 import 游戏插件内部函数。

## 安装

### 使用发布包

把完整目录解压到：

```text
<Yunzai>/plugins/yunzai_plugin_astrbot_bridge/
```

正确目录结构：

```text
plugins/
  yunzai_plugin_astrbot_bridge/
    index.js
    guoba.support.js
    config.example.json
    README.md
```

复制示例配置：

```text
config.example.json -> config.json
```

修改 Token 后重启 Yunzai 或重载插件。

### 使用 Git

在 Yunzai 根目录执行：

```bash
git clone https://github.com/l52312516-cell/yunzai_plugin_astrbot_bridge.git plugins/yunzai_plugin_astrbot_bridge
```

然后复制 `config.example.json` 为 `config.json`。

## 锅巴后台

插件包含 `guoba.support.js`。安装后可在锅巴后台找到“AstrBot Yunzai 联动”，配置：

- 监听地址和端口。
- 共享 Token。
- 默认 Bot ID。
- 是否允许实际发送回复。
- 是否自动发现插件。
- 请求体上限。
- `game_queries` JSON 模板。

锅巴顶部会显示只读权限策略和主人风险提示。保存后需要重载本插件或重启 Yunzai，使 HTTP 监听服务重新读取配置。

如果锅巴无法显示插件：

1. 确认目录名为 `yunzai_plugin_astrbot_bridge`。
2. 确认 `index.js` 和 `guoba.support.js` 位于同一目录。
3. 不要只把单个 `index.js` 放进其他插件目录。
4. 重启 Yunzai 与锅巴后端。

## 配置说明

`config.json` 示例：

```json
{
  "host": "127.0.0.1",
  "port": 1145,
  "token": "请替换为足够长的随机字符串",
  "default_bot_id": "",
  "allow_send_reply": true,
  "discover_plugins": true,
  "max_body_bytes": 1048576,
  "game_queries": []
}
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | `127.0.0.1` | HTTP 监听地址；局域网访问改为 `0.0.0.0` |
| `port` | `1145` | HTTP 监听端口 |
| `token` | 空 | 必填，共享鉴权 Token |
| `default_bot_id` | 空 | 执行事件使用的 Yunzai Bot；空时使用当前默认账号 |
| `allow_send_reply` | `true` | 是否沿用初版 `nativeReply` 机制立即发送回复 |
| `discover_plugins` | `true` | 是否在能力接口返回已加载插件规则 |
| `max_body_bytes` | `1048576` | HTTP 请求体最大字节数 |
| `game_queries` | 内置示例 | 可选结构化游戏模板数组 |

Token 为空时，桥接服务不会启动。

## 网络配置

### 同机部署

Yunzai：

```json
{ "host": "127.0.0.1", "port": 1145 }
```

AstrBot：

```text
http://127.0.0.1:1145
```

### Docker 网络

Yunzai 监听 `0.0.0.0`，AstrBot 使用 Yunzai 容器名：

```text
http://yunzai:1145
```

两个容器必须加入同一个 Docker 网络。

### 局域网不同机器

Yunzai：

```json
{ "host": "0.0.0.0", "port": 1145 }
```

AstrBot：

```text
http://<Yunzai服务器内网IP>:1145
```

同时在 Yunzai 主机防火墙放行可信来源访问 TCP `1145`。不建议把接口暴露到公网。

## 分级权限

### 主人身份

- Miao-Yunzai：读取 `masterQQ`。
- TRSS Yunzai：只读取当前 `default_bot_id` 对应的 `master[bot_id]`。
- TRSS 多 Bot 不会把其他 Bot 的主人合并进当前账号。
- RPC payload 中声明的角色和 Bot ID 不会被信任。

主人拥有全部 Yunzai 命令权限。这不仅包括游戏插件，也包括其他已加载插件、配置、更新、安装、重启等高风险命令。

### 普通用户允许范围

普通用户命令首先必须匹配 `PluginsLoader.priority` 中当前已加载的插件规则，然后才会分类：

| 类别 | 示例 |
| --- | --- |
| 自己的 UID | 绑定 UID、修改 UID、切换 UID、设置 UID、解绑 UID |
| 面板更新 | 更新自己的角色面板 |
| 面板查询 | 角色面板、参考面板 |
| 攻略 | 角色攻略、养成、配队 |
| 图鉴资料 | 图鉴、角色资料、武器资料 |
| 实时状态 | 体力、便笺、便签 |
| 战斗数据 | 深渊、战场、战绩、忘却、虚构、末日、展柜 |
| 记录 | 抽卡记录、月历、月收入 |
| 基础入口 | 游戏帮助、菜单、状态、版本 |

### 普通用户拒绝范围

- Cookie、CK、Stoken、Token、Authkey、扫码登录、抽卡链接等凭据。
- 配置、设置默认项、权限、主人、子用户、主用户、代绑。
- 群管理、黑白名单、全局功能开关、面板 API 或服务切换。
- 安装、卸载、插件更新、图鉴更新、强制更新、重启、关机。
- 文件或日志发送、脚本执行、签到领取。
- 规则要求 `master`、`admin` 或 `owner` 的命令。
- 未匹配插件规则或无法归入安全类别的命令。

普通用户调用天气、音乐、群管理或其他非游戏插件时，如果命令无法归入上述安全类别，会默认拒绝。主人可以调用这些插件。这样既保留统一 Yunzai 插件调用能力，又避免普通用户通过 Agent 执行未知副作用。

权限拒绝返回 HTTP `403`：

```json
{
  "success": false,
  "error": "权限不足",
  "error_code": "PERMISSION_DENIED",
  "role": "ordinary",
  "category": "administration",
  "reason": "普通用户不能执行管理或全局修改命令"
}
```

## 游戏查询模板

`game_queries` 用于把结构化参数渲染成普通 Yunzai 命令。它是 Agent 调用便利层，不是白名单，也不会绕过权限分类。

```json
{
  "game_queries": [
    {
      "game": "starrail",
      "aliases": ["sr", "星铁"],
      "action": "strategy",
      "command": "#星铁{keyword}攻略",
      "description": "星铁角色攻略"
    },
    {
      "game": "genshin",
      "aliases": ["gs", "原神"],
      "action": "panel",
      "command": "#面板{uid}",
      "description": "原神角色面板"
    },
    {
      "game": "zzz",
      "aliases": ["绝区零"],
      "action": "panel",
      "command": "#绝区零面板{uid}",
      "description": "绝区零角色面板"
    },
    {
      "game": "wuthering",
      "aliases": ["wuwa", "鸣潮"],
      "action": "help",
      "command": "#鸣潮帮助",
      "description": "鸣潮第三方插件帮助"
    },
    {
      "game": "custom-game",
      "action": "query",
      "command": "#第三方插件查询 {keyword} {args}",
      "description": "任意第三方游戏模板"
    }
  ]
}
```

支持占位符：

- `{keyword}`：角色、武器、图鉴或攻略关键词。
- `{uid}`：游戏 UID。
- `{args}`：其他文本参数。

模板占位符为空时会移除多余空格。最终渲染命令最大 `1000` 字符。第三方游戏插件的命令格式不同，请按插件实际帮助修改模板。

复杂或不适合模板化的已加载插件命令，主人可以直接使用 AstrBot 的 `yunzai_execute` 调用；普通用户仍受安全类别限制。

## 插件自动发现

`GET /astrbot-bridge/v1/capabilities` 返回 `discovered_plugins`：

```json
{
  "discovered_plugins": [
    {
      "key": "example/app.js",
      "name": "Example Plugin",
      "description": "插件描述",
      "priority": 0,
      "rules": [
        {
          "pattern": "^#示例",
          "flags": "i",
          "handler": "handle",
          "event": "message",
          "permission": "",
          "ordinary_access": "runtime_classification",
          "ordinary_candidate": "unclassified"
        }
      ]
    }
  ]
}
```

发现结果有插件数量、规则数量和字段长度上限，防止响应过大。插件加载完成前列表可能为空，后续请求会读取最新 loader 状态。

发现规则只用于能力提示。桥接不会自动把发现到的正则转换成游戏模板，也不会因为规则被发现就给普通用户开放执行权限。

## HTTP API

所有请求必须包含：

```text
Authorization: Bearer <token>
```

### 健康检查

```text
GET /astrbot-bridge/v1/health
```

### 能力发现

```text
GET /astrbot-bridge/v1/capabilities
```

返回权限策略、游戏模板、插件规则、发现状态和发送策略。

### 临时图片媒体

```text
GET /astrbot-bridge/v1/media/<48位随机ID>
```

当 Yunzai 插件通过 `event.reply` 返回图片 `Buffer` 时，桥接不会执行 `String(buffer)`，也不会把 Base64 塞进 JSON。它会缓存图片并在 Tool Result 返回临时媒体路径、MIME、大小和 SHA256。

- 有效期：5 分钟。
- 单张上限：20 MiB。
- 总缓存上限：64 MiB。
- 最大缓存数量：20 张，空间不足时优先淘汰旧图片。
- 访问媒体接口仍需 Bearer Token。
- 超限或不支持的图片值只返回摘要和 `binary_omitted`，不输出原始字节。

### 执行命令

```text
POST /astrbot-bridge/v1/rpc
Content-Type: application/json
```

```json
{
  "id": "request-id",
  "action": "command.execute",
  "command": "#星铁体力",
  "send_reply": false,
  "target": {
    "group_id": "123456",
    "user_id": "654321"
  }
}
```

### 执行游戏模板

```json
{
  "id": "request-id",
  "action": "game.query",
  "game": "starrail",
  "query_action": "strategy",
  "keyword": "黄泉",
  "uid": "",
  "args": "",
  "send_reply": false,
  "target": {
    "group_id": "123456",
    "user_id": "654321"
  }
}
```

常见 HTTP 状态：

| 状态 | 含义 |
| --- | --- |
| `200` | 执行成功 |
| `400` | 参数、JSON、action 或模板错误 |
| `401` | Token 缺失或不正确 |
| `403` | 当前用户没有命令权限 |
| `404` | 路径不存在 |
| `413` | 请求体超过 `max_body_bytes` |

## 事件与回复兼容

桥接根据 `group_id` 构造群聊或私聊事件，并设置常用字段：

- `self_id`、`user_id`、`group_id`
- `message_type`、`post_type`、`sub_type`
- `message`、`raw_message`、`msg`
- `sender`、`atBot`、`hasAlias`、`only_reply_at`

TRSS 使用 `Bot.prepareEvent(event)`；Miao 则补齐 `bot`、`group`、`member`、`friend` 和回复函数。执行前会再次强制设置最终 `event.isMaster`，防止事件准备阶段把普通用户抬升为主人。

`event.reply` 支持捕获：

- 文本消息段。
- 图片 URL、文件路径或二进制 `Buffer`；二进制会转换成临时媒体引用。
- JSON、转发或未知消息段的安全序列化结果。

## 回复发送策略

`allow_send_reply=true` 是默认快速模式。插件在 `event.reply` 发生时调用原生群聊或好友发送函数，不等待 RPC 图片回传和二次上传。

AstrBot 选择 `yunzai_native` 模式且本端开启 `allow_send_reply` 后，桥接会传入 `send_reply=true`。旧 `config.json` 中已有的 `false` 不会自动覆盖，需要在锅巴中手动打开。

AstrBot 选择 `astrbot_forward` 时进入捕获模式：Yunzai 不直接发送，图片由 AstrBot 后备机制转发。选择 `capture_only` 时不实际发送。

每次命令响应都会返回独立发送状态：

- `reply_delivery.status=sent`：全部原生回复已发送。
- `failed`：全部发送失败。
- `partial`：部分成功、部分失败。
- `no_reply`：命令没有调用 `event.reply`。
- `capture_only`：按配置只捕获。

每个捕获消息还带有 `native_delivery` 和可选 `native_delivery_error`。命令 `success:true` 不再被解释为消息一定发送成功。

响应还会返回 `effective_target`，显示 Yunzai 实际构造的目标：

```json
{
  "effective_target": {
    "bot_id": "10001",
    "message_type": "group",
    "group_id": "20001",
    "user_id": "30001"
  }
}
```

重要：`allow_send_reply` 只控制回复发送。命令自身的数据库写入、配置修改、更新或重启副作用不会因此取消。

## 安全边界

1. 主人全权限是明确设计选择。主人会话中的提示注入可以调用高风险 Yunzai 指令。
2. AstrBot Agent 工具不提供身份覆盖参数，但共享 Token 不是不可伪造的身份签名。
3. 任何拿到 Token 且能访问端口的人都可以绕过 AstrBot，直接构造 RPC `user_id`。
4. 使用随机长 Token，优先监听 `127.0.0.1`，局域网使用防火墙或可信容器网络。
5. 不要将端口直接映射到公网，不要在日志、截图或公开配置中泄露 Token。

## 故障排查

### 日志显示未配置 Token

复制 `config.example.json` 为 `config.json` 并填写非空 Token，或通过锅巴保存配置，然后重载插件。

### 端口占用

修改 `port`，并同步修改 AstrBot 的 `yunzai_url`。确保同一个 Yunzai 进程没有重复加载两份桥接插件。

### 局域网无法连接

- `host` 必须是 `0.0.0.0`，不能保持 `127.0.0.1`。
- AstrBot 应填写 Yunzai 主机内网 IP。
- 放行 TCP `1145`，检查路由和容器端口。

### 查询返回 403

- 检查调用者是不是当前 Bot 的主人。
- 普通用户命令是否匹配已加载插件规则。
- 命令是否包含设置、凭据、更新、签到或其他高风险关键词。
- 查看响应中的 `category` 和 `reason`。

### 已安装插件没有出现在能力列表

- 确认 `discover_plugins=true`。
- 等待 Yunzai 完成全部插件加载后重新请求。
- 某些插件构造函数异常时会被安全跳过，并记录警告日志。

### 命令显示成功但没有真实消息

检查 AstrBot 是否选择 Yunzai 原生模式、本端 `allow_send_reply` 是否为 `true`，并查看 `reply_delivery.status`。原生失败时再查看 AstrBot 的 `delivery_error`。

### AstrBot Tool Result 出现 PNG 二进制乱码

旧版代码把图片 `Buffer` 当作 URL 转成了字符串，日志中会出现 `�PNG`、`IHDR` 和 `IDAT`。升级两端到 `1.3.5` 后，默认沿用初版 `nativeReply` 直接发送；AstrBot 转发模式只返回临时媒体摘要。

### 图片发送到错误目标

查看 `effective_target`。群聊应为当前群号，私聊的 `group_id` 应为空。如果目标正确但实际投递错误，检查 `default_bot_id` 是否选中了预期 Yunzai 账号，以及该账号适配器的 `pickGroup/pickFriend` 路由。

## 开发测试

```bash
node tests/test_yunzai_bridge.mjs
node --check yunzai_plugin_astrbot_bridge/index.js
node --check yunzai_plugin_astrbot_bridge/guoba.support.js
```

Node 集成测试会构造临时 Yunzai 根目录和 mock loader，覆盖：

- TRSS/Miao 插件发现。
- 主人识别和跨 Bot 隔离。
- 普通用户允许与拒绝分类。
- 危险 `game_queries` 防绕过。
- 身份缺失和伪造 Bot ID。
- 消息捕获与 `send_reply=false`。
- 锅巴配置读写。
- HTTP 鉴权、状态码和请求处理。

## 作者

- `l52312516-cell`
- GitHub：[https://github.com/l52312516-cell](https://github.com/l52312516-cell)
- 仓库：[https://github.com/l52312516-cell/yunzai_plugin_astrbot_bridge](https://github.com/l52312516-cell/yunzai_plugin_astrbot_bridge)
