import http from "node:http"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import PluginsLoader from "../../lib/plugins/loader.js"
import Config from "../../lib/config/config.js"

const PLUGIN_DIR = path.resolve(process.cwd(), "plugins/yunzai_plugin_astrbot_bridge")
const CONFIG_PATH = path.join(PLUGIN_DIR, "config.json")
const SHARED_KEY = Symbol.for("astrbot.yunzai.bridge.server")
const MEDIA_CACHE_KEY = Symbol.for("astrbot.yunzai.bridge.media")
const VERSION = "1.3.7"
const MAX_COMMAND_LENGTH = 1000
const MEDIA_TTL_MS = 5 * 60 * 1000
const MEDIA_MAX_ITEMS = 20
const MEDIA_MAX_ITEM_BYTES = 20 * 1024 * 1024
const MEDIA_MAX_TOTAL_BYTES = 64 * 1024 * 1024
const DISCOVERY_LIMITS = Object.freeze({
  plugins: 200,
  rulesPerPlugin: 50,
  patternLength: 500,
})

export const DEFAULT_GAME_QUERIES = [
  { game: "bh2", action: "help", command: "#BH2帮助", description: "崩坏学园2帮助" },
  { game: "bh2", action: "status", command: "#BH2状态", description: "崩坏学园2插件状态" },
  { game: "bh2", action: "account", command: "#BH2账号 {uid}", description: "崩坏学园2账号信息" },
  { game: "bh2", action: "login_days", command: "#BH2登录天数 {uid}", description: "崩坏学园2登录天数" },
  { game: "bh2", action: "showcase", command: "#BH2看板 {uid}", description: "崩坏学园2看板" },
  { game: "bh2", action: "catalog", command: "#BH2图鉴 {keyword}", description: "崩坏学园2图鉴搜索" },
  { game: "bh2", action: "detail", command: "#BH2图鉴详情 {keyword}", description: "崩坏学园2图鉴详情" },

  { game: "bh3", action: "help", command: "#崩坏3帮助文本", description: "崩坏3帮助文本" },
  { game: "bh3", action: "panel", command: "#崩坏3面板 {uid}", description: "崩坏3面板" },
  { game: "bh3", action: "note", command: "#崩坏3便笺 {uid}", description: "崩坏3实时便笺" },
  { game: "bh3", action: "characters", command: "#崩坏3角色 {uid} {keyword}", description: "崩坏3角色列表或角色面板" },
  { game: "bh3", action: "abyss", command: "#崩坏3深渊 {uid}", description: "崩坏3深渊" },
  { game: "bh3", action: "battlefield", command: "#崩坏3战场 {uid}", description: "崩坏3记忆战场" },
  { game: "bh3", action: "elysian_realm", command: "#崩坏3逐光 {uid}", description: "崩坏3逐光" },
  { game: "bh3", action: "wiki", command: "#崩坏3图鉴 {keyword}", description: "崩坏3图鉴搜索" },
  { game: "bh3", action: "wiki_detail", command: "#崩坏3图鉴详情 {keyword}", description: "崩坏3图鉴详情" },
  { game: "bh3", action: "art", command: "#崩坏3角色图 {keyword}", description: "崩坏3角色图" },
  { game: "bh3", action: "damage", command: "#崩坏3伤害 {keyword} {args}", description: "崩坏3伤害估算" },

  { game: "starrail", aliases: ["sr", "星铁"], action: "help", command: "#星铁帮助", description: "星铁帮助" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "panel", command: "#星铁{keyword}面板", description: "星铁角色面板" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "note", command: "#星铁体力", description: "星铁体力" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "abyss", command: "#星铁深渊", description: "星铁深渊" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "forgotten_hall", command: "#星铁忘却", description: "星铁忘却之庭" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "fiction", command: "#星铁虚构", description: "星铁虚构叙事" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "apocalyptic_shadow", command: "#星铁末日", description: "星铁末日幻影" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "rogue", command: "#星铁模拟宇宙", description: "星铁模拟宇宙" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "gacha", command: "#星铁抽卡记录", description: "星铁抽卡记录" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "month", command: "#星铁月历", description: "星铁月收入" },
  { game: "starrail", aliases: ["sr", "星铁"], action: "strategy", command: "#星铁{keyword}攻略", description: "星铁攻略" },
]

