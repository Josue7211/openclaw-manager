/**
 * ImageGallery primitive -- CSS Grid of images with lightbox viewing.
 *
 * Config keys: columns (number), gap (number, px), images (GalleryImage[])
 * Reuses existing Lightbox component for fullscreen viewing.
 */

import React, { useState, lazy, Suspense } from 'react'
import { Images } from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { EmptyState } from '@/components/ui/EmptyState'
import type { LightboxData } from '@/components/Lightbox'
import { configNumber, configArray } from './shared'

const Lightbox = lazy(() => import('@/components/Lightbox'))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GalleryImage {
  src: string
  alt?: string
}

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'columns', label: 'Columns', type: 'slider', default: 3, min: 1, max: 6 },
    { key: 'gap', label: 'Gap (px)', type: 'slider', default: 8, min: 0, max: 24 },
  ],
}

// Transparent pixel fallback for broken images
const FALLBACK_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ImageGallery = React.memo(function ImageGallery({ config }: WidgetProps) {
  const columns = configNumber(config, 'columns', 3)
  const gap = configNumber(config, 'gap', 8)
  const images = configArray<GalleryImage>(config, 'images')

  const [lightbox, setLightbox] = useState<LightboxData>(null)

  if (images.length === 0) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <EmptyState icon={Images} title="No images" description="Add images in widget config" />
      </div>
    )
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${gap}px`,
          padding: '8px',
          overflowY: 'auto',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        {images.map((image, i) => (
          <button
            key={image.src + i}
            type="button"
            aria-label={image.alt || 'Gallery image'}
            onClick={() => setLightbox({ src: image.src, type: 'image' })}
            style={{
              aspectRatio: '1',
              overflow: 'hidden',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              border: 'none',
              padding: 0,
              background: 'var(--bg-base)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <img
              src={image.src}
              alt={image.alt || 'Gallery image'}
              loading="lazy"
              onError={e => { (e.target as HTMLImageElement).src = FALLBACK_SRC }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </button>
        ))}
      </div>

      {lightbox && (
        <Suspense fallback={null}>
          <Lightbox data={lightbox} onClose={() => setLightbox(null)} />
        </Suspense>
      )}
    </>
  )
})

export default ImageGallery
