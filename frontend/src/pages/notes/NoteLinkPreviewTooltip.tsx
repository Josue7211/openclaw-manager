import type { ExternalLinkPreviewModel, ImageLinkPreviewModel, NoteLinkPreviewModel } from './noteLinkPreview'

export interface NoteLinkPreviewState {
  preview: NoteLinkPreviewModel | ImageLinkPreviewModel | ExternalLinkPreviewModel
  x: number
  y: number
}

export function NoteLinkPreviewTooltip({ preview }: { preview: NoteLinkPreviewState }) {
  const model = preview.preview
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: preview.x,
        top: preview.y,
        zIndex: 1000,
        width: 320,
        maxWidth: 'calc(100vw - 24px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--bg-elevated, var(--bg-card-solid)) 94%, black)',
        boxShadow: '0 14px 34px var(--overlay-heavy)',
        padding: 12,
        pointerEvents: 'none',
      }}
    >
      {model.kind === 'image' ? (
        <>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            {model.title}
          </div>
          <img
            src={model.src}
            alt={model.alt}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 190,
              objectFit: 'contain',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-white-03)',
            }}
          />
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.target}{model.width ? ` / ${model.width}px` : ''}
          </div>
        </>
      ) : model.kind === 'external' ? (
        <>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.title}
          </div>
          <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 650, marginBottom: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.domain}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.href}
          </div>
        </>
      ) : (
        <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: model.exists ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {model.title}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
            {model.folder}
            {model.anchor ? ` / ${model.anchor}` : ''}
          </div>
        </div>
        {!model.exists && (
          <span
            style={{
              flexShrink: 0,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              color: 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 650,
            }}
          >
            missing
          </span>
        )}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.45 }}>
        {model.excerpt}
      </div>
      {model.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {model.tags.map(tag => (
            <span
              key={tag}
              style={{
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-white-04)',
                color: 'var(--text-muted)',
                fontSize: 10,
                padding: '2px 5px',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}