export const DEFAULT_CONFIG = {
  host: "127.0.0.1",
  port: 1145,
  token: "",
  default_bot_id: "",
  discover_plugins: true,
  max_body_bytes: 1024 * 1024,
  game_queries: DEFAULT_GAME_QUERIES,
}

function log(level, message) {
  const fn = globalThis.logger?.[level] || globalThis.logger?.info
  if (typeof fn === "function") fn.call(globalThis.logger, `[AstrBot Bridge] ${message}`)
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

function binaryBuffer(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (value?.type === "Buffer" && Array.isArray(value.data)) return Buffer.from(value.data)
  return null
}

function imageMimeType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg"
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif"
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp"
  return "application/octet-stream"
}

function mediaCache() {
  if (!(globalThis[MEDIA_CACHE_KEY] instanceof Map)) globalThis[MEDIA_CACHE_KEY] = new Map()
  return globalThis[MEDIA_CACHE_KEY]
}

function pruneMediaCache(now = Date.now()) {
  const cache = mediaCache()
  for (const [id, media] of cache) {
    if (media.expires_at <= now) cache.delete(id)
  }
  let totalBytes = [...cache.values()].reduce((sum, media) => sum + media.buffer.length, 0)
  while (cache.size > MEDIA_MAX_ITEMS || totalBytes > MEDIA_MAX_TOTAL_BYTES) {
    const oldestId = cache.keys().next().value
    if (!oldestId) break
    totalBytes -= cache.get(oldestId)?.buffer.length || 0
    cache.delete(oldestId)
  }
  return { cache, totalBytes }
}

function cacheImage(buffer) {
  const mimeType = imageMimeType(buffer)
  const summary = {
    mime_type: mimeType,
    size_bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  }
  if (buffer.length > MEDIA_MAX_ITEM_BYTES) {
    return { ...summary, url: "", binary_omitted: true, reason: "image_too_large" }
  }
  const state = pruneMediaCache()
  while (state.cache.size >= MEDIA_MAX_ITEMS || state.totalBytes + buffer.length > MEDIA_MAX_TOTAL_BYTES) {
    const oldestId = state.cache.keys().next().value
    if (!oldestId) break
    state.totalBytes -= state.cache.get(oldestId)?.buffer.length || 0
    state.cache.delete(oldestId)
  }
  if (state.totalBytes + buffer.length > MEDIA_MAX_TOTAL_BYTES) {
    return { ...summary, url: "", binary_omitted: true, reason: "media_cache_full" }
  }
  const id = crypto.randomBytes(24).toString("hex")
  state.cache.set(id, { buffer: Buffer.from(buffer), mime_type: mimeType, expires_at: Date.now() + MEDIA_TTL_MS })
  return {
    ...summary,
    url: `/astrbot-bridge/v1/media/${id}`,
    temporary: true,
    expires_in_seconds: MEDIA_TTL_MS / 1000,
    requires_bearer_token: true,
  }
}

function cachedImageFromString(value) {
  const dataUrl = value.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i)
  if (dataUrl) {
    try {
      return cacheImage(Buffer.from(dataUrl[2].replace(/\s+/g, ""), "base64"))
    } catch {
      return { url: "", binary_omitted: true, reason: "invalid_image_data_url" }
    }
  }
  const controlCharacters = [...value].filter(character => {
    const code = character.charCodeAt(0)
    return code < 32 && character !== "\r" && character !== "\n" && character !== "\t"
  }).length
  if (value.includes("\u0000") || (/PNG[\r\n]/.test(value) && controlCharacters > 0)) {
    return {
      url: "",
      binary_omitted: true,
      reason: "binary_string_cannot_be_recovered",
      size_characters: value.length,
    }
  }
  return { url: value }
}

