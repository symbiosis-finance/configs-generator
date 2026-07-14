import {
  ChainId,
  isEvmChainId,
  isTronChainId,
  Symbiosis,
} from '@symbiosis-finance/sdk-types';
import fs from 'fs';

const symbiosis = new Symbiosis('mainnet', '');

const entries = symbiosis
  .chains()
  .filter((chain) => isEvmChainId(chain.id) || isTronChainId(chain.id))
  .map((chain) => ({ name: ChainId[chain.id] as string, id: chain.id }))
  .filter(({ name }) => !!name);

let output = 'export enum ChainId {\n';
for (const { name, id } of entries) {
  output += `    ${name} = ${id},\n`;
}
output += '}\n';

const outPath = 'data/chain-ids-mainnet.ts';
fs.writeFileSync(outPath, output);
console.log(`Written to ${outPath}`);
