# Configs generator

### Install dependencies

```
bun install
```

### Run a script

For example

```
bun defillama-tvl
```

The script will generate a `data/defillama-tvl.js`.

Copy the generated `defillama-tvl.js` file to the [`DefiLlama-Adapters`](https://github.com/symbiosis-finance/DefiLlama-Adapters/blob/main/projects/symbiosis-finance/config.js) repository.

### Onchain fees withdrawal (operator `claimTokens`)

```
bun onchain-fees
```

Collects the same fee collectors as https://explorer-private.symbiosis.finance/onchain
(legacy `LEGACY_FEE_COLLECTOR_ADDRESSES` + approvable on-chain router gateways from sdk-types),
skips the ones with zero native balance or not owned by a Safe, simulates
`claimTokens(feeRecipient)` from the owner Safe and writes `data/onchain-fees.txt`
(`network,safe,collector,feeRecipient`).

Copy it to `operator/claimTokens` in the [`operator`](https://github.com/symbiosis-finance/operator) repo, then run `./claimTokens.sh` and `./sign-all`.