export function getCachedMedia(id) {
  const { cache } = pruneMediaCache()
  return cache.get(String(id || "")) || null
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

const PRIVILEGED_PERMISSIONS = new Set(["master", "admin", "owner"])
const CREDENTIAL_PATTERN = /(cookie|stoken|authkey|token|(^|[^a-z])ck([^a-z]|$)|扫码|抽卡链接)/i
const ADMIN_PATTERN = /(配置|权限|主人|子用户|主用户|代绑|群管理|黑名单|白名单|安装|卸载|重启|关机|删除|清空|重置|恢复默认|发送.{0,8}(?:文件|日志)|(?:文件|日志).{0,8}发送|执行脚本|脚本执行|签到|领取|强制更新|图鉴更新|更新图鉴|插件更新|更新插件|更新全部|更新.{0,12}攻略|攻略.{0,12}更新|设置.{0,12}(?:默认|权限|主人|api|服务)|插件面板.*(?:开启|关闭)|切换.*面板.*(?:api|服务))/i
const UID_PATTERN = /((绑定|修改|切换|设置).{0,12}(uid|用户编号|\d{5,12})|(uid|用户编号).{0,12}(绑定|修改|切换|设置|解绑)|解绑(?:uid|用户编号)?$)/i
const SETTING_PATTERN = /(设置|开启|关闭)/i
const PANEL_UPDATE_PATTERN = /(更新.{0,12}面板|面板.{0,12}更新)/i
const QUERY_CATEGORIES = [
  ["panel", /(面板|参考面板)/i],
  ["strategy", /(攻略|配队|养成)/i],
  ["catalog", /(图鉴|角色资料|武器资料|角色信息|武器信息)/i],
  ["note", /(体力|便笺|便签)/i],
  ["combat", /(深渊|战场|战绩|忘却|虚构|末日|模拟宇宙|展柜)/i],
  ["records", /(抽卡记录|月历|月收入)/i],
  ["help", /(帮助|菜单|状态|版本)/i],
]

function botIdValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim()
  return String(value || "").trim()
}

function defaultBotId(config) {
  return botIdValue(config.default_bot_id || globalThis.Bot?.uin)
}

function boundedString(value, maxLength = DISCOVERY_LIMITS.patternLength) {
  const text = String(value || "")
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function pluginForDiscovery(entry) {
  if (entry?.plugin && typeof entry.plugin === "object") return entry.plugin
  if (typeof entry?.class !== "function") return null
  try {
    // Miao-Yunzai keeps the plugin class in priority instead of its instance.
    // Constructors are only used for metadata; init/accept/handlers are never called.
    return new entry.class()
  } catch (error) {
    log("warn", `跳过无法读取元数据的插件 ${entry?.key || entry?.name || "unknown"}: ${error?.message || error}`)
    return null
  }
}

function rulePattern(rawRule) {
  return rawRule?.reg ?? rawRule?.regex ?? rawRule?.pattern ?? ""
}

function testRule(rawRule, command) {
  const pattern = rulePattern(rawRule)
  if (!pattern) return false
  try {
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0
      return pattern.test(command)
    }
    return new RegExp(String(pattern)).test(command)
  } catch (error) {
    log("warn", `忽略无效插件规则: ${error?.message || error}`)
    return false
  }
}

function matchedPluginRules(command) {
  const matches = []
  for (const entry of normalizeArray(PluginsLoader?.priority).slice(0, DISCOVERY_LIMITS.plugins)) {
    const pluginInstance = pluginForDiscovery(entry)
    for (const rawRule of normalizeArray(pluginInstance?.rule).slice(0, DISCOVERY_LIMITS.rulesPerPlugin)) {
      if (!testRule(rawRule, command)) continue
      matches.push({
        plugin: boundedString(pluginInstance?.name || entry?.name || entry?.key),
        handler: boundedString(rawRule.fnc || rawRule.fn || rawRule.handler),
        permission: String(rawRule.permission || "").trim().toLowerCase(),
        pattern: boundedString(rulePattern(rawRule) instanceof RegExp ? rulePattern(rawRule).source : rulePattern(rawRule)),
      })
    }
  }
  return matches
}

export function masterIds(botId, configSource = Config) {
  try {
    const botScoped = configSource?.master
    if (botScoped && typeof botScoped === "object") {
      return normalizeArray(botScoped[String(botId)])
        .map(value => String(value || "").trim())
        .filter(Boolean)
    }
    return normalizeArray(configSource?.masterQQ)
      .map(value => String(value || "").trim())
      .filter(Boolean)
  } catch (error) {
    log("warn", `读取主人配置失败: ${error?.message || error}`)
    return []
  }
}

