import { type ReactElement } from "react";
import { AiChatBridge } from "./components/bridges/AiChatBridge";
import { ChatShellBridge } from "./components/bridges/ChatShellBridge";
import { ModalsBridge } from "./components/bridges/ModalsBridge";
import { NavChromeBridge } from "./components/bridges/NavChromeBridge";
import { RequestWorkbench } from "./components/network/RequestWorkbench";
import { ScreenshotLibraryBridge } from "./components/bridges/ScreenshotLibraryBridge";
import { SessionsPanelBridge } from "./components/bridges/SessionsPanelBridge";
import { SidePanelsBridge } from "./components/bridges/SidePanelsBridge";
import { TabsBridge } from "./components/bridges/TabsBridge";
import { ToastBridge } from "./components/bridges/ToastBridge";
import { ToolsHubBridge } from "./components/bridges/ToolsHubBridge";
import { WebviewShellBridge } from "./components/bridges/WebviewShellBridge";
import { BrowserSettingsSideBridge } from "./components/bridges/BrowserSettingsSideBridge";
import { A2aInboundBridge } from "./components/bridges/A2aInboundBridge";

export default function App(): ReactElement {
  return (
    <>
      <A2aInboundBridge />
      <WebviewShellBridge />
      <BrowserSettingsSideBridge />
      <TabsBridge />
      <NavChromeBridge />
      <SessionsPanelBridge />
      <SidePanelsBridge />
      <ChatShellBridge />
      <ToastBridge />
      <AiChatBridge />
      <ModalsBridge />
      <ScreenshotLibraryBridge />
      <RequestWorkbench />
      <ToolsHubBridge />
    </>
  );
}