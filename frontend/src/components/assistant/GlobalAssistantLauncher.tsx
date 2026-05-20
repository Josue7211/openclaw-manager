import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowSquareOut,
  ChatCircle,
  Check,
  CursorClick,
  FloppyDisk,
  Image as ImageIcon,
  PaperPlaneTilt,
  PencilSimple,
  Sparkle,
  X,
} from '@phosphor-icons/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import {
  addWidgetToPage,
  commitDashboardDraft,
  discardDashboardDraft,
  getDashboardState,
  redoDashboardDraft,
  replaceDashboardDraftWidgetPlugin,
  startDashboardDraft,
  undoDashboardDraft,
} from '@/lib/dashboard-store'
import {
  addHomeWidgetToPage,
  commitHomeDraft,
  discardHomeDraft,
  getHomeState,
  redoHomeDraft,
  replaceHomeDraftWidgetPlugin,
  startHomeDraft,
  undoHomeDraft,
} from '@/lib/home-store'
import { saveGeneratedModule } from '@/lib/generated-module-store'
import { BUILTIN_WIDGETS, registerWidget } from '@/lib/widget-registry'
import type { DashboardPage, LayoutItem } from '@/lib/dashboard-store'
import {
  commitUiCustomizationDraft,
  discardUiCustomizationDraft,
  previewUiStyleRule,
  redoUiCustomizationDraft,
  undoUiCustomizationDraft,
} from '@/lib/ui-customization-store'
import {
  commitSidebarConfigDraft,
  discardSidebarConfigDraft,
  getSidebarConfig,
  moveItemToCategory,
  redoSidebarConfigDraft,
  renameCategory,
  renameItem,
  startSidebarConfigDraft,
  undoSidebarConfigDraft,
} from '@/lib/sidebar-config'
import {
  commitThemeDraft,
  discardThemeDraft,
  redoThemeDraft,
  setCategoryOverride,
  setPageOverride,
  startThemeDraft,
  undoThemeDraft,
} from '@/lib/theme-store'
import {
  buildOpenUiLangSystemPrompt,
  extractFencedOpenUiLangFromResponse,
  OpenUiSnippet,
} from '@/lib/openui'
import { compileOpenUiLangWidgetSource } from '@/lib/openui'
import {
  chatSessionPath,
  notifyChatSessionsChanged,
  saveSelectedChatSessionKey,
} from '@/lib/chat-session-selection'
import { buildLiveAppContext } from '@/pages/chat/live-app-context'
import { plusIconStyle } from '../sidebar/styles'
import type { ClaudeSession } from '@/features/sessions/types'

const MarkdownBubble = lazy(() => import('@/components/MarkdownBubble'))

type CaptureType = 'note' | 'task' | 'idea' | 'decision'
type AssistantActionRisk = 'low' | 'medium' | 'high'

interface AssistantAction {
  id: string
  type: string
  summary: string
  target?: string
  payload?: Record<string, unknown>
  risk?: AssistantActionRisk
  requiresConfirmation?: boolean
}

interface AssistantActionRecord extends AssistantAction {
  status: 'pending' | 'applied' | 'error'
  error?: string
}

interface OpenUiResult {
  reply: string
  openUiLang: string
  actions: AssistantAction[]
}

interface VisiblePageContext {
  route: string
  module: string
  pageTitle?: string
  visibleText: string
  liveAppContext?: string
}

interface AssistantThreadMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  images?: string[]
  openUiLang?: string
}

interface AssistantImageAttachment {
  id: string
  previewUrl: string
  dataUrl?: string
  path?: string
  name?: string
}

interface UiSelection {
  label: string
  route: string
  selector: string
  tagName: string
  text: string
  role?: string
  testId?: string
  attributes: Record<string, string>
  ancestry: Array<{
    selector: string
    tagName: string
    role?: string
    label?: string
  }>
  childLabels: string[]
  computedStyle: Record<string, string>
  rect: { x: number; y: number; width: number; height: number }
}

interface BaseAssistantDraft {
  id: string
  status: 'previewing' | 'saving' | 'saved' | 'error'
  message?: string
}

interface WidgetAssistantDraft extends BaseAssistantDraft {
  kind: 'widget'
  store: 'home' | 'dashboard'
  widgetId: string
  tempPluginId: string
  openUiLang: string
}

interface PlacedWidgetSummary {
  store: 'home' | 'dashboard'
  pageName: string
  instanceId: string
  pluginId: string
  name: string
  description: string
  layout?: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>
}

interface StyleAssistantDraft extends BaseAssistantDraft {
  kind: 'style'
  ruleId: string
  selector: string
}

interface SidebarAssistantDraft extends BaseAssistantDraft {
  kind: 'sidebar'
}

interface ThemeAssistantDraft extends BaseAssistantDraft {
  kind: 'theme'
}

type AssistantDraft = WidgetAssistantDraft | StyleAssistantDraft | SidebarAssistantDraft | ThemeAssistantDraft

interface ChatHistoryMessage {
  id?: string
  role?: string
  text?: string
  content?: string
  timestamp?: string
  images?: string[]
}

interface OpenUiChatResponse {
  reply?: string
  sessionKey?: string | null
}

const OPENUI_REPLY_TIMEOUT_MS = 45_000
const OPENUI_REPLY_POLL_MS = 1_000

function parseCaptureCommand(text: string): { type: CaptureType; content: string } | null {
  const trimmed = text.trim()
  const match = trimmed.match(/^(?:capture|save|log|make)\s+(?:this\s+)?(?:as\s+)?(?:a\s+|an\s+)?(note|task|idea|decision)\s*:?\s*([\s\S]*)$/i)
  if (!match?.[1]) return null
  const content = (match[2] || '').trim()
  if (!content) return null
  return { type: match[1].toLowerCase() as CaptureType, content }
}

function parseActionList(text: string): AssistantAction[] {
  const candidates: unknown[] = []
  const fencedJson = [...text.matchAll(/```json\s*\n([\s\S]*?)```/gi)]
  for (const match of fencedJson) {
    try {
      candidates.push(JSON.parse(match[1]))
    } catch {
      /* ignore invalid assistant JSON */
    }
  }
  try {
    candidates.push(JSON.parse(text))
  } catch {
    /* raw text is usually not JSON */
  }

  const actions: AssistantAction[] = []
  for (const candidate of candidates) {
    const wrapper = candidate as { actions?: unknown; action?: unknown }
    const rawActions = Array.isArray(wrapper?.actions)
      ? wrapper.actions
      : Array.isArray(candidate)
        ? candidate
        : wrapper?.action
          ? [wrapper.action]
          : []
    for (const raw of rawActions) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      if (typeof item.type !== 'string') continue
      actions.push({
        id: typeof item.id === 'string' ? item.id : `act-${Date.now()}-${actions.length}`,
        type: item.type,
        summary: typeof item.summary === 'string' ? item.summary : item.type,
        target: typeof item.target === 'string' ? item.target : undefined,
        payload: item.payload && typeof item.payload === 'object' ? item.payload as Record<string, unknown> : {},
        risk: item.risk === 'medium' || item.risk === 'high' ? item.risk : 'low',
        requiresConfirmation: item.requiresConfirmation !== false,
      })
    }
  }
  return actions
}

function shouldAllowAppActions(userText: string): boolean {
  return /\b(apply|install|add|insert|place|save it|save this|put it|use it|change|customize|rename|move|navigate|open the|go to|set theme|theme|style|css|smaller|larger|bigger|tighter|wider|narrower|color|padding|spacing|rounder|edit sidebar)\b/i.test(userText)
}

function shouldPreviewDashboardWidget(userText: string, pathname: string): boolean {
  const asksForPlacement = /\b(add|insert|place|put|show|make|create)\b/i.test(userText)
  const targetIsDashboardish = /\b(dashboard|home|widget|card|panel)\b/i.test(userText) || pathname === '/' || pathname === '/personal' || pathname.startsWith('/dashboard')
  return asksForPlacement && targetIsDashboardish
}

function shouldUseBuilderMode(
  userText: string,
  selectedTarget: UiSelection | null,
  draft: AssistantDraft | null,
): boolean {
  if (draft || selectedTarget) return true
  const explicitBuilder = /\b(openui|module builder|ui builder|generative ui)\b/i.test(userText)
  const createVerb = /\b(build|make|create|generate|design|add|insert|place|install|put|show)\b/i.test(userText)
  const uiSurface = /\b(widget|card|panel|dashboard|home|page|component|ui|module)\b/i.test(userText)
  const editVerb = /\b(style|restyle|resize|theme|css|color|spacing|padding|rounder|smaller|larger|bigger|tighter|wider|narrower|rename|move|change|modify|customize)\b/i.test(userText)
  const editTarget = /\b(this|that|selected|current|existing|dashboard|sidebar|theme|ui|page|widget|card|panel)\b/i.test(userText)
  const visualSourceIntent = /\b(use|turn|make|create|build|generate|design)\b[\s\S]*\b(screenshot|image|selection)\b/i.test(userText)
  return explicitBuilder || (createVerb && uiSurface) || (editVerb && editTarget) || visualSourceIntent
}