export function isMasterIdentity(userId, botId, configSource = Config) {
  const id = String(userId || "").trim()
  return Boolean(id) && masterIds(botId, configSource).includes(id)
}

export function classifyOrdinaryCommand(command) {
  const text = String(command || "").trim()
  const matches = matchedPluginRules(text)
  if (!matches.length) return { allowed: false, category: "unknown", reason: "命令未匹配已加载插件规则", matches }
  if (matches.some(item => PRIVILEGED_PERMISSIONS.has(item.permission))) {
    return { allowed: false, category: "privileged_rule", reason: "插件规则要求主人或管理员权限", matches }
  }
  if (CREDENTIAL_PATTERN.test(text)) {
    return { allowed: false, category: "credential", reason: "普通用户不能通过 Agent 管理凭据", matches }
  }
  if (ADMIN_PATTERN.test(text)) {
    return { allowed: false, category: "administration", reason: "普通用户不能执行管理或全局修改命令", matches }
  }
  if (UID_PATTERN.test(text)) return { allowed: true, category: "uid_self_service", reason: "允许管理自己的游戏 UID", matches }
  if (SETTING_PATTERN.test(text)) {
    return { allowed: false, category: "administration", reason: "普通用户不能执行设置或开关命令", matches }
  }
  if (PANEL_UPDATE_PATTERN.test(text)) return { allowed: true, category: "panel_update", reason: "允许更新自己的角色面板", matches }
  for (const [category, pattern] of QUERY_CATEGORIES) {
    if (pattern.test(text)) return { allowed: true, category, reason: "允许基础游戏查询", matches }
  }
  return { allowed: false, category: "unclassified", reason: "命令不属于普通用户基础游戏查询", matches }
}

function discoveredRule(rawRule) {
  if (!rawRule || typeof rawRule !== "object") return null
  const rawPattern = rawRule.reg ?? rawRule.regex ?? rawRule.pattern ?? ""
  const pattern = rawPattern instanceof RegExp ? rawPattern.source : String(rawPattern)
  if (!pattern) return null
  const permission = String(rawRule.permission || "").toLowerCase()
  let ordinaryCandidate = "unclassified"
  if (PRIVILEGED_PERMISSIONS.has(permission)) ordinaryCandidate = "privileged_rule"
  else if (CREDENTIAL_PATTERN.test(pattern)) ordinaryCandidate = "credential"
  else if (ADMIN_PATTERN.test(pattern) || SETTING_PATTERN.test(pattern)) ordinaryCandidate = "administration"
  else if (UID_PATTERN.test(pattern)) ordinaryCandidate = "uid_self_service"
  else if (PANEL_UPDATE_PATTERN.test(pattern)) ordinaryCandidate = "panel_update"
  else {
    const query = QUERY_CATEGORIES.find(([, candidatePattern]) => candidatePattern.test(pattern))
    if (query) ordinaryCandidate = query[0]
  }
  return {
    pattern: boundedString(pattern),
    flags: rawPattern instanceof RegExp ? rawPattern.flags : "",
    handler: boundedString(rawRule.fnc || rawRule.fn || rawRule.handler),
    event: boundedString(rawRule.event),
    permission: boundedString(rawRule.permission),
    ordinary_access: PRIVILEGED_PERMISSIONS.has(permission)
      ? "denied"
      : "runtime_classification",
    ordinary_candidate: ordinaryCandidate,
  }
}

export function discoverPlugins(config = DEFAULT_CONFIG) {
  if (config.discover_plugins === false) return []
  const entries = normalizeArray(PluginsLoader?.priority).slice(0, DISCOVERY_LIMITS.plugins)
  return entries.map(entry => {
    const pluginInstance = pluginForDiscovery(entry)
    const rules = normalizeArray(pluginInstance?.rule)
      .slice(0, DISCOVERY_LIMITS.rulesPerPlugin)
      .map(discoveredRule)
      .filter(Boolean)
    return {
      key: boundedString(entry?.key || entry?.name),
      name: boundedString(pluginInstance?.name || entry?.name),
      description: boundedString(pluginInstance?.dsc || pluginInstance?.description),
      priority: Number.isFinite(Number(pluginInstance?.priority ?? entry?.priority))
        ? Number(pluginInstance?.priority ?? entry?.priority)
        : 0,
      rules,
    }
  }).filter(entry => entry.key || entry.name || entry.rules.length)
}

