/** Copies text to the clipboard. The Clipboard API only exists on HTTPS pages, and HA is
 * often reached over plain HTTP, so fall back to the older copy command. */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    // A browser may sit on a permission prompt; don't leave the button doing nothing.
    const timeout = new Promise<never>((_, reject) => setTimeout(reject, 2000))
    try {
      await Promise.race([navigator.clipboard.writeText(text), timeout])
      return true
    } catch {
      // Fall through to the old way.
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } finally {
    area.remove()
  }
}
