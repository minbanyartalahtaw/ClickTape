(() => {
  if (window.__teachATask) return;
  window.__teachATask = true;

  const INTERACTIVE = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="option"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[contenteditable="true"]',
  ].join(',');

  let recording = false;
  let pending = null;

  chrome.storage.local.get('session').then(({ session }) => {
    recording = Boolean(session?.recording);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.session) {
      recording = Boolean(changes.session.newValue?.recording);
      if (!recording) pending = null;
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ping') sendResponse({ ok: true });
  });

  function send(step) {
    chrome.runtime.sendMessage({ type: 'step', step: { ...step, url: location.href } }).catch(() => {});
  }

  function pickTarget(event) {
    const path = event.composedPath().filter((n) => n instanceof Element);
    return path.find((el) => el.matches(INTERACTIVE)) || path[0];
  }

  function isTextField(el) {
    if (el.isContentEditable) return true;
    if (el.localName === 'textarea') return true;
    if (el.localName !== 'input') return false;
    return !['button', 'submit', 'checkbox', 'radio', 'file', 'image', 'reset', 'range', 'color'].includes(el.type);
  }

  function shortText(el) {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return text.length > 0 && text.length <= 60 ? text : '';
  }

  function labelOf(el) {
    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      shortText(el) ||
      el.getAttribute('name') ||
      el.localName
    ).trim();
  }

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node instanceof Element && parts.length < 6) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.localName;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.localName === node.localName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  function selectorsOf(el) {
    const list = [];
    if (el.id) list.push(`#${CSS.escape(el.id)}`);
    const aria = el.getAttribute('aria-label');
    if (aria) list.push(`aria/${aria}`);
    const name = el.getAttribute('name');
    if (name) list.push(`${el.localName}[name="${CSS.escape(name)}"]`);
    const text = shortText(el);
    if (text) list.push(`text/${text}`);
    list.push(cssPath(el));
    return [...new Set(list)];
  }

  function describe(el) {
    return { tag: el.localName, label: labelOf(el), selectors: selectorsOf(el) };
  }

  function valueOf(el) {
    return el.isContentEditable ? el.innerText : el.value;
  }

  function flush() {
    if (!pending) return;
    const { el, value } = pending;
    pending = null;
    send({ type: 'change', ...describe(el), value });
  }

  document.addEventListener(
    'input',
    (event) => {
      if (!recording) return;
      const el = pickTarget(event);
      if (!el || !isTextField(el) || el.type === 'password') return;
      pending = { el, value: valueOf(el) };
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      if (!recording) return;
      const el = pickTarget(event);
      if (!el || el.localName !== 'select') return;
      send({ type: 'change', ...describe(el), value: el.value });
    },
    true
  );

  document.addEventListener(
    'focusout',
    () => {
      if (recording) flush();
    },
    true
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!recording || event.key !== 'Enter') return;
      const el = pickTarget(event);
      if (!el || !isTextField(el)) return;
      flush();
      send({ type: 'keyDown', key: 'Enter', ...describe(el) });
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      if (!recording || !event.isTrusted) return;
      const el = pickTarget(event);
      if (!el) return;
      flush();
      send({ type: 'click', ...describe(el) });
    },
    true
  );
})();
