import '/node_modules/@shoelace-style/shoelace/dist/components/alert/alert.js';
import '/node_modules/@shoelace-style/shoelace/dist/components/button/button.js';
import '/node_modules/@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '/node_modules/@shoelace-style/shoelace/dist/components/drawer/drawer.js';

function toastStack() {
  let stack = document.querySelector('#opshub-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'opshub-toast-stack';
    stack.className = 'opshub-toast-stack';
    document.body.append(stack);
  }
  return stack;
}

function fallbackToast(message, variant) {
  const node = document.createElement('div');
  node.className = `opshub-fallback-toast ${variant}`;
  node.textContent = String(message);
  toastStack().append(node);
  window.setTimeout(() => node.remove(), 3200);
  return node;
}

export function showToast(message, variant = 'primary') {
  if (!customElements.get('sl-alert')) return fallbackToast(message, variant);
  const alert = document.createElement('sl-alert');
  alert.variant = variant;
  alert.closable = true;
  alert.duration = 3200;
  alert.textContent = String(message);
  toastStack().append(alert);
  alert.toast();
  return alert;
}

export function confirmAction({ title, message, confirmLabel = '确认', cancelLabel = '取消', variant = 'primary' }) {
  if (!customElements.get('sl-dialog')) return Promise.resolve(window.confirm([title, message, confirmLabel].join('\n\n')));

  const dialog = document.createElement('sl-dialog');
  dialog.label = title;
  const description = document.createElement('p');
  description.textContent = message;
  const footer = document.createElement('div');
  footer.slot = 'footer';
  const cancel = document.createElement('sl-button');
  cancel.textContent = cancelLabel;
  const confirm = document.createElement('sl-button');
  confirm.variant = variant;
  confirm.textContent = confirmLabel;
  footer.append(cancel, confirm);
  dialog.append(description, footer);
  document.body.append(dialog);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      dialog.hide();
    };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    dialog.addEventListener('sl-after-hide', () => {
      if (!settled) resolve(false);
      dialog.remove();
    }, { once: true });
    dialog.show();
  });
}

export async function withPending(button, task) {
  const wasDisabled = button?.disabled;
  if (button) {
    button.disabled = true;
    button.loading = true;
    button.setAttribute('aria-busy', 'true');
  }
  try {
    return await task();
  } finally {
    if (button) {
      button.disabled = Boolean(wasDisabled);
      button.loading = false;
      button.removeAttribute('aria-busy');
    }
  }
}
