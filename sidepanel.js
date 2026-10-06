const $ = (id) => document.getElementById(id);

function summarize(step) {
  switch (step.type) {
    case 'navigate': {
      const url = new URL(step.url);
      return `open ${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
    }
    case 'click':
      return `click "${step.label}"`;
    case 'change':
      return `type "${step.value}" into "${step.label}"`;
    case 'keyDown':
      return `press ${step.key}`;
    default:
      return step.type;
  }
}

function showError(message) {
  $('error').textContent = message || '';
  $('error').hidden = !message;
}

function renderSession(session) {
  const recording = Boolean(session?.recording);
  const steps = session?.steps || [];
  $('status').textContent = recording ? 'Rec' : 'Idle';
  $('status').classList.toggle('on', recording);
  $('count').textContent = String(steps.length).padStart(3, '0');
  $('record').disabled = recording;
  $('stop').disabled = !recording;
  $('discard').disabled = !recording;
  if (!steps.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = recording ? 'Waiting for input…' : 'Press Rec on a YouTube tab';
    $('steps').replaceChildren(li);
    return;
  }
  $('steps').replaceChildren(
    ...steps.map((step) => {
      const li = document.createElement('li');
      li.textContent = summarize(step);
      return li;
    })
  );
}

function download(skill) {
  const blob = new Blob([JSON.stringify(skill, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${skill.name.replace(/[^\w-]+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderSkills(skills) {
  if (!skills?.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No skills saved';
    $('skills').replaceChildren(li);
    return;
  }
  $('skills').replaceChildren(
    ...(skills || [])
      .slice()
      .reverse()
      .map((skill) => {
        const li = document.createElement('li');

        const head = document.createElement('div');
        head.className = 'skill-head';
        const title = document.createElement('strong');
        title.textContent = skill.name;
        const actions = document.createElement('span');
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export';
        exportBtn.onclick = () => download(skill);
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => chrome.runtime.sendMessage({ type: 'removeSkill', id: skill.id });
        actions.append(exportBtn, deleteBtn);
        head.append(title, actions);

        const flow = document.createElement('p');
        flow.className = 'flow';
        flow.textContent = skill.steps.map(summarize).join(' → ');

        li.append(head, flow);
        return li;
      })
  );
}

$('record').onclick = async () => {
  showError();
  const res = await chrome.runtime.sendMessage({ type: 'start' });
  if (!res?.ok) showError(res?.error);
};

$('stop').onclick = async () => {
  showError();
  const res = await chrome.runtime.sendMessage({ type: 'stop', name: $('name').value });
  if (res?.ok) $('name').value = '';
  else showError(res?.error);
};

$('discard').onclick = () => {
  showError();
  chrome.runtime.sendMessage({ type: 'discard' });
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.session) renderSession(changes.session.newValue);
  if (changes.skills) renderSkills(changes.skills.newValue);
});

chrome.storage.local.get(['session', 'skills']).then(({ session, skills }) => {
  renderSession(session);
  renderSkills(skills);
});
