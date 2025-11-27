import { ChainId, getMulticall, Symbiosis, Token } from 'symbiosis-js-sdk';
import fs from 'fs';
import { Erc20__factory } from '../types/ethers-contracts';
import { BigNumber } from 'ethers';

const symbiosis = new Symbiosis('mainnet', 'fees');


const multisigAddress = '0xaD78eb112Db851777Bec979439E10E1a339A257f';
const to = '0x7c5d5222f60853159bbDCc058088587618D61B24';

const chainId = ChainId.SYMBIOSIS_MAINNET;

type TokenBalance = { token: Token, balance: BigNumber }

async function main() {


  const erc20Interface = Erc20__factory.createInterface();

  const tokens = symbiosis.tokens()
    .filter((token) => token.chainId === chainId)
    .reduce((acc, item) => {
      if (acc.find((t) => t.equals(item))) {
        return acc;
      }
      acc.push(item);
      return acc
    }, [] as Token[])

  const calls = tokens.map((token) => {
    return {
      target: token.address,
      callData: erc20Interface.encodeFunctionData('balanceOf', [multisigAddress])
    };
  });

  const provider = symbiosis.getProvider(chainId);
  const multicall = await getMulticall(provider);
  const results = await multicall.callStatic.tryAggregate(true, calls);

  const nonZeroBalances: TokenBalance[] = tokens.map((token, index) => {
    const [success, data] = results[index];
    if (!success) {
      return;
    }

    const [balance] = erc20Interface.decodeFunctionResult('balanceOf', data) as [BigNumber];

    if (balance.lte(0)) {
      return;
    }

    return { token, balance };
  }).filter(Boolean) as TokenBalance[];

  const data = nonZeroBalances.map(({ token, balance }) => {
    return [
      'symbiosis_mainnet',
      multisigAddress,
      token.address,
      to,
      balance
    ].join(',');
  });


  fs.writeFileSync(
    'data/fees.txt',
    data.join('\n'),
    'utf8'
  );

}

main().then(() => {
  console.log('ok');
}).catch(console.error);