function shouldAskBeforeDuplicatingWidget(userText: string): boolean {
  return !/\b(edit|modify|update|expand|extend|resize|restyle|rework|configure|replace|improve|change existing|use existing)\b/i.test(userText)
}

function summarizePageWidgets(
  page: DashboardPage | undefined,
  store: PlacedWidgetSummary['store'],
): PlacedWidgetSummary[] {
  if (!page) return []
  const layoutsById = new Map<string, LayoutItem>()
  for (const items of Object.values(page.layouts || {})) {
    for (const item of items as LayoutItem[]) {
      if (!layoutsById.has(item.i)) layoutsById.set(item.i, item)
    }
  }

  return Array.from(layoutsById.values()).flatMap(item => {
    const pluginId = String(page.widgetConfigs?.[item.i]?._pluginId ?? item.i)
    const def = BUILTIN_WIDGETS.find(widget => widget.id === pluginId)
    if (!def) return []
    return [{
      store,
      pageName: page.name || (store === 'home' ? 'Home' : 'Dashboard'),
      instanceId: item.i,
      pluginId,
      name: def.name,
      description: def.description,
      layout: { x: item.x, y: item.y, w: item.w, h: item.h },
    }]
  })
}

function getPlacedWidgets(pathname: string): PlacedWidgetSummary[] {
  if (isHomeRoute(pathname)) {
    const home = getHomeState()
    const activePage = home.pages.find(page => page.id === home.activePageId) || home.pages[0]
    return summarizePageWidgets(activePage, 'home')
  }
  const dashboard = getDashboardState()
  const activePage = dashboard.pages.find(page => page.id === dashboard.activePageId) || dashboard.pages[0]
  return summarizePageWidgets(activePage, 'dashboard')
}

function widgetAliases(widgetId: string): RegExp | null {
  switch (widgetId) {
    case 'calendar':
      return /\b(calendar|calendars|appointment|appointments|schedule|schedules|event|events)\b/i
    case 'todos':
      return /\b(todo|todos|task|tasks|focus)\b/i
    case 'reminders':
      return /\b(reminder|reminders)\b/i
    case 'pomodoro':
      return /\b(pomodoro|timer|focus timer)\b/i
    case 'knowledge':
      return /\b(knowledge|article|articles|saved article|saved articles)\b/i
    case 'messages-summary':
      return /\b(messages|imessage|texts)\b/i
    case 'inbox':
      return /\b(email|mail|inbox)\b/i
    default:
      return null
  }
}

