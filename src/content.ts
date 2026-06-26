function getMeetingTitle(): string {
  const selectors = [
    '[data-meeting-title]',
    'c-wiz [jsname="r4nke"]',
    '[jsname="ZaFQO"]',
  ]

  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }

  return document.title.replace(' - Google Meet', '').trim() || 'Google Meet'
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_MEETING_TITLE') {
    sendResponse({ title: getMeetingTitle() })
  }
  return false
})
