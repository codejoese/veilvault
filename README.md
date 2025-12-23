# VeilVault

VeilVault is a confidential, time-locked staking vault for cZama built on Zama FHEVM.
It encrypts stake amounts on-chain while enforcing unlock schedules through smart
contracts, so users can stake privately and withdraw only after the chosen lock time.

## Overview

VeilVault focuses on three core capabilities:
- Stake cZama while keeping the staked amount encrypted.
- Choose a lock time for each stake.
- Withdraw after the lock has expired, with on-chain enforcement.

## Problems This Project Solves

- **Public staking amounts**: Traditional staking exposes balances and behavior
  to anyone on-chain, enabling profiling and unwanted attention.
- **Privacy vs. trust trade-offs**: Many private staking systems require trusted
  custodians or off-chain bookkeeping.
- **Time-lock enforcement**: Centralized systems can override lock rules or delay
  withdrawals; VeilVault enforces them on-chain.

## Advantages

- **Confidential amounts**: Stake sizes are encrypted via FHE, not simply hidden
  in UI or obfuscated off-chain.
- **Non-custodial control**: Users keep control of their wallets and permissions.
- **Deterministic unlock rules**: The unlock time is enforced by smart contracts.
- **Transparent logic**: The code paths are auditable even though amounts are
  encrypted.
- **Clear separation of read/write**: Frontend reads use `viem` and writes use
  `ethers` to keep responsibilities explicit.

## Key Features

- Confidential staking of cZama with encrypted amounts.
- Time-locked positions with clear unlock conditions.
- Withdrawal only after the lock time is reached.
- Frontend integration with the Zama relayer SDK for encrypted data flows.

## How It Works (Staking Lifecycle)

1. User connects a wallet in the frontend.
2. The user approves cZama for staking.
3. The frontend encrypts the stake amount and submits the stake transaction.
4. The staking contract stores the encrypted amount and unlock time.
5. After the unlock time is reached, the user withdraws the stake.

## Tech Stack

- **Smart contracts**: Solidity + Hardhat + FHEVM
- **Confidential primitives**: `@fhevm/solidity`, `@openzeppelin/confidential-contracts`
- **Frontend**: React + Vite + wagmi + RainbowKit
- **Read access**: `viem`
- **Write access**: `ethers`
- **Relayer**: Zama relayer SDK for encrypted reads
- **Package manager**: npm
- **Styling**: handcrafted CSS (no Tailwind)

## Repository Layout

```
contracts/          Smart contracts
deploy/             Deployment scripts
tasks/              Hardhat tasks
test/               Contract tests
app/                Frontend (React + Vite)
docs/               Zama references used by the project
```

## Development Workflow

### Prerequisites

- Node.js >= 20
- npm >= 7

### Install Dependencies

```bash
# Root (contracts)
npm install

# Frontend
cd app
npm install
```

### Compile and Test Contracts

```bash
npm run compile
npm run test
```

### Local Node and Deployment

```bash
# Start a local FHEVM-ready node
npm run chain

# Deploy to the local network
npm run deploy:localhost
```

### Sepolia Deployment

The required order is: run tasks and tests, then deploy to Sepolia using a private
key (no mnemonic).

```bash
# Run tests and any required tasks first
npm run test

# Deploy to Sepolia
npm run deploy:sepolia
```

### Contract Verification (Optional)

```bash
# Example (provide the deployed address as the argument)
npm run verify:sepolia -- <CONTRACT_ADDRESS>
```

### Frontend Development

```bash
cd app
npm run dev
```

The Vite dev server prints the local URL in the terminal. The frontend is designed
to avoid local storage and does not rely on frontend environment variables.

## Configuration

Create a `.env` file for contract deployment only:

```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=your_etherscan_key
```

Do not use a mnemonic. The frontend does not read environment variables.

## ABI Source of Truth

Frontend ABIs must be copied from the contract deployment output:

- `deployments/sepolia`

This avoids drift between on-chain deployments and the UI.

## Scripts (Root)

```text
npm run clean
npm run compile
npm run coverage
npm run lint
npm run test
npm run test:sepolia
npm run chain
npm run deploy:localhost
npm run deploy:sepolia
npm run verify:sepolia -- <CONTRACT_ADDRESS>
```

## Frontend Constraints

- No Tailwind usage.
- No frontend environment variables.
- No JSON files in the frontend codebase.
- No local storage usage in the frontend.
- No hardcoded local network endpoints.

## Documentation References

- `docs/zama_llm.md`
- `docs/zama_doc_relayer.md`

## Security and Privacy Notes

- FHE protects stake amounts, but transaction metadata is still visible on-chain.
- This is a testnet-focused build; use caution before mainnet usage.
- No formal security audit has been completed yet.

## Future Plans

- Support multiple concurrent staking positions per user.
- Partial withdrawals after the unlock time.
- Configurable reward curves and incentives.
- Expanded network support beyond Sepolia.
- UX improvements for encrypted balance visibility.
- Security audit and formal verification roadmap.

## License

BSD-3-Clause-Clear. See `LICENSE`.
