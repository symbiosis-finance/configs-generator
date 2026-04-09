import {
  ChainId,
  isEvmChainId,
  isQuaiChainId,
  isTonChainId,
  isTronChainId,
  Symbiosis,
} from 'symbiosis-js-sdk';
import fs from 'fs';
import TronWeb from 'tronweb';

import { CHAINS_DEFILLAMA, ZERO_ADDRESS } from './constants';

const symbiosis = new Symbiosis('mainnet', 'defillama');

const tokens = symbiosis
  .tokens()
  .filter((i) => i.symbol !== 'syBTC' && i.symbol !== 'EVAA')
  .reduce((acc, item) => {
    if (acc.find((t) => t.equals(item))) {
      return acc;
    }
    return [...acc, item];
  }, [] as ReturnType<Symbiosis['tokens']>);

type Token = {
  address: string;
  symbol: string | undefined;
};
type ChainConfig = {
  chainId: number;
  portal: string;
  chainName: string;
  tokens: Token[];
};

const chainConfigs: ChainConfig[] = symbiosis.config.chains
  .filter((chain) => chain.portal !== ZERO_ADDRESS || !!chain.tonPortal)
  .filter((chain) => chain.id !== ChainId.SYMBIOSIS_MAINNET)
  .map((chain) => {
    const chainName = CHAINS_DEFILLAMA[chain.id];
    if (!chainName) {
      throw new Error(`Unsupported chainId: ${chain.id}`);
    }

    let chainTokens = tokens.filter((token) => token.chainId === chain.id);

    let portalAddress: string;
    let portalTokens: { address: string; symbol: string | undefined }[];

    if (isTronChainId(chain.id)) {
      portalAddress = TronWeb.address.fromHex(chain.portal);
      portalTokens = chainTokens.map(({ address, symbol }) => ({
        address: TronWeb.address.fromHex(address),
        symbol,
      }));
    } else if (isTonChainId(chain.id) && chain.tonPortal) {
      portalAddress = chain.tonPortal;
      portalTokens = chainTokens.map(({ tonAddress: address, symbol }) => ({
        address,
        symbol,
      }));
    } else if (isEvmChainId(chain.id) || isQuaiChainId(chain.id)) {
      portalAddress = chain.portal;
      portalTokens = chainTokens.map(({ address, symbol }) => ({
        address,
        symbol,
      }));
    } else {
      throw new Error(`Unsupported chainId: ${chain.id}`);
    }

    return {
      chainId: chain.id,
      portal: portalAddress,
      chainName,
      tokens: portalTokens,
    };
  });

console.log(
  '---Tokens Config--- \n',
  chainConfigs.map((chain) => ({
    name: chain.chainName,
    chainId: chain.chainId,
  })),
);

// Format the config into a string with comments
const formatConfig = (config: ChainConfig[]) => {
  return `module.exports = {
    chains: [
      ${config
        .map(
          (chainConfig) => `{
          name: '${chainConfig.chainName}',
          tokens: [
            ${chainConfig.tokens
              .map((token) => {
                return `'${token.address}', // ${token.symbol}`;
              })
              .join('\n            ')}
          ],
          holders: [
              '${chainConfig.portal}' // portal
          ]
      }`,
        )
        .join(',\n      ')}
    ]
  }`;
};

fs.writeFileSync('data/defillama-tvl.js', formatConfig(chainConfigs), 'utf8');

console.log('---Done---');
