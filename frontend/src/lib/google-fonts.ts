/**
 * Google Fonts — static list of top 100 fonts + CSS loading helper.
 *
 * No API key is needed: fonts are loaded via the public CSS2 endpoint
 * (fonts.googleapis.com/css2), which returns @font-face rules for any
 * font family. The static list avoids runtime API calls and key exposure.
 *
 * See: RESEARCH.md Pitfall #4 — Google Fonts API key exposure prevention.
 */

interface GoogleFont {
  family: string
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting'
}

/**
 * Top 100 Google Fonts by popularity, categorized.
 * Source: fonts.google.com/analytics (March 2026 snapshot).
 */
export const GOOGLE_FONTS: readonly GoogleFont[] = [
  // Sans-serif (most popular)
  { family: 'Roboto', category: 'sans-serif' },
  { family: 'Open Sans', category: 'sans-serif' },
  { family: 'Noto Sans', category: 'sans-serif' },
  { family: 'Lato', category: 'sans-serif' },
  { family: 'Montserrat', category: 'sans-serif' },
  { family: 'Poppins', category: 'sans-serif' },
  { family: 'Roboto Condensed', category: 'sans-serif' },
  { family: 'Inter', category: 'sans-serif' },
  { family: 'Raleway', category: 'sans-serif' },
  { family: 'Nunito', category: 'sans-serif' },
  { family: 'Nunito Sans', category: 'sans-serif' },
  { family: 'Ubuntu', category: 'sans-serif' },
  { family: 'Rubik', category: 'sans-serif' },
  { family: 'Work Sans', category: 'sans-serif' },
  { family: 'Fira Sans', category: 'sans-serif' },
  { family: 'Quicksand', category: 'sans-serif' },
  { family: 'Barlow', category: 'sans-serif' },
  { family: 'Mulish', category: 'sans-serif' },
  { family: 'PT Sans', category: 'sans-serif' },
  { family: 'Cabin', category: 'sans-serif' },
  { family: 'Karla', category: 'sans-serif' },
  { family: 'DM Sans', category: 'sans-serif' },
  { family: 'Manrope', category: 'sans-serif' },
  { family: 'Josefin Sans', category: 'sans-serif' },
  { family: 'Space Grotesk', category: 'sans-serif' },
  { family: 'Libre Franklin', category: 'sans-serif' },
  { family: 'IBM Plex Sans', category: 'sans-serif' },
  { family: 'Source Sans 3', category: 'sans-serif' },
  { family: 'Noto Sans JP', category: 'sans-serif' },
  { family: 'Noto Sans KR', category: 'sans-serif' },
  { family: 'Hind', category: 'sans-serif' },
  { family: 'Archivo', category: 'sans-serif' },
  { family: 'Dosis', category: 'sans-serif' },
  { family: 'Outfit', category: 'sans-serif' },
  { family: 'Exo 2', category: 'sans-serif' },
  { family: 'Lexend', category: 'sans-serif' },
  { family: 'Figtree', category: 'sans-serif' },
  { family: 'Signika', category: 'sans-serif' },
  { family: 'Catamaran', category: 'sans-serif' },
  { family: 'Overpass', category: 'sans-serif' },
  { family: 'Jost', category: 'sans-serif' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif' },
  { family: 'Assistant', category: 'sans-serif' },
  { family: 'Red Hat Display', category: 'sans-serif' },
  { family: 'Urbanist', category: 'sans-serif' },
  { family: 'Public Sans', category: 'sans-serif' },
  { family: 'Sora', category: 'sans-serif' },
  { family: 'Albert Sans', category: 'sans-serif' },
  { family: 'Bricolage Grotesque', category: 'sans-serif' },
  { family: 'Noto Sans SC', category: 'sans-serif' },

  // Serif
  { family: 'Roboto Slab', category: 'serif' },
  { family: 'Merriweather', category: 'serif' },
  { family: 'Playfair Display', category: 'serif' },
  { family: 'Lora', category: 'serif' },
  { family: 'PT Serif', category: 'serif' },
  { family: 'Noto Serif', category: 'serif' },
  { family: 'Libre Baskerville', category: 'serif' },
  { family: 'EB Garamond', category: 'serif' },
  { family: 'Bitter', category: 'serif' },
  { family: 'Crimson Text', category: 'serif' },
  { family: 'Frank Ruhl Libre', category: 'serif' },
  { family: 'Source Serif 4', category: 'serif' },
  { family: 'DM Serif Display', category: 'serif' },
  { family: 'IBM Plex Serif', category: 'serif' },
  { family: 'Cormorant Garamond', category: 'serif' },
  { family: 'Vollkorn', category: 'serif' },
  { family: 'Spectral', category: 'serif' },

  // Monospace
  { family: 'Roboto Mono', category: 'monospace' },
  { family: 'Source Code Pro', category: 'monospace' },
  { family: 'Ubuntu Mono', category: 'monospace' },
  { family: 'IBM Plex Mono', category: 'monospace' },
  { family: 'Inconsolata', category: 'monospace' },
  { family: 'Fira Mono', category: 'monospace' },
  { family: 'Space Mono', category: 'monospace' },
  { family: 'JetBrains Mono', category: 'monospace' },
  { family: 'Anonymous Pro', category: 'monospace' },
  { family: 'Cousine', category: 'monospace' },

  // Display
  { family: 'Oswald', category: 'display' },
  { family: 'Bebas Neue', category: 'display' },
  { family: 'Abril Fatface', category: 'display' },
  { family: 'Lobster', category: 'display' },
  { family: 'Anton', category: 'display' },
  { family: 'Comfortaa', category: 'display' },
  { family: 'Righteous', category: 'display' },
  { family: 'Passion One', category: 'display' },
  { family: 'Bungee', category: 'display' },
  { family: 'Orbitron', category: 'display' },
  { family: 'Audiowide', category: 'display' },
  { family: 'Monoton', category: 'display' },

  // Handwriting
  { family: 'Pacifico', category: 'handwriting' },
  { family: 'Dancing Script', category: 'handwriting' },
  { family: 'Caveat', category: 'handwriting' },
  { family: 'Satisfy', category: 'handwriting' },
  { family: 'Permanent Marker', category: 'handwriting' },
  { family: 'Great Vibes', category: 'handwriting' },
  { family: 'Indie Flower', category: 'handwriting' },
  { family: 'Sacramento', category: 'handwriting' },
  { family: 'Kalam', category: 'handwriting' },
  { family: 'Patrick Hand', category: 'handwriting' },
] as const

// ---------------------------------------------------------------------------
// Font loading
// ---------------------------------------------------------------------------

/** Track which fonts have already been loaded to avoid duplicate <link> elements */
const _loadedFonts = new Set<string>()

/**
 * Load a Google Font by injecting a <link> element into <head>.
 * Uses the CSS2 API endpoint which requires no API key.
 *
 * The link loads weights 300-700 with display=swap for optimal rendering.
 * Duplicate calls for the same family are no-ops.
 */
export function loadGoogleFont(family: string): void {
  if (_loadedFonts.has(family)) return

  // Mark as loaded immediately to prevent duplicate calls during async loading
  _loadedFonts.add(family)

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700&display=swap`
  link.dataset.googleFont = family
  document.head.appendChild(link)
}

