import { ChainId, Symbiosis } from 'symbiosis-js-sdk';
import fs from 'fs';
import { Erc20__factory } from '../types/ethers-contracts';
import { BigNumber } from 'ethers';

const symbiosis = new Symbiosis('mainnet', 'fees');
const chainId = ChainId.SYMBIOSIS_MAINNET;
const provider = symbiosis.getProvider(chainId);

type TokenBalance = { multisigAddress: string, tokenAddress: string; balance: BigNumber };

async function readNonZeroBalancesFromFile(): Promise<TokenBalance[]> {
  const file = fs.readFileSync('data/fees.txt', 'utf8');
  const lines = file.split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    throw new Error('data/fees.txt is empty');
  }

  const items: TokenBalance[] = [];

  for (const line of lines) {
    const [_network, multisigAddress, tokenAddress, _to, balanceStr] = line.split(',');
    if (!multisigAddress || !tokenAddress || !balanceStr) {
      throw new Error(`Invalid line in data/fees.txt: ${line}`);
    }

    const balance = BigNumber.from(balanceStr);
    items.push({ multisigAddress, tokenAddress, balance });
  }

  return items;
}

async function main() {
  const nonZeroBalances = await readNonZeroBalancesFromFile();

  for (const { multisigAddress, tokenAddress, balance } of nonZeroBalances) {
    const erc20 = Erc20__factory.connect(tokenAddress, provider);
    const newBalance = await erc20.balanceOf(multisigAddress);
    if (newBalance.lt(balance)) {
      throw new Error(`Balance of ${tokenAddress} is less than expected`);
    } else if (newBalance.gt(balance)) {
      console.log(`${tokenAddress} balance become greater`);
    }
    else {
      console.log(`${tokenAddress} balance is eq`);
    }
  }
}

main().then(() => {
  console.log('ok');
}).catch(console.error);