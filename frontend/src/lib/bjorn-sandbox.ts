/**
 * Sandbox HTML builder for Bjorn module previews.
 *
 * Produces a CSP-hardened srcdoc string for iframe previews with:
 * - Content Security Policy blocking all external resources
 * - Theme CSS variable injection for visual fidelity
 * - Minimal DOM builder (h function) for rendering
 * - postMessage data bridge (requestData) with timeout
 *
 * SECURITY: The innerHTML usage in the error handler below runs INSIDE
 * the sandboxed iframe (sandbox="allow-scripts" without allow-same-origin).
 * It cannot access the parent DOM, cookies, or storage. The error message
 * comes from the caught exception within the iframe's own execution context.
 */

// ---------------------------------------------------------------------------
// Theme extraction
// ---------------------------------------------------------------------------

/**
 * Extract all CSS custom properties from the document root.
 * Returns a `:root { ... }` CSS string with current theme variables.
 * Returns empty string in non-browser environments (tests, SSR).
 */
export function getThemeVarsCSS(): string {
  if (typeof document === 'undefined') return ''

  const computed = getComputedStyle(document.documentElement)
  const props: string[] = []

  for (let i = 0; i < computed.length; i++) {
    const name = computed[i]
    if (name.startsWith('--')) {
      props.push(`  ${name}: ${computed.getPropertyValue(name).trim()};`)
    }
  }

  if (props.length === 0) return ''
  return `:root {\n${props.join('\n')}\n}`
}

// ---------------------------------------------------------------------------
// Sandbox HTML builder
// ---------------------------------------------------------------------------

/**
 * Build a complete HTML document for use as iframe srcdoc.
 * The document is self-contained with CSP, theme vars, a data bridge,
 * and a minimal DOM builder for rendering the generated component.
 */
export function buildSandboxHTML(componentSource: string, themeVarsCSS: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, sans-serif; color: var(--text-primary, #e0e0e0); background: var(--bg-base, #1a1a2e); overflow: auto; }
${themeVarsCSS}
</style>
</head>
<body>
<div id="root"></div>
<script>
// -- Data bridge: window.requestData(source, command, args?) --
window.requestData = function(source, command, args) {
  return new Promise(function(resolve, reject) {
    var requestId = 'br_' + Math.random().toString(36).slice(2)
    var timer = setTimeout(function() {
      window.removeEventListener('message', handler)
      reject(new Error('Data bridge timeout'))
    }, 10000)

    function handler(event) {
      var d = event.data
      if (!d || d.requestId !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', handler)
      if (d.type === 'data-error') reject(new Error(d.error || 'Bridge error'))
      else resolve(d.data)
    }
    window.addEventListener('message', handler)
    window.parent.postMessage({ type: 'data-request', requestId: requestId, source: source, command: command, args: args || {} }, '*')
  })
}

// -- Minimal DOM builder --
function h(tag, props) {
  var el = document.createElement(tag)
  if (props) {
    Object.keys(props).forEach(function(k) {
      if (k === 'style' && typeof props[k] === 'object') {
        Object.assign(el.style, props[k])
      } else if (k === 'children') {
        // skip, handled below
      } else {
        el.setAttribute(k, props[k])
      }
    })
  }
  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i]
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)))
    } else if (child && child.nodeType) {
      el.appendChild(child)
    }
  }
  return el
}

// -- Component source --
try {
${componentSource}

  // Render: call BjornWidget if defined
  if (typeof BjornWidget === 'function') {
    var props = { widgetId: 'preview', config: {}, isEditMode: false, size: { w: 4, h: 3 } }
    var result = BjornWidget(props, h)
    if (result && result.nodeType) {
      document.getElementById('root').appendChild(result)
    }
  }
} catch (err) {
  // Error display runs inside sandboxed iframe -- no parent DOM access
  var errEl = document.createElement('div')
  errEl.style.cssText = 'color:var(--red,#ef4444);padding:16px;font-size:14px'
  var strong = document.createElement('strong')
  strong.textContent = 'Preview Error'
  errEl.appendChild(strong)
  errEl.appendChild(document.createElement('br'))
  errEl.appendChild(document.createTextNode(String(err.message || err)))
  document.getElementById('root').appendChild(errEl)
}
</script>
</body>
</html>`
}
