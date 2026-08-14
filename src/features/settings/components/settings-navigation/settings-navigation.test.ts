import { beforeEach, describe, expect, it } from "vite-plus/test";
import { showSettingsScreen } from "./settings-navigation";

describe("showSettingsScreen", () => {
  let generalNav: HTMLButtonElement;
  let aboutNav: HTMLButtonElement;
  let generalScreen: HTMLElement;
  let aboutScreen: HTMLElement;
  let saveRow: HTMLElement;

  beforeEach(() => {
    generalNav = document.createElement("button");
    generalNav.dataset.screenTarget = "general";
    aboutNav = document.createElement("button");
    aboutNav.dataset.screenTarget = "about";
    generalScreen = document.createElement("section");
    generalScreen.dataset.screen = "general";
    aboutScreen = document.createElement("section");
    aboutScreen.dataset.screen = "about";
    saveRow = document.createElement("footer");
  });

  it("対象のナビゲーションと画面をactiveにする", () => {
    showSettingsScreen([generalNav, aboutNav], [generalScreen, aboutScreen], saveRow, "general");

    expect(generalNav.classList.contains("active")).toBe(true);
    expect(aboutNav.classList.contains("active")).toBe(false);
    expect(generalScreen.classList.contains("active")).toBe(true);
    expect(aboutScreen.classList.contains("active")).toBe(false);
  });

  it("about画面で保存行を非表示にする", () => {
    showSettingsScreen([generalNav, aboutNav], [generalScreen, aboutScreen], saveRow, "about");

    expect(saveRow.hidden).toBe(true);
  });
});