export async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8")
    const userConfig = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      discover_plugins: userConfig.discover_plugins !== false,
      game_queries: Array.isArray(userConfig.game_queries)
        ? userConfig.game_queries
        : DEFAULT_CONFIG.game_queries,
    }
  } catch {
    return { ...DEFAULT_CONFIG, game_queries: [...DEFAULT_CONFIG.game_queries] }
  }
}

export function isAuthorized(req, token) {
  if (!token) return false
  const header = String(req.headers.authorization || "")
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!provided) return false
  const expected = Buffer.from(token)
  const actual = Buffer.from(provided)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export function gameQueryRule(item) {
  if (!item || typeof item !== "object") return null
  const game = String(item.game || "").trim().toLowerCase()
  const action = String(item.action || "").trim().toLowerCase()
  const command = String(item.command || "").trim()
  if (!game || !action || !command) return null
  return {
    game,
    aliases: normalizeArray(item.aliases).map(alias => String(alias).trim().toLowerCase()).filter(Boolean),
    action,
    command,
    description: String(item.description || ""),
  }
}

export function listGameQueries(config) {
  return normalizeArray(config.game_queries)
    .map(gameQueryRule)
    .filter(Boolean)
}

export function findGameQuery(game, action, config) {
  const normalizedGame = String(game || "").trim().toLowerCase()
  const normalizedAction = String(action || "").trim().toLowerCase()
  if (!normalizedGame || !normalizedAction) return null
  return listGameQueries(config).find(rule =>
    rule.action === normalizedAction &&
    (rule.game === normalizedGame || rule.aliases.includes(normalizedGame))
  ) || null
}

function templateValue(key, payload) {
  if (key === "keyword") return payload.keyword
  if (key === "uid") return payload.uid
  if (key === "args") return payload.args
  return ""
}

export function renderGameCommand(rule, payload) {
  const rendered = String(rule.command || "").replace(/\{(keyword|uid|args)\}/g, (_, key) =>
    String(templateValue(key, payload) || "").trim(),
  )
  return rendered.replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim()
}

export function normalizeMessage(message) {
  const parts = Array.isArray(message) ? message : [message]
  return parts
    .map(part => {
      if (typeof part === "string") return { type: "text", text: part }
      if (!part || typeof part !== "object") return null
      if (part.type === "text") return { type: "text", text: String(part.text || part.data || "") }
      if (part.type === "image") {
        const candidates = [part.url, part.file, part.data?.url, part.data?.file, part.data]
        for (const candidate of candidates) {
          const buffer = binaryBuffer(candidate)
          if (buffer) return { type: "image", ...cacheImage(buffer) }
          if (typeof candidate === "string" && candidate) {
            return { type: "image", ...cachedImageFromString(candidate) }
          }
        }
        return { type: "image", url: "", binary_omitted: true, reason: "unsupported_image_value" }
      }
      return { type: String(part.type || "unknown"), data: safeJson(part) }
    })
    .filter(Boolean)
}

export function buildEvent(payload, config) {
  const target = payload.target && typeof payload.target === "object" ? payload.target : {}
  const botId = defaultBotId(config)
  const groupId = String(target.group_id || "").trim()
  const userId = String(target.user_id || "").trim()

  if (!botId) throw new Error("没有可用的 Yunzai bot_id")
  if (!userId) throw new Error("缺少真实会话 user_id，已拒绝执行")

  const messageType = groupId ? "group" : "private"
  const command = String(payload.command || "").trim()
  return {
    self_id: botId,
    user_id: userId,
    group_id: groupId || undefined,
    message_type: messageType,
    post_type: "message",
    sub_type: groupId ? "normal" : "friend",
    message_id: `astrbot-${crypto.randomUUID()}`,
    message: [{ type: "text", text: command }],
    raw_message: command,
    // Both TRSS and Miao append message text into msg during deal().
    msg: "",
    atBot: true,
    hasAlias: true,
    only_reply_at: true,
    sender: { user_id: userId, nickname: "AstrBot Agent" },
  }
}

