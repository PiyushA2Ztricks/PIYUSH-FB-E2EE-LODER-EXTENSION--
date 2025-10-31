// popup.js
const fileInput = document.getElementById('fileInput');
const msgsArea = document.getElementById('msgs');
const haterInput = document.getElementById('hater');
const delayInput = document.getElementById('delay');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const targetInput = document.getElementById('target');
const loopToggle = document.getElementById('loopToggle');
const logKey = document.getElementById('logKey');
const showLogsBtn = document.getElementById('showLogs');
const logArea = document.getElementById('logArea');

const LOG_KEY_PHRASE = 'PIYUSH'; // default; user can change if desired

// load saved settings
chrome.storage.local.get(['settings','logs'], (res) => {
  if (res.settings) {
    const s = res.settings;
    msgsArea.value = s.msgs || '';
    haterInput.value = s.hater || '';
    delayInput.value = s.delay || '2';
    targetInput.value = s.target || '';
    loopToggle.checked = s.loop !== false;
  }
  if (res.logs) {
    // keep logs in storage; not shown until key entered
  }
});

fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    msgsArea.value = reader.result;
  };
  reader.readAsText(f);
});

startBtn.addEventListener('click', async () => {
  const msgs = msgsArea.value.trim();
  if (!msgs) { alert('Paste or upload messages first'); return; }
  const settings = {
    msgs: msgs,
    hater: haterInput.value || '',
    delay: parseFloat(delayInput.value) || 2,
    target: targetInput.value || '',
    loop: loopToggle.checked
  };
  // save settings
  chrome.storage.local.set({settings});
  // send message to background to start
  chrome.runtime.sendMessage({cmd: 'start', settings});
  startBtn.disabled = true; stopBtn.disabled = false;
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({cmd: 'stop'});
  startBtn.disabled = false; stopBtn.disabled = true;
});

showLogsBtn.addEventListener('click', () => {
  const key = logKey.value || '';
  chrome.storage.local.get(['logs'], (res) => {
    const allLogs = res.logs || [];
    if (key === LOG_KEY_PHRASE) {
      logArea.style.display = 'block';
      logArea.textContent = allLogs.join('\n');
    } else {
      alert('Incorrect key to view logs');
    }
  });
});
