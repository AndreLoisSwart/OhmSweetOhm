/**
 * Puts the cursor back in a field after its form's button was clicked.
 *
 * Clicking a button focuses it, and a button that becomes disabled (while saving, or
 * once the field is empty again) drops focus to the page, so the next entry would need
 * another click into the field. Only refocuses when focus was lost that way, never when
 * the user has since moved on to something else.
 */
export function refocusIfLost(field: HTMLElement | null, form: HTMLElement | null) {
  const active = document.activeElement
  const onButton = active instanceof HTMLButtonElement && (form?.contains(active) ?? false)
  const lost = !active || active === document.body || onButton
  if (field && lost) field.focus()
}
