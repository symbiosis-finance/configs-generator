import {
  ChainId,
  MULTICALL_ADDRESSES,
  OmniPoolInfo,
  Symbiosis,
  Token,
} from '@symbiosis-finance/sdk-types';
import fs from 'fs';
import { BigNumber, providers } from 'ethers';
import {
  Erc20__factory,
  Multicall__factory,
  Omnipool__factory,
} from '../types/ethers-contracts';

const symbiosis = new Symbiosis('mainnet', 'limits');

// pool assets: 200% of the pool liquidity (asset liability)
const LIQUIDITY_MULTIPLIER = 2;
// 100% of the sum of totalSupply of all synths of the token
const SUPPLY_MULTIPLIER = 1;
// round the limit down keeping this many significant digits
// e.g. 7,037,034 USDC -> 7,030,000; 543.21 ETH -> 543
const SIGNIFICANT_DIGITS = 3;
// omni pool stores cash/liability normalized to 18 decimals
const POOL_DECIMALS = 18;

type PoolPart = {
  poolToken: Token; // token held by the omni pool (synth or host-chain token)
  pool: OmniPoolInfo;
  assetIndex: number;
};

type Item = {
  token: Token; // original (non-synthetic) token
  poolPart?: PoolPart;
};

function roundDownToSignificantDigits(
  value: BigNumber,
  digits: number,
): BigNumber {
  const str = value.toString();
  if (str.length <= digits) {
    return value;
  }
  const rounded = str.slice(0, digits) + '0'.repeat(str.length - digits);
  return BigNumber.from(rounded);
}

// rescale a value between decimals, e.g. from the pool's normalized
// decimals to raw units of the original token
function rescaleDecimals(
  value: BigNumber,
  fromDecimals: number,
  toDecimals: number,
): BigNumber {
  if (toDecimals >= fromDecimals) {
    return value.mul(BigNumber.from(10).pow(toDecimals - fromDecimals));
  }
  return value.div(BigNumber.from(10).pow(fromDecimals - toDecimals));
}

// synth representations of the token across all chains
function findAllSynths(token: Token): Token[] {
  const synths: Token[] = [];
  for (const chain of symbiosis.config.chains) {
    try {
      const synth = symbiosis.getRepresentation(token, chain.id);
      if (synth && !synths.find((s) => s.equals(synth))) {
        synths.push(synth);
      }
    } catch {
      // token is unknown to the config cache on this chain
    }
  }
  return synths;
}

function findPoolPart(token: Token): PoolPart | undefined {
  const pool = symbiosis.getOmniPoolByToken(token);
  if (!pool) {
    return undefined;
  }

  // the pool holds the synthetic representation of the token;
  // tokens on the pool's host chain are held as is
  const poolToken =
    token.chainId === pool.chainId
      ? token
      : symbiosis.getRepresentation(token, pool.chainId);

  if (!poolToken) {
    return undefined;
  }

  try {
    const assetIndex = symbiosis.getOmniPoolTokenIndex(pool, poolToken);
    return { poolToken, pool, assetIndex };
  } catch {
    return undefined;
  }
}

const providersCache = new Map<ChainId, providers.JsonRpcProvider>();
function getProvider(chainId: ChainId): providers.JsonRpcProvider {
  let provider = providersCache.get(chainId);
  if (!provider) {
    provider = new providers.JsonRpcProvider(symbiosis.chainConfig(chainId).rpc);
    providersCache.set(chainId, provider);
  }
  return provider;
}

