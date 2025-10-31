// background.js
let running = false;
let currentIndex = 0;
let messages = [];
let settingsGlobal = null;
let alarmName = 'piyush-sender-alarm';

// helper: append log to storage
async function pushLog(line) {
  const now = new Date().toLocaleString();
  const entry = `[${now}] ${line}`;
  const obj = await chrome.storage.local.get('logs');
  const list = obj.logs || [];
  list.unshift(entry); // newest first
  // limit logs to 500 entries
  if (list.length > 500) list.length = 500;
  await chrome.storage.local.set({logs: list});
}

// start flow
chrome.runtime.onMessage.addListener((msg, sender, resp) => {
  if (msg.cmd === 'start') {
    if (running) {
      pushLog('Start called but already running');
      return;
    }
    settingsGlobal = msg.settings;
    // split messages by newline or comma
    messages = settingsGlobal.msgs.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
    currentIndex = 0;
    running = true;
    pushLog('Started message sender. Total messages: ' + messages.length);
    // set alarm trigger right away
    chrome.alarms.create(alarmName, {when: Date.now(), periodInMinutes: Math.max(0.016, settingsGlobal.delay/60)});
  } else if (msg.cmd === 'stop') {
    running = false;
    chrome.alarms.clear(alarmName);
    pushLog('Stopped by user');
  }
});

// Alarm handler: try to run one message per alarm tick
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!running || alarm.name !== alarmName) return;
  if (!settingsGlobal || messages.length === 0) {
    pushLog('No messages or settings; stopping');
    running = false;
    chrome.alarms.clear(alarmName);
    return;
  }

  // prepare message
  const raw = messages[currentIndex % messages.length];
  const full = (settingsGlobal.hater ? settingsGlobal.hater + ' ' : '') + raw;

  // execute content script on active facebook tab(s)
  try {
    // find an active tab on facebook or m.facebook, prefer activeTab
    const tabs = await chrome.tabs.query({url: ["*://*.facebook.com/*","*://*.m.facebook.com/*"]});
    if (!tabs || tabs.length === 0) {
      await pushLog('No Facebook tab found. Message skipped: ' + full);
    } else {
      // choose one tab (prefer focused)
      let tab = tabs.find(t => t.active) || tabs[0];
      // inject content script and send message
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (message) => {
          // this function runs in the page context (content script)
          function findComposer() {
            // attempt several selectors for messenger composer (mobile/desktop)
            let selCandidates = [
              '[contenteditable="true"][role="textbox"]',
              '[contenteditable="true"]',
              'textarea[aria-label*="Message"]',
              'textarea',
              'div[aria-label="Send a message"]'
            ];
            for (const s of selCandidates) {
              const el = document.querySelector(s);
              if (el) return el;
            }
            return null;
          }

          function sendViaComposer(comp, text) {
            // set focus and paste
            comp.focus();
            // for contenteditable
            if (comp.isContentEditable) {
              // try to use document.execCommand('insertText') for compatibility
              const range = document.createRange();
              range.selectNodeContents(comp);
              range.collapse(false);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('insertText', false, text);
              // simulate Enter
              const evt = new KeyboardEvent('keydown', {key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true});
              comp.dispatchEvent(evt);
              return true;
            } else {
              // textarea -> set value + dispatch input + press Enter
              comp.value = text;
              comp.dispatchEvent(new Event('input', {bubbles:true}));
              const evt = new KeyboardEvent('keydown', {key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true});
              comp.dispatchEvent(evt);
              return true;
            }
          }

          const composer = findComposer();
          if (!composer) {
            return {ok:false, error:'Composer not found'};
          }
          const res = sendViaComposer(composer, message);
          return {ok:!!res};
        },
        args: [full]
      });

      await pushLog('Message dispatched: ' + full);
    }
  } catch (e) {
    await pushLog('Error dispatching message: ' + e.toString());
  }

  currentIndex++;
  if (!settingsGlobal.loop && currentIndex >= messages.length) {
    running = false;
    chrome.alarms.clear(alarmName);
    await pushLog('Completed all messages (auto-stop).');
  }
});
