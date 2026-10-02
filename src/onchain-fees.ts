import {
  ChainId,
  GAS_TOKEN,
  getOnchainSwapRouter,
  isEvmChainId,
  LEGACY_FEE_COLLECTOR_ADDRESSES,
  Symbiosis,
} from '@symbiosis-finance/sdk-types';
import fs from 'fs';
import { BigNumber, Contract, providers, utils } from 'ethers';
import { CHAINS_OPERATOR } from './constants';

// Prepares the `claimTokens` input for the operator repo: withdraws native onchain fees
// from the same collectors that https://explorer-private.symbiosis.finance/onchain shows.
// Line format: network,safe,collector,feeRecipient
const symbiosis = new Symbiosis('mainnet', 'fees');

const feeRecipient = '0x7c5d5222f60853159bbDCc058088587618D61B24';

const OUT_PATH = 'data/onchain-fees.txt';

const COLLECTOR_ABI = [
  'function owner() view returns (address)',
  'function claimTokens(address _to)',
];
const SAFE_ABI = ['function getThreshold() view returns (uint256)'];

type FeeSource = 'legacy' | 'approvable';

type Collector = {
  chainId: ChainId;
  address: string;
  source: FeeSource;
};

type Claim = Collector & {
  network: string;
  safe: string;
  balance: BigNumber;
};

// Same set as getFeeCollectorEntries() in explorer-private (src/pages/onchainFee/OnchainFee.tsx)
function getCollectors(): Collector[] {
  const collectors: Collector[] = [];

  Object.entries(LEGACY_FEE_COLLECTOR_ADDRESSES).forEach(([key, address]) => {
    if (address) {
      collectors.push({ chainId: +key, address, source: 'legacy' });
    }
  });

  symbiosis.chains().forEach((chain) => {
    const router = getOnchainSwapRouter(chain.id);
    if (router) {
      collectors.push({
        chainId: chain.id,
        address: router.gateway,
        source: 'approvable',
      });
    }
  });

  return collectors;
}

type LoadResult = { claim?: Claim; notSafe?: string };

async function loadClaim(collector: Collector): Promise<LoadResult> {
  const { chainId, source } = collector;
  const label = `${ChainId[chainId]} ${source}`;

  if (!isEvmChainId(chainId)) {
    console.log(`${label}: skip, not an EVM chain`);
    return {};
  }
  const network = CHAINS_OPERATOR[chainId];
  if (!network) {
    throw new Error(`${label}: no operator network name`);
  }

  const address = utils.getAddress(collector.address.toLowerCase());
  const provider = new providers.StaticJsonRpcProvider(
    symbiosis.chainConfig(chainId).rpc,
    chainId,
  );
  const contract = new Contract(address, COLLECTOR_ABI, provider);

  const [balance, owner] = await Promise.all([
    provider.getBalance(address),
    contract.owner() as Promise<string>,
  ]);

  const amount = `${utils.formatEther(balance)} ${GAS_TOKEN[chainId]?.symbol ?? ''}`;

  // proposals go through the Safe that owns the collector; checked regardless of
  // the balance so collectors that can't be claimed via operator are always visible
  const threshold = await new Contract(owner, SAFE_ABI, provider)
    .getThreshold()
    .catch(() => undefined);
  if (!threshold) {
    console.warn(`${label}: skip ${amount}, owner is not a Safe`);
    return {
      notSafe: `${label} ${address}: owner ${owner}, balance ${amount}`,
    };
  }

  if (balance.lte(0)) {
    console.log(`${label}: skip, zero balance`);
    return {};
  }

  // the Safe tx would revert otherwise
  await contract.callStatic.claimTokens!(feeRecipient, { from: owner });

  console.log(`${label}: ${amount}`);

  return { claim: { ...collector, address, network, safe: owner, balance } };
}

async function main() {
  const collectors = getCollectors();
  const results = await Promise.allSettled(collectors.map(loadClaim));

  const claims: Claim[] = [];
  const notSafe: string[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const { chainId, source, address } = collectors[index]!;
      errors.push(
        `${ChainId[chainId]} ${source} ${address}: ${result.reason?.message ?? result.reason}`,
      );
      return;
    }
    if (result.value.claim) {
      claims.push(result.value.claim);
    }
    if (result.value.notSafe) {
      notSafe.push(result.value.notSafe);
    }
  });

  const lines = claims
    .sort(
      (a, b) =>
        a.network.localeCompare(b.network) || a.source.localeCompare(b.source),
    )
    .map(({ network, safe, address }) =>
      [network, safe, address, feeRecipient].join(','),
    );

  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');
  console.log(`Written ${lines.length} claims to ${OUT_PATH}`);

  if (notSafe.length > 0) {
    console.warn(
      `\nOwner is not a Safe, can't be claimed via operator:\n${notSafe.sort().join('\n')}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`Failed to load collectors:\n${errors.join('\n')}`);
  }
}

main()
  .then(() => {
    console.log('ok');
  })
  .catch(console.error);
