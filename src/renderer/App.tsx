import type { ReactElement } from "react";
import { ChatShellBridge } from "./components/ChatShellBridge";
import { RequestWorkbench } from "./components/network/RequestWorkbench";
import { ModalsBridge } from "./components/modals/ModalsBridge";
import { NavChromeBridge } from "./components/NavChromeBridge";
import { SidePanelsBridge } from "./components/SidePanelsBridge";
import { TabsBridge } from "./components/TabsBridge";
import { ToastBridge } from "./components/ToastBridge";
import { WebviewShellBridge } from "./components/WebviewShellBridge";

export default function App(): ReactElement {
  return (
    <>
      <WebviewShellBridge />
      <TabsBridge />
      <NavChromeBridge />
      <ModalsBridge />
      <SidePanelsBridge />
      <ChatShellBridge />
      <ToastBridge />
      <RequestWorkbench />
    </>
  );
}