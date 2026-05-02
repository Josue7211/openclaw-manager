/**
 * Centralized registration point for all primitive widgets.
 *
 * Each primitive plan (02-06) will add registerWidget() calls here
 * as primitives are built. Call registerPrimitives() once at app startup
 * to make all primitives available in the Widget Registry and WidgetPicker.
 */

import { registerWidget } from '@/lib/widget-registry'
import LineChart, { configSchema as lineChartSchema } from './LineChart'
import BarChart, { configSchema as barChartSchema } from './BarChart'
import StatCard, { configSchema as statCardSchema } from './StatCard'
import ProgressGauge, { configSchema as progressGaugeSchema } from './ProgressGauge'
import MarkdownDisplay, { configSchema as markdownDisplaySchema } from './MarkdownDisplay'
import ListView, { configSchema as listViewSchema } from './ListView'
import DataTable, { configSchema as dataTableSchema } from './DataTable'
import FormWidget, { configSchema as formWidgetSchema } from './FormWidget'
import KanbanBoard, { configSchema as kanbanBoardSchema } from './KanbanBoard'
import TimerCountdown, { configSchema as timerCountdownSchema } from './TimerCountdown'
import ImageGallery, { configSchema as imageGallerySchema } from './ImageGallery'

export const PRIMITIVE_COMPONENTS = {
  StatCard,
  ProgressGauge,
  MarkdownDisplay,
  LineChart,
  BarChart,
  ListView,
  DataTable,
  FormWidget,
  KanbanBoard,
  TimerCountdown,
  ImageGallery,
} as const

export const PRIMITIVE_DEFINITIONS = [
  {
    name: 'StatCard',
    widget: {
      id: 'prim-stat-card',
      name: 'Stat Card',
      description: 'Metric card with title, value, trend arrow, and sparkline',
      icon: 'ChartLineUp',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 3, h: 2 },
      minSize: { w: 2, h: 2 },
      configSchema: statCardSchema,
      component: () => import('./StatCard'),
    },
  },
  {
    name: 'ProgressGauge',
    widget: {
      id: 'prim-progress-gauge',
      name: 'Progress Gauge',
      description: 'Linear progress bar or circular gauge',
      icon: 'Gauge',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 3, h: 2 },
      minSize: { w: 2, h: 1 },
      configSchema: progressGaugeSchema,
      component: () => import('./ProgressGauge'),
    },
  },
  {
    name: 'MarkdownDisplay',
    widget: {
      id: 'prim-markdown',
      name: 'Markdown Display',
      description: 'Sanitized markdown content renderer',
      icon: 'Notepad',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 4, h: 3 },
      minSize: { w: 2, h: 2 },
      configSchema: markdownDisplaySchema,
      component: () => import('./MarkdownDisplay'),
    },
  },
  {
    name: 'LineChart',
    widget: {
      id: 'prim-line-chart',
      name: 'Line Chart',
      description: 'SVG line chart with axes, grid, and tooltip',
      icon: 'ChartLine',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 4, h: 3 },
      minSize: { w: 3, h: 2 },
      configSchema: lineChartSchema,
      component: () => import('./LineChart'),
    },
  },
  {
    name: 'BarChart',
    widget: {
      id: 'prim-bar-chart',
      name: 'Bar Chart',
      description: 'SVG bar chart with vertical/horizontal/stacked modes',
      icon: 'ChartBar',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 4, h: 3 },
      minSize: { w: 3, h: 2 },
      configSchema: barChartSchema,
      component: () => import('./BarChart'),
    },
  },
  {
    name: 'ListView',
    widget: {
      id: 'prim-list-view',
      name: 'List View',
      description: 'Sortable, filterable, paginated list',
      icon: 'List',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 3, h: 4 },
      minSize: { w: 2, h: 3 },
      configSchema: listViewSchema,
      component: () => import('./ListView'),
    },
  },
  {
    name: 'DataTable',
    widget: {
      id: 'prim-data-table',
      name: 'Data Table',
      description: 'Sortable table with sticky header and pagination',
      icon: 'Table',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 4, h: 4 },
      minSize: { w: 3, h: 3 },
      configSchema: dataTableSchema,
      component: () => import('./DataTable'),
    },
  },
  {
    name: 'FormWidget',
    widget: {
      id: 'prim-form',
      name: 'Form',
      description: 'Schema-driven form with multiple field types',
      icon: 'TextAa',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 3, h: 4 },
      minSize: { w: 2, h: 3 },
      configSchema: formWidgetSchema,
      component: () => import('./FormWidget'),
    },
  },
  {
    name: 'KanbanBoard',
    widget: {
      id: 'prim-kanban',
      name: 'Kanban Board',
      description: 'Column-based board with drag-and-drop cards',
      icon: 'Kanban',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 6, h: 4 },
      minSize: { w: 4, h: 3 },
      configSchema: kanbanBoardSchema,
      component: () => import('./KanbanBoard'),
    },
  },
  {
    name: 'TimerCountdown',
    widget: {
      id: 'prim-timer',
      name: 'Timer / Countdown',
      description: 'Counts up or down with start/pause/reset controls',
      icon: 'Timer',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 2, h: 2 },
      minSize: { w: 2, h: 2 },
      configSchema: timerCountdownSchema,
      component: () => import('./TimerCountdown'),
    },
  },
  {
    name: 'ImageGallery',
    widget: {
      id: 'prim-image-gallery',
      name: 'Image Gallery',
      description: 'CSS Grid image gallery with lightbox viewing',
      icon: 'Images',
      category: 'primitives',
      tier: 'user',
      defaultSize: { w: 4, h: 3 },
      minSize: { w: 2, h: 2 },
      configSchema: imageGallerySchema,
      component: () => import('./ImageGallery'),
    },
  },
] as const

export function registerPrimitives(): void {
  for (const primitive of PRIMITIVE_DEFINITIONS) {
    registerWidget(primitive.widget)
  }
}
