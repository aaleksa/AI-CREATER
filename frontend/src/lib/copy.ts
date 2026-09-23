function copyWithExecCommand(value: string) {
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "-9999px";
  field.style.top = "0";
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, value.length);
  const ok = document.execCommand("copy");
  field.remove();
  return ok;
}

export async function copyText(text: string) {
  const value = text.trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Safari / permission prompt — fall through
  }
  try {
    return copyWithExecCommand(value);
  } catch {
    return false;
  }
}
