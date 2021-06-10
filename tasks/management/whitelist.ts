import DefaultContracts from 'contracts';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LedgerSigner } from '@ethersproject/hardware-wallets';
import { BancorSystem } from 'types';
import { execute, loadConfig } from 'tasks/utils';

export default async (
    args: {
        ledger: boolean;
        configPath: string;
        ledgerPath: string;
        poolAddress: string;
    },
    hre: HardhatRuntimeEnvironment
) => {
    const signer = args.ledger
        ? new LedgerSigner(hre.ethers.provider, 'hid', args.ledgerPath)
        : (await hre.ethers.getSigners())[0];

    const config = await loadConfig<BancorSystem>(args.configPath);
    const Contract = DefaultContracts.connect(signer);

    const liquidityProtectionSettings = await Contract.LiquidityProtectionSettings.attach(
        config.liquidityProtection.liquidityProtectionSettings
    );

    if (await liquidityProtectionSettings.isPoolWhitelisted(args.poolAddress)) {
        throw new Error('Pool is already whitelisted');
    }

    await execute(liquidityProtectionSettings.addPoolToWhitelist(args.poolAddress));
    console.log(`Pool ${args.poolAddress} whitelisted ✨`);
};