import { initializeAboutSection } from "../about-section/about-section";
import { initializeConnectionTest } from "../connection-test/connection-test";
import { initializeSettingsForm } from "../settings-form/settings-form";
import { initializeSettingsNavigation } from "../settings-navigation/settings-navigation";

export function initializeSettingsPage(): void {
  initializeSettingsNavigation();
  initializeSettingsForm();
  initializeConnectionTest();
  initializeAboutSection();
}
