const YOUTUBE = /^https:\/\/www\.youtube\.com\//;
const IDLE = { recording: false, tabId: null, steps: [] };

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.storage.local.set({ session: IDLE });
  const { skills } = await chrome.storage.local.get('skills');
  if (!skills) await chrome.storage.local.set({ skills: [] });
});

let queue = Promise.resolve();

function update(fn) {
  queue = queue.then(async () => {
    const { session = IDLE } = await chrome.storage.local.get('session');
    const next = fn(session);
    if (next) await chrome.storage.local.set({ session: next });
  });
  return queue;
}

function addStep(tabId, step) {
  return update((session) => {
    if (!session.recording || session.tabId !== tabId) return null;
    const last = session.steps[session.steps.length - 1];
    if (step.type === 'navigate' && last?.type === 'navigate' && last.url === step.url) return null;
    return { ...session, steps: [...session.steps, { ...step, time: Date.now() }] };
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ping' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
}

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !YOUTUBE.test(tab.url || '')) {
    return { ok: false, error: 'Open https://www.youtube.com in the active tab first.' };
  }
  await ensureContentScript(tab.id);
  await update(() => ({
    recording: true,
    tabId: tab.id,
    steps: [{ type: 'navigate', url: tab.url, time: Date.now() }],
  }));
  return { ok: true };
}

async function stop(name) {
  await queue;
  const { session = IDLE, skills = [] } = await chrome.storage.local.get(['session', 'skills']);
  if (!session.recording) return { ok: false, error: 'Not recording.' };
  const skill = {
    id: crypto.randomUUID(),
    name: name?.trim() || `Skill ${skills.length + 1}`,
    createdAt: Date.now(),
    steps: session.steps,
  };
  await chrome.storage.local.set({ session: IDLE, skills: [...skills, skill] });
  return { ok: true, skill };
}

async function discard() {
  await update(() => IDLE);
  return { ok: true };
}

async function removeSkill(id) {
  const { skills = [] } = await chrome.storage.local.get('skills');
  await chrome.storage.local.set({ skills: skills.filter((s) => s.id !== id) });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    start: () => start(),
    stop: () => stop(msg.name),
    discard: () => discard(),
    removeSkill: () => removeSkill(msg.id),
    step: () => addStep(sender.tab?.id, msg.step).then(() => ({ ok: true })),
  };
  const handler = handlers[msg.type];
  if (!handler) return false;
  handler().then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && YOUTUBE.test(changeInfo.url)) {
    addStep(tabId, { type: 'navigate', url: changeInfo.url });
  }
});
