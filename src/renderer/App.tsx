import type { ReactElement } from "react";
import { ChatShellBridge } from "./components/bridges/ChatShellBridge";
import { RequestWorkbench } from "./components/network/RequestWorkbench";
import { ModalsBridge } from "./components/bridges/ModalsBridge";
import { NavChromeBridge } from "./components/bridges/NavChromeBridge";
import { SessionsPanelBridge } from "./components/bridges/SessionsPanelBridge";
import { SidePanelsBridge } from "./components/bridges/SidePanelsBridge";
import { ScreenshotLibraryBridge } from "./components/bridges/ScreenshotLibraryBridge";
import { TabsBridge } from "./components/bridges/TabsBridge";
import { ToastBridge } from "./components/bridges/ToastBridge";
import { ToolsHubBridge } from "./components/bridges/ToolsHubBridge";
import { WebviewShellBridge } from "./components/bridges/WebviewShellBridge";
import { AiChatBridge } from "./components/bridges/AiChatBridge";
import { BrowserSettingsSideBridge } from "./components/bridges/BrowserSettingsSideBridge";

export default function App(): ReactElement {
  return (
    <>
      <WebviewShellBridge />
      <BrowserSettingsSideBridge />
      <AiChatBridge />
      <TabsBridge />
      <NavChromeBridge />
      <ModalsBridge />
      <SessionsPanelBridge />
      <SidePanelsBridge />
      <ScreenshotLibraryBridge />
      <ChatShellBridge />
      <ToastBridge />
      <RequestWorkbench />
      <ToolsHubBridge />
    </>
  );
}