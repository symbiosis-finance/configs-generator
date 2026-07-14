import {
  ChainId,
  getChainById,
  isBtcChainId,
  isSolanaChainId,
  isTonChainId,
  Symbiosis,
} from '@symbiosis-finance/sdk-types';
import fs from 'fs';
import { utils } from 'ethers';

const symbiosis = new Symbiosis('mainnet', 'dune');

export const CHAINS_DUNE: Partial<Record<ChainId, string>> = {
  [ChainId.ETH_MAINNET]: 'ethereum',
  [ChainId.BSC_MAINNET]: 'bnb',
  [ChainId.AVAX_MAINNET]: 'avalanche_c',
  [ChainId.MATIC_MAINNET]: 'polygon',
  [ChainId.BOBA_MAINNET]: 'boba',
  [ChainId.ZKSYNC_MAINNET]: 'zksync',
  [ChainId.ARBITRUM_MAINNET]: 'arbitrum',
  [ChainId.OPTIMISM_MAINNET]: 'optimism',
  [ChainId.ARBITRUM_NOVA]: 'nova',
  [ChainId.POLYGON_ZK]: 'zkevm',
  [ChainId.MANTLE_MAINNET]: 'mantle',
  [ChainId.LINEA_MAINNET]: 'linea',
  [ChainId.BASE_MAINNET]: 'base',
  [ChainId.TRON_MAINNET]: 'tron',
  [ChainId.SCROLL_MAINNET]: 'scroll',
  [ChainId.BLAST_MAINNET]: 'blast',
  [ChainId.TAIKO_MAINNET]: 'taiko',
  [ChainId.SEI_EVM_MAINNET]: 'sei',
  [ChainId.ABSTRACT_MAINNET]: 'abstract',
  [ChainId.GNOSIS_MAINNET]: 'gnosis',
  [ChainId.BERACHAIN_MAINNET]: 'berachain',
  [ChainId.UNICHAIN_MAINNET]: 'unichain',
  [ChainId.OPBNB_MAINNET]: 'opbnb',
  [ChainId.HYPEREVM_MAINNET]: 'hyperevm',
  [ChainId.KATANA_MAINNET]: 'katana',
  [ChainId.APECHAIN_MAINNET]: 'apechain',
  [ChainId.PLASMA_MAINNET]: 'plasma',
};

const INTERVAL_DAYS = 7;

const queryItems = symbiosis.config.chains
  .map(({ id, metaRouter }) => {
    if (isBtcChainId(id) || isSolanaChainId(id) || isTonChainId(id)) {
      return;
    }

    const chainName = CHAINS_DUNE[id];
    if (!chainName) {
      const chain = getChainById(id);
      console.log(`[ChainId] ${id}.${chain?.name ?? 'unknown'} not found`);
      return;
    }

    return `select block_time, "to", success, hash, data, '${chainName}' as chain
          from ${chainName}.transactions
          where block_date >= current_date - interval '${INTERVAL_DAYS}' day
            AND "to" = ${metaRouter}`;
  })
  .filter(Boolean);

const partners = [
  'symbiosis-app',
  'symbiosis-app-tw',
  'symbiosis-api',
  'lifi',
  'socket-io',
  'dodo',
  'kyberswap',
  '1inch',
  'iMe',
  'rubic',
  'rango',
  'chainspot.router',
  'swing-api',
];

const partnersSubquery = partners
  .map((partner) => {
    const hex = utils.formatBytes32String(partner).slice(2);
    return `WHEN strpos(cast(data as varchar), '${hex}') > 0 THEN '${partner}'`;
  })
  .join(' ');

const query = `
    WITH symbiosis AS (SELECT block_time,
                              "to",
                              success,
                              hash,
                              data,
                              chain,
                              CASE
                                  ${partnersSubquery}
                                  ELSE 'else'
                                  END as partner
                       FROM (${queryItems.join(' UNION ALL ')}))
    SELECT block_time, chain, hash, partner, success
    FROM symbiosis
    WHERE success != true
    ORDER BY block_time desc`;

fs.writeFileSync('data/dune.sql', query, 'utf8');