function botAccount(botId) {
  const bot = globalThis.Bot
  if (!bot) return null
  try {
    const account = bot[botId]
    if (account && typeof account === "object") return account
  } catch (error) {
    log("warn", `读取 Yunzai bot ${botId} 失败: ${error?.message || error}`)
  }
  if (botIdValue(bot.uin) === botId) return bot
  return null
}

export function prepareEventCompat(event) {
  const prepare = globalThis.Bot?.prepareEvent
  if (typeof prepare === "function") {
    prepare.call(globalThis.Bot, event)
    return event
  }

  // Miao-Yunzai has no Bot.prepareEvent; fill the common event fields used by
  // its loader and adapters before PluginsLoader.deal() receives the event.
  const bot = botAccount(event.self_id)
  if (!bot) throw new Error(`找不到 Yunzai bot: ${event.self_id}`)
  event.bot ||= bot

  if (event.group_id && typeof bot.pickGroup === "function") {
    event.group ||= bot.pickGroup(event.group_id)
    if (event.user_id && typeof bot.pickMember === "function") {
      event.member ||= bot.pickMember(event.group_id, event.user_id)
    }
  } else if (event.user_id) {
    const pickUser = bot.pickUser || bot.pickFriend
    if (typeof pickUser === "function") event.friend ||= pickUser.call(bot, event.user_id)
  }

  event.group_name ||= event.group?.name || event.group?.group_name
  if (!event.sender || typeof event.sender !== "object") {
    event.sender = { user_id: event.user_id, nickname: "AstrBot Agent" }
  } else if (!event.sender.nickname) {
    try {
      event.sender.nickname = event.friend?.nickname || event.group?.name || "AstrBot Agent"
    } catch {
      event.sender = { ...event.sender, nickname: "AstrBot Agent" }
    }
  }

  if (!event.reply) {
    const target = event.group || event.friend
    if (typeof target?.sendMsg === "function") event.reply = target.sendMsg.bind(target)
    else if (event.group_id && typeof bot.sendGroupMsg === "function") {
      event.reply = message => bot.sendGroupMsg(event.self_id, event.group_id, message)
    } else if (typeof bot.sendFriendMsg === "function") {
      event.reply = message => bot.sendFriendMsg(event.self_id, event.user_id, message)
    }
  }
  return event
}

function resultBase(id) {
  return {
    success: false,
    request_id: id || crypto.randomUUID(),
    messages: [],
    error: "",
    duration_ms: 0,
  }
}

function denyPermission(result, role, reason, category = "denied") {
  result.error = "权限不足"
  result.error_code = "PERMISSION_DENIED"
  result.role = role
  result.reason = reason
  result.category = category
  return result
}

export function authorizeCommand(payload, config, configSource = Config) {
  const target = payload?.target && typeof payload.target === "object" ? payload.target : {}
  const userId = String(target.user_id || "").trim()
  const botId = defaultBotId(config)
  if (!userId) {
    return { allowed: false, role: "ordinary", category: "missing_identity", reason: "缺少真实会话 user_id" }
  }
  if (isMasterIdentity(userId, botId, configSource)) {
    return { allowed: true, role: "master", category: "master_full_access", reason: "Yunzai 主人拥有完整权限" }
  }
  return { role: "ordinary", ...classifyOrdinaryCommand(payload.command) }
}

async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error("请求体过大"), { statusCode: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  })
  res.end(body)
}

export async function executeCommand(payload, config) {
  const started = Date.now()
  const result = resultBase(payload.id)
  const command = String(payload.command || "").trim()
  if (!command) {
    result.error = "command 不能为空"
    return result
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    result.error = `command 长度不能超过 ${MAX_COMMAND_LENGTH} 个字符`
    return result
  }

  return runCommand({ ...payload, command }, config, result, started)
}