// pool assets: 300% of the asset liability, in raw units of the original token
async function getPoolLimits(items: Item[]): Promise<Map<Item, BigNumber>> {
  const omnipoolInterface = Omnipool__factory.createInterface();
  const limits = new Map<Item, BigNumber>();

  const poolItems = items.filter((i) => i.poolPart) as Required<Item>[];

  for (const chainId of new Set(poolItems.map((i) => i.poolPart.pool.chainId))) {
    const chainItems = poolItems.filter(
      (i) => i.poolPart.pool.chainId === chainId,
    );

    const multicallAddress = MULTICALL_ADDRESSES[chainId];
    if (!multicallAddress) {
      throw new Error(`No multicall address for chainId ${chainId}`);
    }
    const multicall = Multicall__factory.connect(
      multicallAddress,
      getProvider(chainId),
    );

    const calls = chainItems.map(({ poolPart }) => ({
      target: poolPart.pool.address,
      callData: omnipoolInterface.encodeFunctionData('indexToAsset', [
        poolPart.assetIndex,
      ]),
    }));

    const results = await multicall.callStatic.tryAggregate(false, calls);

    chainItems.forEach((item, index) => {
      const { poolToken } = item.poolPart;
      const [success, data] = results[index];
      if (!success) {
        console.warn(
          `indexToAsset failed for ${poolToken.symbol} (${poolToken.address})`,
        );
        return;
      }

      const { liability, active } = omnipoolInterface.decodeFunctionResult(
        'indexToAsset',
        data,
      ) as unknown as { liability: BigNumber; active: boolean };

      if (!active) {
        console.warn(
          `Asset is not active: ${poolToken.symbol} (${poolToken.address})`,
        );
        return;
      }

      limits.set(
        item,
        rescaleDecimals(
          liability.mul(LIQUIDITY_MULTIPLIER),
          POOL_DECIMALS,
          item.token.decimals,
        ),
      );
    });
  }

  return limits;
}

// 200% of the original token balance on the portal, in raw units of the
// original token: the total amount bridged out of the original chain
async function getSynthSupplyLimit(token: Token): Promise<BigNumber | undefined> {
  const synths = findAllSynths(token);
  if (synths.length === 0) {
    return undefined;
  }

  const supplies = await Promise.all(
    synths.map(async (synth) => {
      try {
        const erc20 = Erc20__factory.connect(
          synth.address,
          getProvider(synth.chainId),
        );
        const totalSupply = await erc20.totalSupply();
        return rescaleDecimals(totalSupply, synth.decimals, token.decimals);
      } catch {
        console.warn(
          `totalSupply failed for ${synth.symbol} (${synth.chainId}, ${synth.address})`,
        );
        return undefined;
      }
    }),
  );

  const total = supplies
    .filter(Boolean)
    .reduce((acc: BigNumber, supply) => acc.add(supply as BigNumber), BigNumber.from(0));

  return total.mul(SUPPLY_MULTIPLIER);
}

async function main() {
  const tokens = symbiosis
    .tokens()
    .filter((token) => !token.isSynthetic && !token.deprecated)
    .reduce((acc, item) => {
      if (acc.find((t) => t.equals(item))) {
        return acc;
      }
      acc.push(item);
      return acc;
    }, [] as Token[]);

  const items: Item[] = tokens.map((token) => ({
    token,
    poolPart: findPoolPart(token),
  }));

  const poolLimits = await getPoolLimits(items);

  const supplyLimits = new Map<Item, BigNumber>();
  await Promise.all(
    items.map(async (item) => {
      const limit = await getSynthSupplyLimit(item.token);
      if (limit) {
        supplyLimits.set(item, limit);
      }
    }),
  );

  const lines: string[] = [];
  for (const item of items) {
    const { token } = item;

    const candidates = [poolLimits.get(item), supplyLimits.get(item)].filter(
      Boolean,
    ) as BigNumber[];

    if (candidates.length === 0) {
      console.warn(
        `No pool and no synths for ${token.symbol} (${token.chainId}), skipped`,
      );
      continue;
    }

    const max = candidates.reduce((a, b) => (a.gte(b) ? a : b));
    const limit = roundDownToSignificantDigits(max, SIGNIFICANT_DIGITS);

    lines.push(
      [token.chainId, token.address, limit.toString(), token.symbol].join(','),
    );
  }

  fs.writeFileSync('data/limits.txt', lines.join('\n'), 'utf8');
  console.log(`Done. ${lines.length} limits written to data/limits.txt`);
}

main().catch(console.error);
