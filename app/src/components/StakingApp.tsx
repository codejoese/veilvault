import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Contract, formatUnits, parseUnits } from "ethers";
import { isAddress } from "viem";

import { Header } from "./Header";
import { publicClient } from "../config/viem";
import {
  STAKING_ABI,
  STAKING_ADDRESS,
  TOKEN_ABI,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
} from "../config/contracts";
import { useZamaInstance } from "../hooks/useZamaInstance";
import { useEthersSigner } from "../hooks/useEthersSigner";
import "../styles/StakingApp.css";

const MAX_UINT64 = (1n << 64n) - 1n;

export function StakingApp() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [amount, setAmount] = useState("");
  const [lockDays, setLockDays] = useState("7");
  const [statusMessage, setStatusMessage] = useState("");

  const [balanceHandle, setBalanceHandle] = useState<string | null>(null);
  const [stakeHandle, setStakeHandle] = useState<string | null>(null);
  const [unlockTime, setUnlockTime] = useState<number | null>(null);
  const [hasStake, setHasStake] = useState(false);
  const [isOperator, setIsOperator] = useState(false);

  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);
  const [decryptedStake, setDecryptedStake] = useState<string | null>(null);
  const [isDecryptingBalance, setIsDecryptingBalance] = useState(false);
  const [isDecryptingStake, setIsDecryptingStake] = useState(false);

  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  const tokenAddress = TOKEN_ADDRESS as `0x${string}`;
  const stakingAddress = STAKING_ADDRESS as `0x${string}`;

  const isConfigured = useMemo(() => {
    return (
      isAddress(TOKEN_ADDRESS) &&
      isAddress(STAKING_ADDRESS)
    );
  }, []);

  useEffect(() => {
    if (!hasStake) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hasStake]);

  useEffect(() => {
    if (!address || !isConfigured) {
      setBalanceHandle(null);
      setStakeHandle(null);
      setUnlockTime(null);
      setHasStake(false);
      setIsOperator(false);
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const [balance, stake, operator] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress,
            abi: TOKEN_ABI,
            functionName: "confidentialBalanceOf",
            args: [address],
          }),
          publicClient.readContract({
            address: stakingAddress,
            abi: STAKING_ABI,
            functionName: "getStake",
            args: [address],
          }),
          publicClient.readContract({
            address: tokenAddress,
            abi: TOKEN_ABI,
            functionName: "isOperator",
            args: [address, stakingAddress],
          }),
        ]);

        if (!mounted) {
          return;
        }

        const stakeTuple = stake as readonly [string, bigint, boolean];
        setBalanceHandle(balance as string);
        setStakeHandle(stakeTuple[0]);
        setUnlockTime(Number(stakeTuple[1]));
        setHasStake(stakeTuple[2]);
        setIsOperator(Boolean(operator));
      } catch (error) {
        console.error("Failed to load staking data:", error);
      }
    };

    load();
    setDecryptedBalance(null);
    setDecryptedStake(null);

    return () => {
      mounted = false;
    };
  }, [address, isConfigured, refreshKey]);

  const refresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const decryptHandle = async (handle: string, contractAddress: string) => {
    if (!instance || !address || !signerPromise) {
      throw new Error("Missing encryption context");
    }

    const keypair = instance.generateKeypair();
    const handleContractPairs = [
      {
        handle,
        contractAddress,
      },
    ];
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = "7";
    const contractAddresses = [contractAddress];

    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signer = await signerPromise;
    if (!signer) {
      throw new Error("Signer not available");
    }

    const signature = await signer.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );

    const result = await instance.userDecrypt(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace("0x", ""),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );

    const clearValue = result[handle] ?? "0";
    return formatUnits(BigInt(clearValue), TOKEN_DECIMALS);
  };

  const handleDecryptBalance = async () => {
    if (!balanceHandle) {
      return;
    }
    setIsDecryptingBalance(true);
    try {
      const clearValue = await decryptHandle(balanceHandle, tokenAddress);
      setDecryptedBalance(clearValue);
    } catch (error) {
      console.error("Failed to decrypt balance:", error);
      setStatusMessage("Balance decryption failed.");
    } finally {
      setIsDecryptingBalance(false);
    }
  };

  const handleDecryptStake = async () => {
    if (!stakeHandle) {
      return;
    }
    setIsDecryptingStake(true);
    try {
      const clearValue = await decryptHandle(stakeHandle, stakingAddress);
      setDecryptedStake(clearValue);
    } catch (error) {
      console.error("Failed to decrypt stake:", error);
      setStatusMessage("Stake decryption failed.");
    } finally {
      setIsDecryptingStake(false);
    }
  };

  const handleAuthorize = async () => {
    if (!signerPromise) {
      setStatusMessage("Connect your wallet to authorize.");
      return;
    }

    setIsAuthorizing(true);
    setStatusMessage("");
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer not available");
      }

      const token = new Contract(tokenAddress, TOKEN_ABI, signer);
      const operatorUntil = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      const tx = await token.setOperator(stakingAddress, operatorUntil);
      await tx.wait();
      setStatusMessage("Operator authorization confirmed.");
      refresh();
    } catch (error) {
      console.error("Authorization failed:", error);
      setStatusMessage("Operator authorization failed.");
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleStake = async () => {
    if (!instance || !address || !signerPromise) {
      setStatusMessage("Connect your wallet and unlock the relayer.");
      return;
    }

    setIsStaking(true);
    setStatusMessage("");
    try {
      const parsedAmount = parseUnits(amount || "0", TOKEN_DECIMALS);
      if (parsedAmount <= 0n) {
        throw new Error("Enter a positive amount.");
      }
      if (parsedAmount > MAX_UINT64) {
        throw new Error("Amount is too large for encrypted input.");
      }

      const lockValue = Number(lockDays);
      if (!Number.isFinite(lockValue) || lockValue <= 0) {
        throw new Error("Lock duration must be positive.");
      }

      const lockSeconds = Math.floor(lockValue * 24 * 60 * 60);

      const input = instance.createEncryptedInput(tokenAddress, address);
      input.add64(parsedAmount);
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer not available");
      }

      const staking = new Contract(stakingAddress, STAKING_ABI, signer);
      const tx = await staking.stake(encryptedInput.handles[0], encryptedInput.inputProof, lockSeconds);
      await tx.wait();
      setStatusMessage("Stake confirmed on-chain.");
      setAmount("");
      refresh();
    } catch (error) {
      console.error("Stake failed:", error);
      setStatusMessage(
        error instanceof Error ? error.message : "Stake failed. Please review your inputs.",
      );
    } finally {
      setIsStaking(false);
    }
  };

  const handleWithdraw = async () => {
    if (!signerPromise) {
      setStatusMessage("Connect your wallet to withdraw.");
      return;
    }

    setIsWithdrawing(true);
    setStatusMessage("");
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer not available");
      }

      const staking = new Contract(stakingAddress, STAKING_ABI, signer);
      const tx = await staking.withdraw();
      await tx.wait();
      setStatusMessage("Withdrawal confirmed.");
      refresh();
    } catch (error) {
      console.error("Withdraw failed:", error);
      setStatusMessage("Withdrawal failed. Check the unlock time.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleMint = async () => {
    if (!signerPromise || !address) {
      setStatusMessage("Connect your wallet to mint.");
      return;
    }

    setIsMinting(true);
    setStatusMessage("");
    try {
      const parsedAmount = parseUnits(amount || "0", TOKEN_DECIMALS);
      if (parsedAmount <= 0n) {
        throw new Error("Enter a positive amount to mint.");
      }
      if (parsedAmount > MAX_UINT64) {
        throw new Error("Amount is too large for minting.");
      }

      const signer = await signerPromise;
      if (!signer) {
        throw new Error("Signer not available");
      }

      const token = new Contract(tokenAddress, TOKEN_ABI, signer);
      const tx = await token.mint(address, parsedAmount);
      await tx.wait();
      setStatusMessage("Mint confirmed.");
      refresh();
    } catch (error) {
      console.error("Mint failed:", error);
      setStatusMessage(error instanceof Error ? error.message : "Mint failed.");
    } finally {
      setIsMinting(false);
    }
  };

  const unlockDate = unlockTime ? new Date(unlockTime * 1000) : null;
  const timeRemaining = unlockTime
    ? Math.max(0, unlockTime * 1000 - now)
    : 0;
  const remainingHours = Math.floor(timeRemaining / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <section className="hero">
          <div className="hero-card">
            <p className="hero-eyebrow">Sepolia Confidential Vault</p>
            <h1>Stake cZama with encrypted positions and timed exits.</h1>
            <p className="hero-description">
              VeilVault stores your stake amount as encrypted ciphertext on-chain, while you control
              when it can be unlocked.
            </p>
            <div className="hero-pill-row">
              <div className="hero-pill">Encrypted balances</div>
              <div className="hero-pill">Time-locked withdrawals</div>
              <div className="hero-pill">Relayer-backed decrypt</div>
            </div>
          </div>
          <div className="hero-metrics">
            <div className="metric-card">
              <p className="metric-label">Wallet</p>
              <p className="metric-value">
                {isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Operator Status</p>
              <p className={`metric-value ${isOperator ? "status-good" : "status-warn"}`}>
                {isOperator ? "Authorized" : "Not authorized"}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Relayer</p>
              <p className={`metric-value ${zamaError ? "status-warn" : "status-good"}`}>
                {zamaLoading ? "Connecting" : zamaError ? "Unavailable" : "Ready"}
              </p>
            </div>
          </div>
        </section>

        {!isConfigured && (
          <section className="panel warning-panel">
            <h2>Configure contracts</h2>
            <p>
              Update <code>app/src/config/contracts.ts</code> with the deployed Sepolia addresses
              before using the vault.
            </p>
          </section>
        )}

        <section className="panel-grid">
          <div className="panel">
            <h2>Stake and lock</h2>
            <p className="panel-subtitle">
              Approve the vault, then stake an encrypted amount with a custom lock window.
            </p>

            <label className="field-label" htmlFor="amount">
              Amount ({TOKEN_SYMBOL})
            </label>
            <input
              id="amount"
              className="field-input"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
            />

            <label className="field-label" htmlFor="lockDays">
              Lock duration (days)
            </label>
            <input
              id="lockDays"
              className="field-input"
              placeholder="7"
              value={lockDays}
              onChange={(event) => setLockDays(event.target.value)}
              inputMode="decimal"
            />

            <div className="button-row">
              <button
                className="button secondary"
                onClick={handleAuthorize}
                disabled={!isConnected || !isConfigured || isAuthorizing}
              >
                {isAuthorizing ? "Authorizing..." : "Authorize vault"}
              </button>
              <button
                className="button primary"
                onClick={handleStake}
                disabled={!isConnected || !isConfigured || isStaking || !isOperator}
              >
                {isStaking ? "Staking..." : "Stake now"}
              </button>
            </div>
            <button
              className="button ghost"
              onClick={handleMint}
              disabled={!isConnected || !isConfigured || isMinting}
            >
              {isMinting ? "Minting..." : "Mint test cZama"}
            </button>
          </div>

          <div className="panel">
            <h2>Position snapshot</h2>
            <p className="panel-subtitle">Decrypt your balance and stake only when you choose.</p>

            <div className="data-row">
              <div>
                <p className="data-label">Encrypted balance</p>
                <p className="data-value mono">{balanceHandle ?? "—"}</p>
                {decryptedBalance && (
                  <p className="data-clear">
                    {decryptedBalance} {TOKEN_SYMBOL}
                  </p>
                )}
              </div>
              <button
                className="button small"
                onClick={handleDecryptBalance}
                disabled={!isConnected || !balanceHandle || isDecryptingBalance}
              >
                {isDecryptingBalance ? "Decrypting..." : "Decrypt"}
              </button>
            </div>

            <div className="data-row">
              <div>
                <p className="data-label">Encrypted stake</p>
                <p className="data-value mono">{stakeHandle ?? "—"}</p>
                {decryptedStake && (
                  <p className="data-clear">
                    {decryptedStake} {TOKEN_SYMBOL}
                  </p>
                )}
              </div>
              <button
                className="button small"
                onClick={handleDecryptStake}
                disabled={!isConnected || !stakeHandle || isDecryptingStake || !hasStake}
              >
                {isDecryptingStake ? "Decrypting..." : "Decrypt"}
              </button>
            </div>

            <div className="data-row">
              <div>
                <p className="data-label">Unlock time</p>
                <p className="data-value">
                  {unlockDate ? unlockDate.toLocaleString() : "—"}
                </p>
                {hasStake && (
                  <p className="data-clear">
                    {remainingHours}h {remainingMinutes}m remaining
                  </p>
                )}
              </div>
              <button
                className="button primary"
                onClick={handleWithdraw}
                disabled={!isConnected || !isConfigured || isWithdrawing || !hasStake}
              >
                {isWithdrawing ? "Withdrawing..." : "Withdraw"}
              </button>
            </div>
          </div>
        </section>

        <section className="panel status-panel">
          <h2>Vault status</h2>
          <div className="status-grid">
            <div>
              <p className="status-label">Stake active</p>
              <p className="status-value">{hasStake ? "Yes" : "No"}</p>
            </div>
            <div>
              <p className="status-label">Lock window</p>
              <p className="status-value">
                {unlockTime ? `${Math.max(0, unlockTime - Math.floor(now / 1000))}s` : "—"}
              </p>
            </div>
            <div>
              <p className="status-label">Token</p>
              <p className="status-value">{TOKEN_SYMBOL}</p>
            </div>
          </div>
          <p className="status-message">{statusMessage || "Awaiting your next move."}</p>
        </section>
      </main>
    </div>
  );
}
