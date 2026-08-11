export function showSettingsScreen(
  navItems: HTMLButtonElement[],
  screens: HTMLElement[],
  saveRow: HTMLElement,
  screenName: string,
): void {
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.screenTarget === screenName);
  });
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === screenName);
  });
  saveRow.hidden = screenName === "about";
}

export function initializeSettingsNavigation(): void {
  const navItems = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-screen-target]"));
  const screens = Array.from(document.querySelectorAll<HTMLElement>("[data-screen]"));
  const saveRow = document.getElementById("save-row") as HTMLElement;

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      showSettingsScreen(navItems, screens, saveRow, item.dataset.screenTarget ?? "general");
    });
  });
}
