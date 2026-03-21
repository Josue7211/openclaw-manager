/**
 * Centralized registration point for all primitive widgets.
 *
 * Each primitive plan (02-06) will add registerWidget() calls here
 * as primitives are built. Call registerPrimitives() once at app startup
 * to make all primitives available in the Widget Registry and WidgetPicker.
 */

import { registerWidget } from '@/lib/widget-registry'
import { configSchema as lineChartSchema } from './LineChart'
import { configSchema as barChartSchema } from './BarChart'
import { configSchema as statCardSchema } from './StatCard'
import { configSchema as progressGaugeSchema } from './ProgressGauge'
import { configSchema as markdownDisplaySchema } from './MarkdownDisplay'
import { configSchema as listViewSchema } from './ListView'
import { configSchema as dataTableSchema } from './DataTable'
import { configSchema as formWidgetSchema } from './FormWidget'
import { configSchema as kanbanBoardSchema } from './KanbanBoard'
import { configSchema as timerCountdownSchema } from './TimerCountdown'
import { configSchema as imageGallerySchema } from './ImageGallery'

export function registerPrimitives(): void {
  // -- StatCard (06-02) --
  registerWidget({
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
  })

  // -- ProgressGauge (06-02) --
  registerWidget({
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
  })

  // -- MarkdownDisplay (06-02) --
  registerWidget({
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
  })

  // -- LineChart (06-03) --
  registerWidget({
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
  })

  // -- BarChart (06-03) --
  registerWidget({
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
  })

  // -- ListView (06-04) --
  registerWidget({
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
  })

  // -- DataTable (06-04) --
  registerWidget({
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
  })

  // -- FormWidget (06-05) --
  registerWidget({
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
  })

  // -- KanbanBoard (06-05) --
  registerWidget({
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
  })

  // -- TimerCountdown (06-06) --
  registerWidget({
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
  })

  // -- ImageGallery (06-06) --
  registerWidget({
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
  })
}
