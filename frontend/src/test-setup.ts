import '@testing-library/jest-dom'

function installStorageShim(name: 'localStorage' | 'sessionStorage') {
  const current = window[name]
  if (
    current &&
    typeof current.clear === 'function' &&
    typeof current.getItem === 'function' &&
    typeof current.setItem === 'function' &&
    typeof current.removeItem === 'function'
  ) {
    return
  }

  const values = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, String(value))
    },
  }

  Object.defineProperty(window, name, {
    configurable: true,
    value: storage,
  })
}

installStorageShim('localStorage')
installStorageShim('sessionStorage')