export async function executeGameQuery(payload, config) {
  const started = Date.now()
  const result = resultBase(payload.id)
  const rule = findGameQuery(payload.game, payload.query_action || payload.action_name || payload.game_action, config)
  if (!rule) {
    result.error = "未配置该 game/action 的游戏查询模板；普通命令请使用 yunzai_execute"
    return result
  }

  const command = renderGameCommand(rule, {
    keyword: payload.keyword,
    uid: payload.uid,
    args: payload.args,
  })
  if (!command) {
    result.error = "游戏查询模板渲染为空命令"
    return result
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    result.error = `渲染后的 command 长度不能超过 ${MAX_COMMAND_LENGTH} 个字符`
    return result
  }

  result.game_query = {
    game: rule.game,
    action: rule.action,
    command,
    description: rule.description,
  }
  return runCommand({ ...payload, command }, config, result, started)
}

async function runCommand(payload, config, result, started) {
  try {
    const access = authorizeCommand(payload, config)
    result.role = access.role
    result.category = access.category
    if (!access.allowed) {
      denyPermission(result, access.role, access.reason, access.category)
      result.duration_ms = Date.now() - started
      log("warn", `拒绝 ${access.role} 用户 ${payload?.target?.user_id || "unknown"} 执行 ${payload.command}: ${access.reason}`)
      return result
    }
    const event = buildEvent(payload, config)
    result.effective_target = {
      bot_id: event.self_id,
      message_type: event.message_type,
      group_id: event.group_id || "",
      user_id: event.user_id,
    }
    prepareEventCompat(event)
    // Session role is decided above from Yunzai's scoped master config.
    // Do not let adapter preparation promote an ordinary bridge event.
    event.isMaster = access.role === "master"
    const nativeReply = event.reply
    const deliveryRecords = []
    // Preserve v1.2.1 semantics: plugin handlers await the real Yunzai reply
    // directly. Do not defer nativeReply into a tracking Promise or wait for it
    // a second time after PluginsLoader.deal().
    event.reply = async (message = "", quote = false, data = {}) => {
      const capturedMessages = normalizeMessage(message)
      result.messages.push(...capturedMessages)
      const record = { capturedMessages, status: "pending", error: "" }
      deliveryRecords.push(record)
      if (!payload.send_reply) {
        record.status = "capture_only"
        return { message_id: `astrbot-capture-${crypto.randomUUID()}` }
      }
      if (typeof nativeReply !== "function") {
        record.status = "failed"
        record.error = "native_reply_unavailable"
        return false
      }
      try {
        const value = await nativeReply(message, quote, data)
        record.status = value === false ? "failed" : "sent"
        if (value === false) record.error = "native_reply_returned_false"
        return value
      } catch (error) {
        record.status = "failed"
        record.error = error?.message || String(error)
        return false
      }
    }
    const handlerResult = await PluginsLoader.deal(event)
    for (const record of deliveryRecords) {
      for (const message of record.capturedMessages) {
        message.native_delivery = record.status
        if (record.error) message.native_delivery_error = record.error
      }
    }
    const succeeded = deliveryRecords.filter(record => record.status === "sent").length
    const failed = deliveryRecords.filter(record => record.status === "failed").length
    const pending = deliveryRecords.filter(record => record.status === "pending").length
    result.reply_delivery = {
      requested: Boolean(payload.send_reply),
      status: !payload.send_reply
        ? "capture_only"
        : !deliveryRecords.length
          ? "no_reply"
          : failed === 0
            ? pending > 0 ? "pending" : "sent"
            : succeeded > 0
              ? "partial"
              : "failed",
      attempts: payload.send_reply ? deliveryRecords.length : 0,
      succeeded,
      failed,
      pending,
      errors: [...new Set(deliveryRecords.map(record => record.error).filter(Boolean))],
    }
    if (failed) result.warning = "命令已执行，但部分或全部 Yunzai 回复发送失败"
    if (handlerResult !== undefined && handlerResult !== true) {
      result.handler_result = safeJson(handlerResult)
    }
    result.command = event.raw_message
    result.success = true
  } catch (error) {
    result.error = error?.message || String(error)
  }
  result.duration_ms = Date.now() - started
  return result
}