function findPlacedWidgetConflict(userText: string, pathname: string): PlacedWidgetSummary | null {
  const asksForNewSurface = /\b(add|insert|place|put|show|make|create|build)\b/i.test(userText)
  const widgetish = /\b(widget|card|panel|dashboard|home|calendar|appointment|appointments|schedule|event|events|todo|task|reminder|email|inbox|message)\b/i.test(userText)
  if (!asksForNewSurface || !widgetish) return null

  const placed = getPlacedWidgets(pathname)
  return placed.find(widget => {
    const alias = widgetAliases(widget.pluginId)
    if (alias?.test(userText)) return true
    return new RegExp(`\\b${widget.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(userText)
  }) ?? null
}

function moduleNameFromPath(pathname: string): string {
  if (pathname === '/' || pathname === '/personal') return 'home'
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment || 'home'
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\b(View all|Save|Discard|Undo|Redo|Edit)\b\s*/gi, '$1 ')
    .trim()
    .slice(0, 5000)
}

function collectVisiblePageContext(pathname: string): VisiblePageContext {
  const root = document.querySelector('#main-content') || document.querySelector('main') || document.body
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-global-assistant-root="true"], script, style, svg, nav, [aria-hidden="true"]').forEach(node => node.remove())
  const pageTitle = clone.querySelector('h1, h2, [data-page-title]')?.textContent?.trim() || undefined
  return {
    route: pathname,
    module: moduleNameFromPath(pathname),
    pageTitle,
    visibleText: normalizeVisibleText(clone.textContent || ''),
  }
}

function buildActiveDraftContext(draft: AssistantDraft | null) {
  if (!draft) return null
  if (draft.kind === 'widget') {
    return {
      kind: draft.kind,
      store: draft.store,
      widgetId: draft.widgetId,
      openUiLang: draft.openUiLang,
    }
  }
  return {
    kind: draft.kind,
    message: draft.message,
  }
}

function stripAssistantArtifacts(text: string): string {
  return text
    .replace(/```(?:openui|openui-lang|oui)\s*\n[\s\S]*?```/gi, '')
    .replace(/```json\s*\n([\s\S]*?)```/gi, (_match, jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText)
        if (parsed?.actions || parsed?.action || Array.isArray(parsed)) return ''
      } catch {
        /* keep non-action JSON visible */
      }
      return `\n\`\`\`json\n${jsonText}\n\`\`\`\n`
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractOpenUiResult(text: string, userText: string): OpenUiResult {
  const openUiLang = extractFencedOpenUiLangFromResponse(text) || ''
  return {
    reply: stripAssistantArtifacts(text) || (openUiLang ? 'Generated UI preview:' : text),
    openUiLang,
    actions: shouldAllowAppActions(userText) ? parseActionList(text) : [],
  }
}

function buildRouteContext(
  pathname: string,
  selectedTarget: UiSelection | null,
  draft: AssistantDraft | null,
  visiblePageContext: VisiblePageContext,
): string {
  const sidebar = getSidebarConfig()
  const placedWidgets = getPlacedWidgets(pathname)
  return JSON.stringify({
    route: pathname,
    activeModule: visiblePageContext.module,
    pageTitle: visiblePageContext.pageTitle,
    visiblePageText: visiblePageContext.visibleText,
    liveAppContext: visiblePageContext.liveAppContext,
    selectedTarget,
    activeDraft: buildActiveDraftContext(draft),
    placedWidgets,
    availableBuiltInWidgets: BUILTIN_WIDGETS.map(widget => ({
      id: widget.id,
      name: widget.name,
      description: widget.description,
      category: widget.category,
      defaultSize: widget.defaultSize,
      configurable: Boolean(widget.configSchema?.fields.length),
    })),
    sidebar: sidebar.categories.map(category => ({
      id: category.id,
      name: category.name,
      items: category.items,
    })),
    supportedActions: [
      'capture.create',
      'ui.style_override',
      'sidebar.rename_item',
      'sidebar.rename_category',
      'sidebar.move_item',
      'theme.set_page_override',
      'theme.set_category_override',
      'dashboard.add_widget',
      'navigation.open',
    ],
  })
}

function buildOpenUiRequest(
  userText: string,
  pathname: string,
  selectedTarget: UiSelection | null,
  draft: AssistantDraft | null,
  visiblePageContext: VisiblePageContext,
): string {
  const allowActions = shouldAllowAppActions(userText)
  return [
    'Create an OpenUI response for ClawControl.',
    'The OpenUI preview is the primary result. Return a concise explanation, then exactly one fenced ```openui block when a UI preview is useful.',
    'Grounding rule: use only factual values from the user request, selectedTarget, activeDraft, visiblePageText, liveAppContext, and current app context. Never invent names, companies, appointment titles, times, counts, dates, or statuses.',
    'If the user asks for actual/current/my data and the needed fact is missing from liveAppContext, visiblePageText, or the user request, render an honest empty/loading/needs-connection state instead of fake sample data.',
    'For visual UI, prefer composed OpenUI components like Stack, Card, Text, Badge, Checklist, Metric, Progress, charts, lists, and forms. Do not make a MarkdownDisplay-only card unless the user asked for prose or markdown.',
    'Match ClawControl UI: use the existing dark panel/card structure, app CSS variables, compact typography, 8px-ish radii, muted borders, and the app accent. Avoid arbitrary brand colors, oversized badges, fake initials, or marketing-card styling.',
    'Do not put Save, Apply, Install, or Undo controls inside the generated OpenUI. The ClawControl assistant shell supplies those controls when a live draft exists.',
    'Before generating a new widget, inspect placedWidgets and availableBuiltInWidgets. If an existing widget already covers the request, ask whether to edit/resize/restyle/configure that widget instead of making a duplicate. If activeDraft is present, refine that draft rather than creating a second widget.',
    selectedTarget
      ? 'A specific UI element is selected. If the user asks to change its look, spacing, size, layout, or CSS, include a fenced ```json actions block with type "ui.style_override", payload.selector from selectedTarget.selector, and payload.styles as safe CSS properties.'
      : 'No specific UI element is selected. Infer the target from the current route and user request.',
    allowActions
      ? 'The user request may include an explicit app modification. Only if an app change is truly requested, include one fenced ```json block with an actions array.'
      : 'Do not include fenced JSON actions for this request. Generate the UI preview only.',
    'Allowed action types: capture.create, ui.style_override, sidebar.rename_item, sidebar.rename_category, sidebar.move_item, theme.set_page_override, theme.set_category_override, dashboard.add_widget, navigation.open.',
    'For ui.style_override, allowed payload shape: {"selector":"CSS selector","route":"current route if route-scoped","styles":{"background-color":"...","color":"...","padding":"...","border-radius":"...","font-size":"...","width":"...","height":"...","display":"...","grid-template-columns":"...","gap":"..."}}.',
    'Use route-scoped ui.style_override for selected-page changes so the preview affects only the relevant tab unless the user explicitly asks for a global style.',
    'Sidebar rename/move actions also preview live and are not saved until the user presses Save.',
    'Theme page/category actions also preview live and are not saved until the user presses Save.',
    'UI changes preview live and are not saved until the user presses Save. Do not claim they are permanently saved.',
    'Never propose arbitrary DOM mutation or executable code.',
    `Current app context: ${buildRouteContext(pathname, selectedTarget, draft, visiblePageContext)}`,
    `User request: ${userText}`,
  ].join('\n\n')
}

function gatewayHistoryPath(sessionKey: string | null): string {
  return sessionKey
    ? `/api/gateway/sessions/${encodeURIComponent(sessionKey)}/history?limit=500`
    : '/api/chat/history'
}

async function fetchChatHistory(sessionKey: string | null = null): Promise<ChatHistoryMessage[]> {
  const response = await api.get<{ messages?: ChatHistoryMessage[] }>(gatewayHistoryPath(sessionKey))
  return Array.isArray(response.messages) ? response.messages : []
}

function timestampMs(value: string | undefined): number {
  const ms = Date.parse(value || '')
  return Number.isFinite(ms) ? ms : 0
}

function displayUserTextFromStoredPrompt(value: string): string {
  const text = String(value || '').trim()
  const match = text.match(/(?:^|\n)User request:\s*([\s\S]+)$/)
  if (!match?.[1]) return text
  return match[1].trim()
}

function normalizeAssistantHistory(items: ChatHistoryMessage[] = []): AssistantThreadMessage[] {
  return items.flatMap<AssistantThreadMessage>((item, index) => {
    if (item.role !== 'user' && item.role !== 'assistant') return []
    const rawText = String(item.text ?? item.content ?? '').trim()
    const id = item.id || `${item.role}-${item.timestamp || 'no-time'}-${index}`
    if (item.role === 'user') {
      const text = displayUserTextFromStoredPrompt(rawText)
      if (!text && !item.images?.length) return []
      return [{
        id,
        role: 'user' as const,
        text,
        images: item.images,
      }]
    }

    const result = extractOpenUiResult(rawText, '')
    const text = result.reply || rawText
    if (!text && !result.openUiLang) return []
    return [{
      id,
      role: 'assistant' as const,
      text,
      openUiLang: result.openUiLang,
    }]
  })
}

async function fetchGatewaySessions(): Promise<ClaudeSession[]> {
  const response = await api.get<{ sessions?: ClaudeSession[] }>('/api/gateway/sessions')
  return (response.sessions ?? []).slice().sort(
    (a, b) => new Date(String(b.lastActivity || 0)).getTime() - new Date(String(a.lastActivity || 0)).getTime(),
  )
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function waitForAssistantReply(sessionKey: string | null, startedAt: number, baselineAssistantIds: Set<string>): Promise<string> {
  const deadline = Date.now() + OPENUI_REPLY_TIMEOUT_MS
  while (Date.now() <= deadline) {
    const history = await fetchChatHistory(sessionKey)
    const reply = history
      .filter(item => item.role === 'assistant')
      .filter(item => !baselineAssistantIds.has(String(item.id || '')))
      .filter(item => timestampMs(item.timestamp) >= startedAt)
      .map(item => String(item.text ?? item.content ?? '').trim())
      .find(Boolean)
    if (reply) return reply
    await delay(OPENUI_REPLY_POLL_MS)
  }
  throw new Error('OpenUI request sent, but no assistant reply arrived before timeout.')
}

async function requestThesysOpenUi(
  text: string,
  pathname: string,
  selectedTarget: UiSelection | null,
  draft: AssistantDraft | null,
  visiblePageContext: VisiblePageContext,
  images: string[] = [],
  imagePaths: string[] = [],
  sessionKey: string | null = null,
  newChat = false,
): Promise<OpenUiChatResponse> {
  const response = await api.post<OpenUiChatResponse>('/api/chat/openui', {
    text: buildOpenUiRequest(text, pathname, selectedTarget, draft, visiblePageContext),
    images,
    imagePaths,
    systemPrompt: buildOpenUiLangSystemPrompt(),
    newChat: newChat && !sessionKey,
    ...(sessionKey ? { sessionKey } : {}),
  })
  return response
}

async function requestHermesChat(
  text: string,
  images: string[] = [],
  imagePaths: string[] = [],
  sessionKey: string | null = null,
  newChat = false,
  liveContext = '',
): Promise<OpenUiChatResponse> {
  return api.post<OpenUiChatResponse>('/api/chat', {
    text,
    images,
    imagePaths,
    liveContext,
    newChat: newChat && !sessionKey,
    ...(sessionKey ? { sessionKey } : {}),
  })
}

async function installOpenUiWidget(openUiLang: string) {
  const saved = await saveGeneratedModule({
    name: 'OpenUI Assistant Widget',
    description: 'Generated from the global assistant.',
    icon: 'Sparkle',
    source: compileOpenUiLangWidgetSource(openUiLang),
    configSchema: { fields: [] },
    defaultSize: { w: 4, h: 3 },
  })
  const dashboard = getDashboardState()
  const pageId = dashboard.activePageId || dashboard.pages[0]?.id
  if (!pageId) throw new Error('No dashboard page exists.')
  const pluginId = `generated-${saved.id}`
  addWidgetToPage(pageId, pluginId, {
    i: `${pluginId}-${crypto.randomUUID().slice(0, 8)}`,
    x: 0,
    y: Infinity,
    w: saved.defaultSize.w,
    h: saved.defaultSize.h,
  })
}

function isHomeRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/home' || pathname === '/personal'
}

function registerOpenUiDraftWidget(pluginId: string, openUiLang: string) {
  function OpenUiDraftWidget() {
    return (
      <div className="openui-draft-widget-content" style={{ width: '100%', height: '100%', overflow: 'auto' }}>
        <OpenUiSnippet source={openUiLang} />
      </div>
    )
  }

  registerWidget({
    id: pluginId,
    name: 'OpenUI Draft',
    description: 'Unsaved assistant-generated OpenUI preview.',
    icon: 'Sparkle',
    category: 'custom',
    tier: 'ai',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    configSchema: { fields: [] },
    component: async () => ({ default: OpenUiDraftWidget }),
    metadata: { author: 'OpenUI Assistant', version: 'draft' },
  })
}

function previewOpenUiWidget(openUiLang: string, pathname: string): AssistantDraft {
  const store: WidgetAssistantDraft['store'] = isHomeRoute(pathname) ? 'home' : 'dashboard'
  const tempPluginId = `openui-draft-${crypto.randomUUID().slice(0, 8)}`
  const widgetId = `${tempPluginId}-widget`
  registerOpenUiDraftWidget(tempPluginId, openUiLang)

  if (store === 'home') {
    const home = getHomeState()
    const pageId = home.activePageId || home.pages[0]?.id
    if (!pageId) throw new Error('No Home page exists for preview.')
    startHomeDraft()
    addHomeWidgetToPage(pageId, tempPluginId, {
      i: widgetId,
      x: 0,
      y: Infinity,
      w: 4,
      h: 3,
    })
  } else {
    const dashboard = getDashboardState()
    const pageId = dashboard.activePageId || dashboard.pages[0]?.id
    if (!pageId) throw new Error('No dashboard page exists for preview.')
    startDashboardDraft()
    addWidgetToPage(pageId, tempPluginId, {
      i: widgetId,
      x: 0,
      y: Infinity,
      w: 4,
      h: 3,
    })
  }

  return {
    id: `draft-${Date.now()}`,
    kind: 'widget',
    store,
    widgetId,
    tempPluginId,
    openUiLang,
    status: 'previewing',
    message: store === 'home' ? 'Previewing on Home. Not saved yet.' : 'Previewing on Dashboard. Not saved yet.',
  }
}

function refineOpenUiWidgetDraft(draft: WidgetAssistantDraft, openUiLang: string): WidgetAssistantDraft {
  const tempPluginId = `openui-draft-${crypto.randomUUID().slice(0, 8)}`
  registerOpenUiDraftWidget(tempPluginId, openUiLang)
  const replaced = draft.store === 'home'
    ? replaceHomeDraftWidgetPlugin(draft.widgetId, tempPluginId)
    : replaceDashboardDraftWidgetPlugin(draft.widgetId, tempPluginId)
  if (!replaced) throw new Error('Draft widget was not found for refinement.')
  return {
    ...draft,
    tempPluginId,
    openUiLang,
    status: 'previewing',
    message: draft.store === 'home' ? 'Updated the Home preview. Not saved yet.' : 'Updated the Dashboard preview. Not saved yet.',
  }
}

async function saveOpenUiDraft(draft: AssistantDraft): Promise<AssistantDraft> {
  if (draft.kind === 'theme') {
    const committed = commitThemeDraft()
    if (!committed) throw new Error('No active theme draft to save.')
    return { ...draft, status: 'saved', message: 'Saved.' }
  }
  if (draft.kind === 'sidebar') {
    const committed = commitSidebarConfigDraft()
    if (!committed) throw new Error('No active sidebar draft to save.')
    return { ...draft, status: 'saved', message: 'Saved.' }
  }
  if (draft.kind !== 'widget') {
    const committed = commitUiCustomizationDraft()
    if (!committed) throw new Error('No active style draft to save.')
    return { ...draft, status: 'saved', message: 'Saved.' }
  }
  const saved = await saveGeneratedModule({
    name: 'OpenUI Assistant Widget',
    description: 'Generated from the global assistant.',
    icon: 'Sparkle',
    source: compileOpenUiLangWidgetSource(draft.openUiLang),
    configSchema: { fields: [] },
    defaultSize: { w: 4, h: 3 },
  })
  const pluginId = `generated-${saved.id}`
  const replaced = draft.store === 'home'
    ? replaceHomeDraftWidgetPlugin(draft.widgetId, pluginId)
    : replaceDashboardDraftWidgetPlugin(draft.widgetId, pluginId)
  if (!replaced) throw new Error('Draft widget was not found.')
  const committed = draft.store === 'home' ? commitHomeDraft() : commitDashboardDraft()
  if (!committed) throw new Error('No active draft to save.')
  return { ...draft, status: 'saved', message: 'Saved.' }
}

function discardOpenUiDraft(draft: AssistantDraft): AssistantDraft {
  if (draft.kind === 'theme') {
    const discarded = discardThemeDraft()
    return {
      ...draft,
      status: discarded ? 'previewing' : 'error',
      message: discarded ? 'Discarded unsaved theme preview.' : 'No theme draft preview to discard.',
    }
  }
  if (draft.kind === 'sidebar') {
    const discarded = discardSidebarConfigDraft()
    return {
      ...draft,
      status: discarded ? 'previewing' : 'error',
      message: discarded ? 'Discarded unsaved sidebar preview.' : 'No sidebar draft preview to discard.',
    }
  }
  if (draft.kind === 'style') {
    const discarded = discardUiCustomizationDraft()
    return {
      ...draft,
      status: discarded ? 'previewing' : 'error',
      message: discarded ? 'Discarded unsaved style preview.' : 'No style draft preview to discard.',
    }
  }
  const discarded = draft.store === 'home' ? discardHomeDraft() : discardDashboardDraft()
  return {
    ...draft,
    status: discarded ? 'previewing' : 'error',
    message: discarded ? 'Discarded unsaved preview.' : 'No draft preview to discard.',
  }
}

function undoOpenUiDraft(draft: AssistantDraft): AssistantDraft {
  if (draft.kind === 'theme') {
    const ok = undoThemeDraft()
    return { ...draft, message: ok ? 'Undid the latest unsaved theme change.' : 'Nothing to undo.' }
  }
  if (draft.kind === 'sidebar') {
    const ok = undoSidebarConfigDraft()
    return { ...draft, message: ok ? 'Undid the latest unsaved sidebar change.' : 'Nothing to undo.' }
  }
  if (draft.kind === 'style') {
    const ok = undoUiCustomizationDraft()
    return { ...draft, message: ok ? 'Undid the latest unsaved style change.' : 'Nothing to undo.' }
  }
  const ok = draft.store === 'home' ? undoHomeDraft() : undoDashboardDraft()
  return { ...draft, message: ok ? 'Undid the latest unsaved preview change.' : 'Nothing to undo.' }
}

function redoOpenUiDraft(draft: AssistantDraft): AssistantDraft {
  if (draft.kind === 'theme') {
    const ok = redoThemeDraft()
    return { ...draft, message: ok ? 'Redid the unsaved theme change.' : 'Nothing to redo.' }
  }
  if (draft.kind === 'sidebar') {
    const ok = redoSidebarConfigDraft()
    return { ...draft, message: ok ? 'Redid the unsaved sidebar change.' : 'Nothing to redo.' }
  }
  if (draft.kind === 'style') {
    const ok = redoUiCustomizationDraft()
    return { ...draft, message: ok ? 'Redid the unsaved style change.' : 'Nothing to redo.' }
  }
  const ok = draft.store === 'home' ? redoHomeDraft() : redoDashboardDraft()
  return { ...draft, message: ok ? 'Redid the unsaved preview change.' : 'Nothing to redo.' }
}

function previewSidebarAction(action: AssistantAction): SidebarAssistantDraft {
  const payload = action.payload || {}
  startSidebarConfigDraft()
  switch (action.type) {
    case 'sidebar.rename_item': {
      const href = String(payload.href || action.target || '')
      const name = String(payload.name || payload.label || '')
      if (!href || !name) throw new Error('Sidebar item href or name missing.')
      renameItem(href, name)
      break
    }
    case 'sidebar.rename_category': {
      const categoryId = String(payload.categoryId || action.target || '')
      const name = String(payload.name || payload.label || '')
      if (!categoryId || !name) throw new Error('Category id or name missing.')
      renameCategory(categoryId, name)
      break
    }
    case 'sidebar.move_item': {
      const href = String(payload.href || action.target || '')
      const categoryId = String(payload.categoryId || payload.toCatId || '')
      const index = Number(payload.index ?? 0)
      if (!href || !categoryId) throw new Error('Move target missing.')
      moveItemToCategory(href, categoryId, Number.isFinite(index) ? index : 0)
      break
    }
    default:
      throw new Error(`Unsupported sidebar draft action: ${action.type}`)
  }
  return {
    id: `sidebar-draft-${Date.now()}`,
    kind: 'sidebar',
    status: 'previewing',
    message: 'Previewing sidebar change. Not saved yet.',
  }
}

function previewUiStyleAction(
  action: AssistantAction,
  selectedTarget: UiSelection | null,
  pathname: string,
): StyleAssistantDraft {
  const payload = action.payload || {}
  const selector = String(payload.selector || action.target || selectedTarget?.selector || '').trim()
  const styles = payload.styles && typeof payload.styles === 'object'
    ? payload.styles as Record<string, string>
    : {}
  const safeRule = previewUiStyleRule({
    id: typeof payload.id === 'string' ? payload.id : `assistant-style-${crypto.randomUUID().slice(0, 8)}`,
    selector,
    route: String(payload.route || selectedTarget?.route || pathname),
    summary: action.summary,
    styles,
  })
  return {
    id: `style-draft-${Date.now()}`,
    kind: 'style',
    ruleId: safeRule.id,
    selector: safeRule.selector,
    status: 'previewing',
    message: 'Previewing selected UI style. Not saved yet.',
  }
}

function previewThemeAction(
  action: AssistantAction,
  selectedTarget: UiSelection | null,
  pathname: string,
): ThemeAssistantDraft {
  const payload = action.payload || {}
  startThemeDraft()
  switch (action.type) {
    case 'theme.set_page_override': {
      const route = String(payload.route || action.target || selectedTarget?.route || pathname)
      const themeId = String(payload.themeId || '')
      if (!route || !themeId) throw new Error('Route or theme missing.')
      setPageOverride(route, themeId)
      break
    }
    case 'theme.set_category_override': {
      const categoryId = String(payload.categoryId || action.target || '')
      const themeId = String(payload.themeId || '')
      if (!categoryId || !themeId) throw new Error('Category or theme missing.')
      setCategoryOverride(categoryId, themeId)
      break
    }
    default:
      throw new Error(`Unsupported theme draft action: ${action.type}`)
  }
  return {
    id: `theme-draft-${Date.now()}`,
    kind: 'theme',
    status: 'previewing',
    message: 'Previewing theme change. Not saved yet.',
  }
}

function readableSelector(element: HTMLElement): string {
  if (element.id) return `#${element.id}`
  const testId = element.getAttribute('data-testid')
  if (testId) return `[data-testid="${testId}"]`
  const aria = element.getAttribute('aria-label')
  if (aria) return `${element.tagName.toLowerCase()}[aria-label="${aria}"]`
  const parts: string[] = []
  let node: HTMLElement | null = element
  while (node && node !== document.body && parts.length < 4) {
    let part = node.tagName.toLowerCase()
    const className = Array.from(node.classList).find(name => !name.startsWith('widget-wobble'))
    if (className) part += `.${className}`
    const parent: HTMLElement | null = node.parentElement
    if (parent) {
      const tagName = node.tagName
      const siblings = Array.from(parent.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === tagName,
      )
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

function elementLabel(element: HTMLElement): string {
  return (
    element.getAttribute('aria-label') ||
    element.getAttribute('data-testid') ||
    (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) ||
    element.tagName.toLowerCase()
  )
}

function captureElementAttributes(element: HTMLElement): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of ['id', 'class', 'data-testid', 'aria-label', 'role', 'href', 'type', 'title']) {
    const value = element.getAttribute(name)
    if (value) result[name] = value.slice(0, 180)
  }
  return result
}

function captureAncestry(element: HTMLElement): UiSelection['ancestry'] {
  const ancestry: UiSelection['ancestry'] = []
  let node = element.parentElement
  while (node && node !== document.body && ancestry.length < 5) {
    ancestry.push({
      selector: readableSelector(node),
      tagName: node.tagName.toLowerCase(),
      role: node.getAttribute('role') || undefined,
      label: elementLabel(node),
    })
    node = node.parentElement
  }
  return ancestry
}

function captureChildLabels(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll<HTMLElement>('button, a, input, textarea, [role], [data-testid], h1, h2, h3, h4'))
    .slice(0, 8)
    .map(child => elementLabel(child))
    .filter(Boolean)
}

function captureComputedStyle(element: HTMLElement): Record<string, string> {
  const style = window.getComputedStyle(element)
  return {
    display: style.display,
    position: style.position,
    width: style.width,
    height: style.height,
    padding: style.padding,
    margin: style.margin,
    gap: style.gap,
    color: style.color,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
  }
}

function captureUiSelection(element: HTMLElement, pathname: string): UiSelection {
  const rect = element.getBoundingClientRect()
  const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  const label = elementLabel(element)
  return {
    label,
    route: pathname,
    selector: readableSelector(element),
    tagName: element.tagName.toLowerCase(),
    text,
    role: element.getAttribute('role') || undefined,
    testId: element.getAttribute('data-testid') || undefined,
    attributes: captureElementAttributes(element),
    ancestry: captureAncestry(element),
    childLabels: captureChildLabels(element),
    computedStyle: captureComputedStyle(element),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  }
}

async function applyAssistantAction(action: AssistantAction) {
  const payload = action.payload || {}
  switch (action.type) {
    case 'capture.create': {
      const type = String(payload.type || 'note') as CaptureType
      const content = String(payload.content || payload.text || '')
      if (!content.trim()) throw new Error('Capture content missing.')
      await api.post('/api/capture', { type, content: content.trim() })
      return
    }
    case 'ui.style_override': {
      const selector = String(payload.selector || action.target || '')
      const styles = payload.styles && typeof payload.styles === 'object'
        ? payload.styles as Record<string, string>
        : {}
      previewUiStyleRule({
        id: typeof payload.id === 'string' ? payload.id : action.id,
        selector,
        route: typeof payload.route === 'string' ? payload.route : undefined,
        summary: action.summary,
        styles,
      })
      return
    }
    case 'sidebar.rename_item': {
      const href = String(payload.href || action.target || '')
      const name = String(payload.name || payload.label || '')
      if (!href || !name) throw new Error('Sidebar item href or name missing.')
      renameItem(href, name)
      return
    }
    case 'sidebar.rename_category': {
      const categoryId = String(payload.categoryId || action.target || '')
      const name = String(payload.name || payload.label || '')
      if (!categoryId || !name) throw new Error('Category id or name missing.')
      renameCategory(categoryId, name)
      return
    }
    case 'sidebar.move_item': {
      const href = String(payload.href || action.target || '')
      const categoryId = String(payload.categoryId || payload.toCatId || '')
      const index = Number(payload.index ?? 0)
      if (!href || !categoryId) throw new Error('Move target missing.')
      moveItemToCategory(href, categoryId, Number.isFinite(index) ? index : 0)
      return
    }
    case 'theme.set_page_override': {
      const route = String(payload.route || action.target || '')
      const themeId = String(payload.themeId || '')
      if (!route || !themeId) throw new Error('Route or theme missing.')
      setPageOverride(route, themeId)
      return
    }
    case 'theme.set_category_override': {
      const categoryId = String(payload.categoryId || action.target || '')
      const themeId = String(payload.themeId || '')
      if (!categoryId || !themeId) throw new Error('Category or theme missing.')
      setCategoryOverride(categoryId, themeId)
      return
    }
    case 'dashboard.add_widget': {
      const openUiLang = String(payload.openUiLang || '')
      if (!openUiLang.trim()) throw new Error('OpenUI widget source missing.')
      await installOpenUiWidget(openUiLang)
      return
    }
    case 'navigation.open':
      return
    default:
      throw new Error(`Unsupported action: ${action.type}`)
  }
}

export default function GlobalAssistantLauncher({
  collapsed,
  open,
  onOpenChange,
}: {
  collapsed: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const isControlled = open !== undefined
  const actualOpen = open ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <button
        data-testid="global-ai-chat-launcher"
        onClick={() => setOpen(!actualOpen)}
        title="AI Chat"
        aria-label="Open AI Chat"
        className="hover-bg"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: collapsed ? '10px 0' : '9px 16px',
          background: actualOpen ? 'var(--active-bg)' : 'transparent',
          border: 'none',
          borderRadius: '10px',
          color: actualOpen ? 'var(--text-on-color)' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'background 0.25s var(--ease-spring), color 0.25s var(--ease-spring)',
        }}
      >
        <ChatCircle size={16} style={plusIconStyle} weight={actualOpen ? 'fill' : 'regular'} />
      </button>
      {!isControlled && actualOpen && createPortal(<GlobalAssistantDrawer onClose={() => setOpen(false)} />, document.body)}
    </div>
  )
}

export function GlobalAssistantDrawer({
  onClose,
  docked = false,
  onResizeStart,
}: {
  onClose: () => void
  docked?: boolean
  onResizeStart?: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [actions, setActions] = useState<AssistantActionRecord[]>([])
  const [selectedTarget, setSelectedTarget] = useState<UiSelection | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [hoverRect, setHoverRect] = useState<UiSelection['rect'] | null>(null)
  const [sessions, setSessions] = useState<ClaudeSession[]>([])
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const selectedSessionKeyRef = useRef<string | null>(null)

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await fetchGatewaySessions())
    } catch {
      // The assistant can still create a session on send; recents will refresh after success.
    }
  }, [])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!inspecting) return
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'crosshair'

    const onPointerMove = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      if (!target || target.closest('[data-global-assistant-root="true"]')) {
        setHoverRect(null)
        return
      }
      const rect = target.getBoundingClientRect()
      setHoverRect({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target.closest('[data-global-assistant-root="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      setSelectedTarget(captureUiSelection(target, pathname))
      setInspecting(false)
      setHoverRect(null)
    }

    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('click', onClick, true)
      document.body.style.cursor = previousCursor
    }
  }, [inspecting, pathname])

  const queueActions = useCallback((nextActions: AssistantAction[]) => {
    if (nextActions.length === 0) return
    setActions(prev => [
      ...nextActions.map(action => ({ ...action, status: 'pending' as const })),
      ...prev,
    ])
  }, [])

  const applyAction = useCallback(async (id: string) => {
    const action = actions.find(item => item.id === id)
    if (!action) return
    if (action.type === 'navigation.open') {
      const target = String(action.payload?.route || action.target || '/')
      navigate(target)
      setActions(prev => prev.map(item => item.id === id ? { ...item, status: 'applied' } : item))
      return
    }
    try {
      await applyAssistantAction(action)
      setActions(prev => prev.map(item => item.id === id ? { ...item, status: 'applied', error: undefined } : item))
    } catch (err) {
      setActions(prev => prev.map(item => item.id === id ? { ...item, status: 'error', error: err instanceof Error ? err.message : 'Action failed.' } : item))
    }
  }, [actions, navigate])

  const selectSession = useCallback((key: string | null) => {
    selectedSessionKeyRef.current = key
    setSelectedSessionKey(key)
    saveSelectedChatSessionKey(key)
  }, [])

  const getSelectedSessionKey = useCallback(() => selectedSessionKeyRef.current, [])

  const openFullChat = useCallback(() => {
    saveSelectedChatSessionKey(selectedSessionKey)
    navigate(chatSessionPath(selectedSessionKey))
    onClose()
  }, [navigate, onClose, selectedSessionKey])

  const inspectButtonStyle = inspecting || selectedTarget
    ? {
        ...iconButtonStyle,
        background: 'var(--bg-white-08)',
        borderColor: 'var(--border-accent)',
        color: 'var(--accent)',
      }
    : iconButtonStyle

  const statusText = inspecting
    ? 'Select a UI target'
    : selectedTarget
      ? `Target: ${selectedTarget.label}`
      : 'Ready'

  return (
    <div
      role="dialog"
      aria-label="AI Chat assistant"
      data-global-assistant-root="true"
      style={{
        position: docked ? 'relative' : 'fixed',
        top: docked ? undefined : 0,
        right: docked ? undefined : 0,
        bottom: docked ? undefined : 0,
        width: docked ? '100%' : 'min(520px, max(380px, 34vw))',
        maxWidth: docked ? undefined : 'calc(100vw - 12px)',
        height: docked ? '100%' : undefined,
        zIndex: docked ? undefined : 10000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        boxShadow: docked ? 'none' : '-18px 0 48px var(--overlay-light)',
        overflow: 'hidden',
        animation: docked ? undefined : 'assistantDrawerIn 0.18s var(--ease-spring)',
      }}
    >
      {docked && (
        <div
          onMouseDown={onResizeStart}
          title="Resize assistant"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -3,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: 'col-resize',
            zIndex: 2,
          }}
        />
      )}
      {hoverRect && createPortal(<InspectorHighlight rect={hoverRect} />, document.body)}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '9px 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <Sparkle size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
          <AssistantSessionPicker
            sessions={sessions}
            selectedSessionKey={selectedSessionKey}
            onSelect={(key) => {
              selectSession(key)
              if (!key) setActions([])
            }}
            title={statusText}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setInspecting(value => !value)}
            title={inspecting ? 'Stop selecting UI element' : selectedTarget ? `Selected: ${selectedTarget.label}` : 'Select UI element'}
            aria-label={inspecting ? 'Stop selecting UI element' : 'Select UI element'}
            style={inspectButtonStyle}
          >
            <CursorClick size={14} />
          </button>
          <button onClick={openFullChat} title="Open full chat" aria-label="Open full chat" style={iconButtonStyle}>
            <ArrowSquareOut size={14} />
          </button>
          <button onClick={onClose} title="Close" aria-label="Close assistant" style={iconButtonStyle}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <UnifiedAssistantPanel
          pathname={pathname}
          actions={actions}
          onActions={queueActions}
          onApplyAction={applyAction}
          onClearActions={() => setActions([])}
          selectedTarget={selectedTarget}
          selectedSessionKey={selectedSessionKey}
          getSelectedSessionKey={getSelectedSessionKey}
          onSelectSession={selectSession}
          onRefreshSessions={refreshSessions}
        />
      </div>
      <style>{`
        @keyframes assistantDrawerIn {
          from { transform: translateX(18px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function UnifiedAssistantPanel({
  pathname,
  actions,
  onActions,
  onApplyAction,
  onClearActions,
  selectedTarget,
  selectedSessionKey,
  getSelectedSessionKey,
  onSelectSession,
  onRefreshSessions,
}: {
  pathname: string
  actions: AssistantActionRecord[]
  onActions: (actions: AssistantAction[]) => void
  onApplyAction: (id: string) => void
  onClearActions: () => void
  selectedTarget: UiSelection | null
  selectedSessionKey: string | null
  getSelectedSessionKey: () => string | null
  onSelectSession: (key: string | null) => void
  onRefreshSessions: () => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<AssistantImageAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<AssistantThreadMessage[]>([])
  const [draft, setDraft] = useState<AssistantDraft | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pendingReadsRef = useRef(0)
  const pendingSendRef = useRef(false)
  const pendingTextRef = useRef('')
  const dragDepthRef = useRef(0)
  const justCreatedSessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError('')
    if (!selectedSessionKey) {
      setMessages([])
      return
    }
    void fetchChatHistory(selectedSessionKey)
      .then(history => {
        if (cancelled) return
        const normalized = normalizeAssistantHistory(history)
        if (justCreatedSessionKeyRef.current === selectedSessionKey) {
          justCreatedSessionKeyRef.current = null
          return
        }
        justCreatedSessionKeyRef.current = null
        setMessages(normalized)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load selected chat.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedSessionKey])

  const addImageDataUrls = useCallback((dataUrls: string[]) => {
    const valid = dataUrls.filter(value => value.startsWith('data:image/'))
    if (valid.length === 0) return
    setAttachments(prev => [
      ...prev,
      ...valid.map(dataUrl => ({
        id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        previewUrl: dataUrl,
        dataUrl,
      })),
    ].slice(0, 10))
  }, [])

  const addImageFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    imageFiles.slice(0, Math.max(0, 10 - attachments.length)).forEach(file => {
      pendingReadsRef.current += 1
      const reader = new FileReader()
      reader.onload = event => {
        const dataUrl = String(event.target?.result || '')
        pendingReadsRef.current = Math.max(0, pendingReadsRef.current - 1)
        if (dataUrl.startsWith('data:image/')) {
          addImageDataUrls([dataUrl])
        }
      }
      reader.onerror = () => {
        pendingReadsRef.current = Math.max(0, pendingReadsRef.current - 1)
      }
      reader.readAsDataURL(file)
    })
  }, [addImageDataUrls, attachments.length])

  const addImagePaths = useCallback(async (paths: string[]) => {
    const imagePaths = paths.filter(isImagePath)
    if (imagePaths.length === 0) return
    const selectedPaths = imagePaths.slice(0, Math.max(0, 10 - attachments.length))
    const pathAttachments = await Promise.all(selectedPaths.map(async path => ({
      id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      previewUrl: await previewUrlForPath(path),
      path,
      name: path.split(/[\\/]/).pop() || 'Dropped image',
    })))
    setAttachments(prev => [...prev, ...pathAttachments].slice(0, 10))

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const dataUrls = await Promise.all(
        selectedPaths.map(path =>
          invoke<string>('read_dropped_image_data_url', { path }).catch(() => ''),
        ),
      )
      setAttachments(prev => prev.map(item => {
        if (!item.path) return item
        const index = selectedPaths.indexOf(item.path)
        const dataUrl = index >= 0 ? dataUrls[index] : ''
        return dataUrl?.startsWith('data:image/') ? { ...item, dataUrl, previewUrl: dataUrl } : item
      }))
    } catch {
      setError('Screenshot attached by path. Relaunch clawctrl once if this still will not send to the assistant.')
    }
  }, [attachments.length])

  const removeImage = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))
  }, [])

  const handlePanelDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageTransfer(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    dragDepthRef.current += 1
    setDragActive(true)
  }, [])

  const handlePanelDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageTransfer(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }, [])

  const handlePanelDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragActive) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setDragActive(false)
    }
  }, [dragActive])

  const handlePanelDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageTransfer(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setDragActive(false)
    addImageFiles(Array.from(event.dataTransfer.files))
  }, [addImageFiles])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onDragDropEvent(event => {
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragActive(true)
          return
        }
        if (payload.type === 'leave') {
          dragDepthRef.current = 0
          setDragActive(false)
          return
        }
        if (payload.type === 'drop') {
          dragDepthRef.current = 0
          setDragActive(false)
          void addImagePaths(payload.paths)
        }
      }))
      .then(nextUnlisten => {
        if (cancelled) {
          nextUnlisten()
        } else {
          unlisten = nextUnlisten
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [addImagePaths])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
      if (files.length === 0) return
      event.preventDefault()
      addImageFiles(files)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addImageFiles])

  const sendWithImages = useCallback(async (rawText: string, currentAttachments: AssistantImageAttachment[]) => {
    const imageDataUrls = currentAttachments.flatMap(item => item.dataUrl ? [item.dataUrl] : [])
    const imagePaths = currentAttachments.flatMap(item => item.path ? [item.path] : [])
    const previewImages = currentAttachments.map(item => item.previewUrl)
    const text = rawText.trim() || (currentAttachments.length > 0 ? 'Please inspect the attached screenshot.' : '')
    if ((!text && currentAttachments.length === 0) || sending) return

    const userMessage: AssistantThreadMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      images: previewImages,
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setAttachments([])
    setSending(true)
    setError('')

    const capture = parseCaptureCommand(text)
    if (capture) {
      try {
        await api.post('/api/capture', { type: capture.type, content: capture.content })
        setMessages(prev => [...prev, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: `Saved ${capture.type}.`,
        }])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Capture failed.')
      } finally {
        setSending(false)
      }
      return
    }

    const builderMode = shouldUseBuilderMode(text, selectedTarget, draft)
    const visiblePageContext = collectVisiblePageContext(pathname)
    const duplicateTarget = builderMode ? findPlacedWidgetConflict(text, pathname) : null
    if (!draft && duplicateTarget && shouldAskBeforeDuplicatingWidget(text)) {
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: `You already have a ${duplicateTarget.name} widget on ${duplicateTarget.pageName}. Do you want me to edit/expand that existing widget, restyle it, resize it, or create a separate new widget?`,
      }])
      setSending(false)
      return
    }
    visiblePageContext.liveAppContext = await buildLiveAppContext(api.get, {
      requestText: text,
      route: pathname,
      pageTitle: visiblePageContext.pageTitle,
      context: {
        project: 'clawcontrol',
        workingDir: '/Volumes/T7/projects/clawcontrol',
        runtime: 'Work locally',
      },
    }).catch((err) => {
      console.warn('Failed to capture live app context:', err)
      return ''
    })

    try {
      let reply = ''
      let activeSessionKey = getSelectedSessionKey()
      const shouldCreateNewChat = !activeSessionKey
      if (builderMode) {
        try {
          const response = await requestThesysOpenUi(text, pathname, selectedTarget, draft, visiblePageContext, imageDataUrls, imagePaths, activeSessionKey, shouldCreateNewChat)
          reply = String(response.reply || '')
          const nextSessionKey = response.sessionKey?.trim()
          if (nextSessionKey) {
            activeSessionKey = nextSessionKey
            if (shouldCreateNewChat) justCreatedSessionKeyRef.current = nextSessionKey
            onSelectSession(nextSessionKey)
            notifyChatSessionsChanged({ sessionKey: nextSessionKey })
          }
        } catch {
          const baseline = await fetchChatHistory(activeSessionKey).catch(() => [])
          const baselineAssistantIds = new Set(baseline.filter(item => item.role === 'assistant').map(item => String(item.id || '')))
          const startedAt = Date.now()
          const response = await api.post<OpenUiChatResponse>('/api/chat', {
            text: buildOpenUiRequest(text, pathname, selectedTarget, draft, visiblePageContext),
            images: imageDataUrls,
            imagePaths,
            system_prompt: buildOpenUiLangSystemPrompt(),
            newChat: shouldCreateNewChat,
            ...(activeSessionKey ? { sessionKey: activeSessionKey } : {}),
          })
          const nextSessionKey = response.sessionKey?.trim()
          if (nextSessionKey) {
            activeSessionKey = nextSessionKey
            if (shouldCreateNewChat) justCreatedSessionKeyRef.current = nextSessionKey
            onSelectSession(nextSessionKey)
            notifyChatSessionsChanged({ sessionKey: nextSessionKey })
          }
          reply = response.reply?.trim() || await waitForAssistantReply(activeSessionKey, startedAt, baselineAssistantIds)
        }
      } else {
        const baseline = await fetchChatHistory(activeSessionKey).catch(() => [])
        const baselineAssistantIds = new Set(baseline.filter(item => item.role === 'assistant').map(item => String(item.id || '')))
        const startedAt = Date.now()
        const response = await requestHermesChat(text, imageDataUrls, imagePaths, activeSessionKey, shouldCreateNewChat, visiblePageContext.liveAppContext)
        reply = String(response.reply || '')
        const nextSessionKey = response.sessionKey?.trim()
        if (nextSessionKey) {
          activeSessionKey = nextSessionKey
          if (shouldCreateNewChat) justCreatedSessionKeyRef.current = nextSessionKey
          onSelectSession(nextSessionKey)
          notifyChatSessionsChanged({ sessionKey: nextSessionKey })
        }
        if (!reply.trim()) {
          reply = await waitForAssistantReply(activeSessionKey, startedAt, baselineAssistantIds)
        }
      }
      if (!builderMode) {
        setMessages(prev => [...prev, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: reply,
        }])
        await onRefreshSessions()
        return
      }
      const next = extractOpenUiResult(reply, text)
      const styleActions = next.actions.filter(action => action.type === 'ui.style_override')
      const sidebarActions = next.actions.filter(action => action.type.startsWith('sidebar.'))
      const themeActions = next.actions.filter(action => action.type.startsWith('theme.'))
      const otherActions = next.actions.filter(action => (
        action.type !== 'ui.style_override' &&
        !action.type.startsWith('sidebar.') &&
        !action.type.startsWith('theme.')
      ))
      let previewMessage = ''
      if (styleActions.length > 0) {
        try {
          let latestDraft: StyleAssistantDraft | null = null
          for (const action of styleActions) {
            latestDraft = previewUiStyleAction(action, selectedTarget, pathname)
          }
          if (latestDraft) {
            setDraft(latestDraft)
            previewMessage = `\n\n${latestDraft.message}`
          }
        } catch (err) {
          previewMessage = `\n\nStyle preview failed: ${err instanceof Error ? err.message : 'Could not preview this style change.'}`
        }
      }
      if (sidebarActions.length > 0) {
        try {
          let latestDraft: SidebarAssistantDraft | null = null
          for (const action of sidebarActions) {
            latestDraft = previewSidebarAction(action)
          }
          if (latestDraft) {
            setDraft(latestDraft)
            previewMessage = `\n\n${latestDraft.message}`
          }
        } catch (err) {
          previewMessage = `\n\nSidebar preview failed: ${err instanceof Error ? err.message : 'Could not preview this sidebar change.'}`
        }
      }
      if (themeActions.length > 0) {
        try {
          let latestDraft: ThemeAssistantDraft | null = null
          for (const action of themeActions) {
            latestDraft = previewThemeAction(action, selectedTarget, pathname)
          }
          if (latestDraft) {
            setDraft(latestDraft)
            previewMessage = `\n\n${latestDraft.message}`
          }
        } catch (err) {
          previewMessage = `\n\nTheme preview failed: ${err instanceof Error ? err.message : 'Could not preview this theme change.'}`
        }
      }
      if (next.openUiLang && shouldPreviewDashboardWidget(text, pathname)) {
        try {
          const nextDraft = draft?.kind === 'widget'
            ? refineOpenUiWidgetDraft(draft, next.openUiLang)
            : previewOpenUiWidget(next.openUiLang, pathname)
          setDraft(nextDraft)
          previewMessage = `\n\n${nextDraft.message}`
        } catch (err) {
          previewMessage = `\n\nPreview failed: ${err instanceof Error ? err.message : 'Could not preview this change.'}`
        }
      }
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: `${next.reply}${previewMessage}`,
        openUiLang: next.openUiLang,
      }])
      onActions(otherActions)
      await onRefreshSessions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed.')
    } finally {
      setSending(false)
    }
  }, [draft, getSelectedSessionKey, onActions, onRefreshSessions, onSelectSession, pathname, selectedTarget, sending])

  const send = useCallback(() => {
    if (sending) return
    const text = input.trim()
    if (!text && attachments.length === 0 && pendingReadsRef.current === 0) return
    if (pendingReadsRef.current > 0) {
      pendingSendRef.current = true
      pendingTextRef.current = text
      setInput('')
      return
    }
    void sendWithImages(text, attachments)
  }, [attachments, input, sendWithImages, sending])

  useEffect(() => {
    if (pendingReadsRef.current !== 0 || !pendingSendRef.current || attachments.length === 0) return
    pendingSendRef.current = false
    void sendWithImages(pendingTextRef.current, attachments)
  }, [attachments, sendWithImages])

  const saveDraft = useCallback(async () => {
    if (!draft || draft.status === 'saving') return
    setDraft({ ...draft, status: 'saving', message: 'Saving preview...' })
    try {
      setDraft(await saveOpenUiDraft(draft))
    } catch (err) {
      setDraft({ ...draft, status: 'error', message: err instanceof Error ? err.message : 'Save failed.' })
    }
  }, [draft])

  const discardDraft = useCallback(() => {
    if (!draft) return
    setDraft(discardOpenUiDraft(draft))
    window.setTimeout(() => setDraft(null), 900)
  }, [draft])

  const undoDraft = useCallback(() => {
    if (!draft) return
    setDraft(undoOpenUiDraft(draft))
  }, [draft])

  const redoDraft = useCallback(() => {
    if (!draft) return
    setDraft(redoOpenUiDraft(draft))
  }, [draft])

  const editDraft = useCallback(() => {
    if (!draft) return
    const lead = draft.kind === 'widget'
      ? 'Refine this preview: '
      : draft.kind === 'style'
        ? 'Edit the selected style preview: '
        : `Edit this ${draft.kind} preview: `
    setInput(lead)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [draft])

  return (
    <div
      data-testid="assistant-sidebar-dropzone"
      onDragEnter={handlePanelDragEnter}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 10, gap: 10 }}
    >
      {dragActive && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 10,
            zIndex: 6,
            display: 'grid',
            placeItems: 'center',
            border: '1px dashed var(--border-accent)',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--bg-panel) 82%, var(--accent) 18%)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          Drop screenshot here
        </div>
      )}
      {error && <div style={{ ...noticeStyle, borderColor: 'var(--red)', color: 'var(--red)' }}>{error}</div>}
      <UnifiedMessageList messages={messages} sending={sending} />
      {draft && (
        <AssistantDraftPanel
          draft={draft}
          onSave={saveDraft}
          onUndo={undoDraft}
          onRedo={redoDraft}
          onEdit={editDraft}
          onDiscard={discardDraft}
        />
      )}
      {actions.length > 0 && (
        <AssistantActionsPanel actions={actions} onApply={onApplyAction} onClear={onClearActions} />
      )}
      <AssistantComposer
        value={input}
        onChange={setInput}
        inputRef={inputRef}
        images={attachments.map(item => item.previewUrl)}
        onFiles={addImageFiles}
        onRemoveImage={removeImage}
        sending={sending}
        placeholder="Ask, build, or change anything..."
        onSend={send}
        onStop={() => setSending(false)}
      />
    </div>
  )
}

function AssistantSessionPicker({
  sessions,
  selectedSessionKey,
  onSelect,
  title,
}: {
  sessions: ClaudeSession[]
  selectedSessionKey: string | null
  onSelect: (key: string | null) => void
  title?: string
}) {
  return (
    <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center' }}>
      <select
        value={selectedSessionKey ?? ''}
        onChange={event => onSelect(event.target.value || null)}
        aria-label="Select assistant chat"
        title={title || 'Select assistant chat'}
        style={{
          minWidth: 0,
          flex: 1,
          height: 32,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: 12,
          fontWeight: 700,
          padding: '0 8px',
        }}
      >
        <option value="">New saved chat</option>
        {sessions.slice(0, 30).map(session => (
          <option key={session.key} value={session.key}>
            {session.label || 'Untitled chat'}
          </option>
        ))}
      </select>
    </div>
  )
}

function InspectorHighlight({ rect }: { rect: UiSelection['rect'] }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        border: '2px solid var(--accent)',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.18)',
        borderRadius: 6,
        zIndex: 100000,
      }}
    />
  )
}

function AssistantDraftPanel({
  draft,
  onSave,
  onUndo,
  onRedo,
  onEdit,
  onDiscard,
}: {
  draft: AssistantDraft
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onEdit: () => void
  onDiscard: () => void
}) {
  return (
    <div style={{ flexShrink: 0, border: '1px solid var(--border-accent)', borderRadius: 8, background: 'var(--bg-card)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Unsaved UI preview</div>
          <div style={{ fontSize: 12, color: draft.status === 'error' ? 'var(--red)' : 'var(--text-muted)', marginTop: 2 }}>
            {draft.message || 'Live previewing. Save to keep it.'}
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{draft.kind === 'widget' ? draft.store : draft.kind}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button onClick={onEdit} style={secondaryButtonStyle}><PencilSimple size={13} />Edit</button>
        <button onClick={onUndo} style={secondaryButtonStyle}><ArrowCounterClockwise size={13} />Undo</button>
        <button onClick={onRedo} style={secondaryButtonStyle}><ArrowClockwise size={13} />Redo</button>
        <button onClick={onDiscard} style={secondaryButtonStyle}><X size={13} />Discard</button>
        <button onClick={onSave} disabled={draft.status === 'saving' || draft.status === 'saved'} style={primaryButtonStyle}>
          {draft.status === 'saved' ? <><Check size={13} />Saved</> : <><FloppyDisk size={13} />{draft.status === 'saving' ? 'Saving...' : 'Save'}</>}
        </button>
      </div>
    </div>
  )
}

function AssistantActionsPanel({
  actions,
  onApply,
  onClear,
}: {
  actions: AssistantActionRecord[]
  onApply: (id: string) => void
  onClear: () => void
}) {
  return (
    <div style={{ flexShrink: 0, maxHeight: '36%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Queued app actions</div>
        <button onClick={onClear} style={secondaryButtonStyle}>Clear</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.length === 0 ? (
          <div style={noticeStyle}>No actions queued.</div>
        ) : actions.map(action => (
          <div key={action.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{action.summary}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{action.type}</div>
              </div>
              <span style={{ fontSize: 11, color: action.risk === 'high' ? 'var(--red)' : 'var(--text-muted)' }}>{action.risk || 'low'}</span>
            </div>
            {action.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{action.error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => onApply(action.id)}
                disabled={action.status === 'applied'}
                style={action.status === 'applied' ? secondaryButtonStyle : primaryButtonStyle}
              >
                {action.status === 'applied' ? <><Check size={13} /> Applied</> : 'Apply'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UnifiedMessageList({
  messages,
  sending,
}: {
  messages: AssistantThreadMessage[]
  sending: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, sending])

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
      {messages.length === 0 ? (
        <div style={{ ...noticeStyle, marginTop: 0 }}>
          Tell the assistant what to build, change, capture, or explain.
        </div>
      ) : null}
      {messages.map(message => (
        <AssistantThreadBubble
          key={message.id}
          message={message}
        />
      ))}
      {sending && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Assistant is thinking...</div>}
    </div>
  )
}

function AssistantThreadBubble({
  message,
}: {
  message: AssistantThreadMessage
}) {
  const isUser = message.role === 'user'
  const hasOpenUi = Boolean(message.openUiLang)
  const hasImages = Boolean(message.images?.length)
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        width: !isUser && hasOpenUi ? '100%' : undefined,
        maxWidth: isUser ? '82%' : hasOpenUi ? '100%' : '92%',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'var(--tertiary)' : 'var(--bg-card)',
        border: isUser ? '1px solid transparent' : '1px solid var(--border)',
        color: isUser ? 'var(--text-on-color)' : 'var(--text-primary)',
        padding: hasOpenUi ? 8 : '8px 11px',
        fontSize: 13,
        lineHeight: 1.55,
        wordBreak: 'break-word',
      }}
    >
      {isUser ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: hasImages ? 8 : 0 }}>
          {hasImages && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {message.images?.map((image, index) => (
                <div key={`${image.slice(0, 32)}-${index}`} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-white-04)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  <ImageIcon size={18} />
                  <img
                    src={image}
                    alt="Attached screenshot"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          )}
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.text}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {message.text && (
            <Suspense fallback={<span style={{ whiteSpace: 'pre-wrap' }}>{message.text}</span>}>
              <MarkdownBubble>{message.text}</MarkdownBubble>
            </Suspense>
          )}
          {message.openUiLang && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--bg-panel)', width: '100%', minWidth: 0 }}>
              <OpenUiSnippet source={message.openUiLang} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function hasImageTransfer(dataTransfer: DataTransfer): boolean {
  const items = Array.from(dataTransfer.items || [])
  if (items.some(item => item.kind === 'file' && (!item.type || item.type.startsWith('image/')))) return true
  return Array.from(dataTransfer.files || []).some(file => file.type.startsWith('image/'))
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(path)
}

async function previewUrlForPath(path: string): Promise<string> {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    return convertFileSrc(path)
  } catch {
    return path
  }
}

function AssistantComposer({
  value,
  onChange,
  inputRef,
  images,
  onFiles,
  onRemoveImage,
  sending,
  placeholder,
  onSend,
  onStop,
}: {
  value: string
  onChange: (value: string) => void
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  images: string[]
  onFiles: (files: File[]) => void
  onRemoveImage: (index: number) => void
  sending: boolean
  placeholder: string
  onSend: () => void
  onStop: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canSend = Boolean(value.trim() || images.length > 0)

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    onFiles(Array.from(event.dataTransfer.files))
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    onFiles(files)
  }

  return (
    <div
      data-testid="assistant-composer-dropzone"
      onDrop={handleDrop}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      style={{ flexShrink: 0, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {images.map((image, index) => (
            <div key={`${image.slice(0, 32)}-${index}`} style={{ position: 'relative', width: 48, height: 48, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-white-04)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', overflow: 'visible' }}>
              <ImageIcon size={15} />
              <img src={image} alt="Attached preview" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
              <button
                onClick={() => onRemoveImage(index)}
                aria-label="Remove attached image"
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={event => {
            onFiles(Array.from(event.target.files || []))
            event.target.value = ''
          }}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach screenshot"
          aria-label="Attach screenshot"
          style={{ ...iconButtonStyle, flexShrink: 0, width: 30, height: 34, borderRadius: 10 }}
        >
          <ImageIcon size={15} />
        </button>
        <textarea
          ref={inputRef}
          value={value}
          onPaste={handlePaste}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSend()
            }
          }}
          placeholder={placeholder}
          aria-label="Assistant message"
          rows={2}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', resize: 'none', font: 'inherit', fontSize: 13, lineHeight: 1.45, maxHeight: 110 }}
        />
        <button
          onClick={sending ? onStop : onSend}
          disabled={!sending && !canSend}
          aria-label={sending ? 'Stop assistant request' : 'Send assistant message'}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: '1px solid var(--border-accent)',
            background: canSend || sending ? 'var(--accent)' : 'var(--bg-white-04)',
            color: canSend || sending ? 'var(--text-on-color)' : 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
            cursor: canSend || sending ? 'pointer' : 'default',
          }}
        >
          {sending ? <X size={15} /> : <PaperPlaneTilt size={15} weight="fill" />}
        </button>
      </div>
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg-white-04)',
  color: 'var(--text-muted)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
}

const primaryButtonStyle: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 8,
  border: '1px solid var(--border-accent)',
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 30,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-white-04)',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const noticeStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg-white-04)',
  color: 'var(--text-secondary)',
  padding: 10,
  fontSize: 12,
  lineHeight: 1.45,
}
