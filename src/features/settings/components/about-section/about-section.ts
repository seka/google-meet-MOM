export function initializeAboutSection(): void {
  const appVersion = document.getElementById("app-version") as HTMLElement;
  appVersion.textContent = `${chrome.runtime.getManifest().version} (${__BUILD_ID__})`;
}