export function capabilities(config) {
  return {
    success: true,
    service: "yunzai-astrbot-bridge",
    version: VERSION,
    host: config.host,
    port: config.port,
    commands: "role_based",
    game_queries: listGameQueries(config),
    discovered_plugins: discoverPlugins(config),
    discovery: {
      enabled: config.discover_plugins !== false,
      execution_policy: "role_based",
    },
    permission_policy: {
      master_source: "yunzai_config",
      master_sources: { miao_yunzai: "masterQQ", trss_yunzai: "master[default_bot_id]" },
      identity_source: "astrbot_current_session",
      session_identity_override: false,
      token_holder_must_be_trusted: true,
      master_access: "full",
      master_risk: "prompt_injection_can_trigger_configuration_update_install_or_restart",
      ordinary_access: ["uid_self_service", "panel_update", "panel", "strategy", "catalog", "note", "combat", "records", "help"],
      unknown_command: "deny",
      rate_limit: "disabled",
    },
    send_policy: "controlled_by_astrbot_reply_delivery_mode",
  }
}

export async function handleRequest(req, res, config) {
  if (!isAuthorized(req, config.token)) {
    return sendJson(res, 401, { success: false, error: "Unauthorized" })
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  const mediaMatch = req.method === "GET" && url.pathname.match(/^\/astrbot-bridge\/v1\/media\/([a-f0-9]{48})$/)
  if (mediaMatch) {
    const media = getCachedMedia(mediaMatch[1])
    if (!media) return sendJson(res, 404, { success: false, error: "媒体不存在或已过期" })
    res.writeHead(200, {
      "Content-Type": media.mime_type,
      "Content-Length": media.buffer.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    return res.end(media.buffer)
  }
  if (req.method === "GET" && url.pathname === "/astrbot-bridge/v1/health") {
    return sendJson(res, 200, {
      success: true,
      service: "yunzai-astrbot-bridge",
      version: VERSION,
      host: config.host,
      port: config.port,
      send_policy: "controlled_by_astrbot_reply_delivery_mode",
    })
  }

  if (req.method === "GET" && url.pathname === "/astrbot-bridge/v1/capabilities") {
    return sendJson(res, 200, capabilities(config))
  }

  if (req.method === "POST" && url.pathname === "/astrbot-bridge/v1/rpc") {
    try {
      const body = JSON.parse(await readBody(req, Number(config.max_body_bytes) || DEFAULT_CONFIG.max_body_bytes))
      if (body.action === "command.execute") {
        const result = await executeCommand(body, config)
        return sendJson(res, result.success ? 200 : result.error_code === "PERMISSION_DENIED" ? 403 : 400, result)
      }
      if (body.action === "game.query") {
        const result = await executeGameQuery(body, config)
        return sendJson(res, result.success ? 200 : result.error_code === "PERMISSION_DENIED" ? 403 : 400, result)
      }
      return sendJson(res, 400, { success: false, error: "不支持的 action" })
    } catch (error) {
      const status = Number(error?.statusCode) || 400
      return sendJson(res, status, { success: false, error: error?.message || "无效请求" })
    }
  }

  return sendJson(res, 404, { success: false, error: "Not Found" })
}

export async function startBridgeServer(config) {
  if (!config.token) {
    log("error", `未配置 token，桥接服务不会启动。请编辑 ${CONFIG_PATH}`)
    return null
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res, config).catch(error => {
      log("error", error.stack || String(error))
      if (!res.headersSent) sendJson(res, 500, { success: false, error: "内部错误" })
      else res.destroy()
    })
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(Number(config.port) || 1145, String(config.host || "127.0.0.1"), () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  log("info", `HTTP RPC 已监听 http://${config.host}:${config.port}`)
  return server
}

export class AstrBotBridgePlugin extends plugin {
  constructor() {
    super({
      name: "AstrBot Yunzai Bridge",
      dsc: "为 AstrBot Agent 提供 Yunzai 命令和游戏查询模板调用接口",
      priority: 1,
    })
  }

  async init() {
    if (globalThis[SHARED_KEY]?.server) return "return"
    const config = await loadConfig()
    try {
      const server = await startBridgeServer(config)
      globalThis[SHARED_KEY] = { server, config }
    } catch (error) {
      log("error", `启动失败: ${error.stack || error}`)
      globalThis[SHARED_KEY] = { server: null, config }
    }
    return "return"
  }
}
