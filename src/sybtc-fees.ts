import { ChainId, Symbiosis } from '@symbiosis-finance/sdk-types';
import fs from 'fs';
import { Erc20__factory } from '../types/ethers-contracts';
import { providers, utils } from 'ethers';

// https://linear.app/symbiosis/issue/ENG-1597
const symbiosis = new Symbiosis('mainnet', 'fees');

const to = '0x7c5d5222f60853159bbDCc058088587618D61B24';

type Source = {
  chainId: ChainId;
  multisigAddress: string;
  tokenAddress: string;
};

const NETWORK_NAMES: Partial<Record<ChainId, string>> = {
  [ChainId.ETH_MAINNET]: 'ethereum_mainnet',
};

const sources: Source[] = [
  {
    chainId: ChainId.ETH_MAINNET,
    multisigAddress: '0x5112EbA9bc2468Bb5134CBfbEAb9334EdaE7106a',
    tokenAddress: '0x01a8b61E7b03891a736B5DF865E0EF9C511850ad',
  },
  {
    chainId: ChainId.BSC_MAINNET,
    multisigAddress: '0x60b9be4FE2bd7b012A3bF64bdD49c907F54276EA',
    tokenAddress: '0xa67c48f86fc6d0176dca38883ca8153c76a532c7',
  },
  {
    chainId: ChainId.RSK_MAINNET,
    multisigAddress: '0xa1b4778126801acbc39405b917db411c73912e28',
    tokenAddress: '0xb52E582263C1D0189b3cC1402C1B7205B7F2e9BA',
  },
  {
    chainId: ChainId.CITREA_MAINNET,
    multisigAddress: '0x74c2FF71FefB9aEAe25453B148784c39f286E8D4',
    tokenAddress: '0x384157027B1CDEAc4e26e3709667BB28735379Bb',
  },
];

async function main() {
  const lines: string[] = [];

  for (const source of sources) {
    const { chainId } = source;
    // explorers may show EIP-1191 (chain-specific) checksums, normalize to EIP-55
    const multisigAddress = utils.getAddress(
      source.multisigAddress.toLowerCase(),
    );
    const tokenAddress = utils.getAddress(source.tokenAddress.toLowerCase());
    const network = NETWORK_NAMES[chainId] ?? ChainId[chainId].toLowerCase();
    const provider = new providers.JsonRpcProvider(
      symbiosis.chainConfig(chainId).rpc,
    );
    const erc20 = Erc20__factory.connect(tokenAddress, provider);

    const [symbol, decimals, balance] = await Promise.all([
      erc20.symbol(),
      erc20.decimals(),
      erc20.balanceOf(multisigAddress),
    ]);

    console.log(
      `${network}: ${symbol} balance ${utils.formatUnits(balance, decimals)}`,
    );

    if (balance.lte(0)) {
      continue;
    }

    lines.push([network, multisigAddress, tokenAddress, to, balance].join(','));
  }

  fs.writeFileSync('data/sybtc-fees.txt', lines.join('\n'), 'utf8');
}

main()
  .then(() => {
    console.log('ok');
  })
  .catch(console.error);
