import { ConnectButton } from "@rainbow-me/rainbowkit";
import "../styles/Header.css";

export function Header() {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">VV</div>
        <div>
          <p className="brand-title">VeilVault</p>
          <p className="brand-subtitle">Confidential cZama staking vault</p>
        </div>
      </div>
      <div className="header-actions">
        <ConnectButton />
      </div>
    </header>
  );
}
