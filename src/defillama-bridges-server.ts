import {
  isEvmChainId, isQuaiChainId,
  isTronChainId,
  Symbiosis,
} from '@symbiosis-finance/sdk-types';
import fs from 'fs';

const symbiosis = new Symbiosis('mainnet', 'defillama');

const contracts = symbiosis.config.chains
  .filter(({ id }) => isEvmChainId(id) || isTronChainId(id) || isQuaiChainId(id))
  .map(({ id, portal, synthesis }) => ({ chainId: id, portal, synthesis }));

const entries = contracts
  .map(
    ({ chainId, portal, synthesis }) =>
      `  {\n` +
      `    chainId: ${chainId},\n` +
      `    portal: "${portal}",\n` +
      `    synthesis: "${synthesis}",\n` +
      `  },`,
  )
  .join('\n');

const output =
  `import { ChainId } from "./constants";\n\n` +
  `export const contracts: { chainId: ChainId; portal: string; synthesis: string }[] = [\n` +
  `${entries}\n` +
  `] as const;\n`;

fs.writeFileSync('data/defillama-bridges-server.ts', output, 'utf8');
