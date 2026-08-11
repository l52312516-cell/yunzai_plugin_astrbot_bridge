import fs from "node:fs"
import path from "node:path"
import { DEFAULT_CONFIG } from "./index.js"

const CONFIG_PATH = path.resolve(process.cwd(), "plugins/yunzai_plugin_astrbot_bridge/config.json")

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
}

function readConfig() {
  try {
    const userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
    return {
      ...cloneDefaults(),
      ...userConfig,
      game_queries: Array.isArray(userConfig.game_queries)
        ? userConfig.game_queries
        : cloneDefaults().game_queries,
    }
  } catch {
    return cloneDefaults()
  }
}

function jsonField(value) {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2)
}

function parseJsonArray(value, label) {
  try {
    const parsed = JSON.parse(String(value || "[]"))
    if (!Array.isArray(parsed)) throw new Error("必须是 JSON 数组")
    return parsed
  } catch (error) {
    throw new Error(`${label} 格式错误：${error.message}`)
  }
}

function resultError(Result, message) {
  if (typeof Result?.error === "function") return Result.error({}, message)
  return Result.ok({}, message)
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "yunzai_plugin_astrbot_bridge",
      title: "AstrBot Yunzai 联动",
      author: "l52312516-cell",
      description: "为 AstrBot Agent 提供 Yunzai HTTP RPC 和游戏查询模板",
      isV3: true,
      isV2: false,
      icon: "bi:diagram-3",
      iconColor: "#4f86c6",
    },
    configInfo: {
      schemas: [
        { component: "Divider", label: "权限与风险" },
        {
          field: "permission_policy_notice",
          label: "当前权限策略",
          bottomHelpMessage: "身份来自 AstrBot 当前会话，不能由 Agent 参数覆盖。Token 泄露后，直接 RPC 调用者仍可伪造会话身份。",
          component: "Input",
          componentProps: {
            type: "textarea",
            rows: 5,
            disabled: true,
            placeholder: "主人：全部 Yunzai 权限。普通用户：仅自己的 UID、面板更新及基础游戏查询；未知和高风险命令拒绝。主人会话中的提示注入可能修改配置、更新插件或重启 Yunzai。",
          },
        },
        { component: "Divider", label: "HTTP 服务" },
        {
          field: "host",
          label: "监听地址",
          bottomHelpMessage: "同机使用 127.0.0.1；局域网访问改为 0.0.0.0。",
          component: "Input",
          required: true,
          componentProps: { placeholder: "127.0.0.1" },
        },
        {
          field: "port",
          label: "监听端口",
          component: "InputNumber",
          required: true,
          componentProps: { min: 1, max: 65535, placeholder: "1145" },
        },
        {
          field: "token",
          label: "共享 Token",
          bottomHelpMessage: "必须与 AstrBot 侧配置完全一致。",
          component: "Input",
          required: true,
          componentProps: { type: "password", placeholder: "请输入随机 Token" },
        },
        {
          field: "default_bot_id",
          label: "默认 Bot ID",
          bottomHelpMessage: "多账号 Yunzai 可填写用于执行 RPC 的账号。",
          component: "Input",
        },
        {
          field: "allow_send_reply",
          label: "允许实际发送回复",
          bottomHelpMessage: "关闭时只捕获回复并返回 AstrBot，不发送到群聊或私聊。",
          component: "Switch",
        },
        {
          field: "discover_plugins",
          label: "自动发现插件",
          bottomHelpMessage: "只展示已加载规则；执行时仍按主人/普通用户权限动态判定。",
          component: "Switch",
        },
        {
          field: "max_body_bytes",
          label: "请求体上限",
          component: "InputNumber",
          componentProps: { min: 1024, max: 10485760, placeholder: "1048576" },
        },
        { component: "Divider", label: "游戏模板 JSON" },
        {
          field: "game_queries_json",
          label: "游戏查询模板",
          bottomHelpMessage: "可选 JSON 数组；用于把游戏命令包装成结构化调用。",
          component: "Input",
          componentProps: { type: "textarea", rows: 16 },
        },
      ],
      getConfigData() {
        const config = readConfig()
        return {
          ...config,
          permission_policy_notice: "主人拥有全部 Yunzai 权限；普通用户仅允许自己的 UID、面板与基础游戏查询。未知及高风险命令拒绝。",
          game_queries_json: jsonField(config.game_queries),
        }
      },
      setConfigData(data, { Result }) {
        const current = readConfig()
        const next = { ...current }
        try {
          for (const [field, value] of Object.entries(data || {})) {
            if (field === "game_queries_json") next.game_queries = parseJsonArray(value, "游戏查询模板")
            else if (["host", "token", "default_bot_id"].includes(field)) next[field] = String(value || "").trim()
            else if (["port", "max_body_bytes"].includes(field)) next[field] = Number(value)
            else if (["allow_send_reply", "discover_plugins"].includes(field)) next[field] = Boolean(value)
          }
          if (!next.host) throw new Error("监听地址不能为空")
          if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) {
            throw new Error("监听端口必须是 1-65535 的整数")
          }
          if (!Number.isInteger(next.max_body_bytes) || next.max_body_bytes < 1024) {
            throw new Error("请求体上限必须是不小于 1024 的整数")
          }
          fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
          fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8")
          return Result.ok({}, "保存成功，请重载 Yunzai 插件使配置生效")
        } catch (error) {
          return resultError(Result, error.message)
        }
      },
    },
  }
}
