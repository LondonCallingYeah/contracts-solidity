import { Contract, ContractFactory } from '@ethersproject/contracts';
import { ethers } from 'hardhat';

import { TestBancorFormula } from '../../typechain';

let contractStore: { [key: string]: ContractFactory } = {};

const deployContract = async <T extends Promise<Contract>>(
    contractName: string,
    _signerOrArg: any = undefined,
    ...args: any[]
): Promise<T> => {
    let signer;

    if (typeof _signerOrArg === 'object') {
        if (_signerOrArg.constructor.name === 'SignerWithAddress') {
            signer = _signerOrArg;
        } else {
            signer = (await ethers.getSigners())[0];
            args.unshift(_signerOrArg);
        }
    } else {
        signer = (await ethers.getSigners())[0];
        if (_signerOrArg !== undefined) {
            args.unshift(_signerOrArg);
        }
    }

    if (contractStore[contractName + signer.address] === undefined) {
        contractStore[contractName + signer.address] = await ethers.getContractFactory(contractName);
    }

    return args !== undefined
        ? await contractStore[contractName + signer.address].deploy(...args)
        : await contractStore[contractName + signer.address].deploy();
};

const attachContract = async <T extends Promise<Contract>>(contractName: string, address: string): Promise<T> => {
    if (contractStore[contractName] === undefined) {
        contractStore[contractName] = await ethers.getContractFactory(contractName);
    }
    return contractStore[contractName].attach(address);
};

const deployOrAttach = <T extends Contract>(contractName: string) => {
    return {
        deploy: async (...args: any[]): Promise<T> => {
            return await deployContract<Promise<T>>(contractName, ...args);
        },
        attach: async (address: string): Promise<T> => {
            return await attachContract<Promise<T>>(contractName, address);
        }
    };
};

export default {
    TestBancorFormula: deployOrAttach<TestBancorFormula>('TestBancorFormula'),
    BancorNetwork: deployOrAttach('BancorNetwork'),
    BancorFormula: deployOrAttach('BancorFormula'),
    NetworkSettings: deployOrAttach('NetworkSettings'),
    ContractRegistry: deployOrAttach('ContractRegistry'),
    ConverterRegistry: deployOrAttach('ConverterRegistry'),
    ConverterFactory: deployOrAttach('ConverterFactory'),
    TestStandardToken: deployOrAttach('TestStandardToken'),
    TestNonStandardToken: deployOrAttach('TestNonStandardToken'),
    TestBancorNetwork: deployOrAttach('TestBancorNetwork'),
    ConverterV27OrLowerWithoutFallback: deployOrAttach('ConverterV27OrLowerWithoutFallback'),
    ConverterV27OrLowerWithFallback: deployOrAttach('ConverterV27OrLowerWithFallback'),
    ConverterV28OrHigherWithoutFallback: deployOrAttach('ConverterV28OrHigherWithoutFallback'),
    ConverterV28OrHigherWithFallback: deployOrAttach('ConverterV28OrHigherWithFallback'),
    LiquidityPoolV1Converter: deployOrAttach('LiquidityPoolV1Converter'),
    TestCheckpointStore: deployOrAttach('TestCheckpointStore'),
    DSToken: deployOrAttach('DSToken'),
    BancorX: deployOrAttach('BancorX'),
    TestContractRegistryClient: deployOrAttach('TestContractRegistryClient'),
    ConversionPathFinder: deployOrAttach('ConversionPathFinder'),
    ConverterRegistryData: deployOrAttach('ConverterRegistryData'),
    LiquidityPoolV1ConverterFactory: deployOrAttach('LiquidityPoolV1ConverterFactory'),
    ConverterUpgrader: deployOrAttach('ConverterUpgrader'),
    StandardPoolConverter: deployOrAttach('StandardPoolConverter'),
    FixedRatePoolConverter: deployOrAttach('FixedRatePoolConverter'),
    StandardPoolConverterFactory: deployOrAttach('StandardPoolConverterFactory'),
    FixedRatePoolConverterFactory: deployOrAttach('FixedRatePoolConverterFactory'),
    TestTypedConverterAnchorFactory: deployOrAttach('TestTypedConverterAnchorFactory'),
    TestConverterFactory: deployOrAttach('TestConverterFactory'),
    TestConverterRegistry: deployOrAttach('TestConverterRegistry'),
    TestFixedRatePoolConverter: deployOrAttach('TestFixedRatePoolConverter'),
    Whitelist: deployOrAttach('Whitelist'),
    TestLiquidityPoolV1Converter: deployOrAttach('TestLiquidityPoolV1Converter'),
    TestLiquidityPoolV1ConverterFactory: deployOrAttach('TestLiquidityPoolV1ConverterFactory'),
    TestStandardPoolConverterFactory: deployOrAttach('TestStandardPoolConverterFactory'),
    TestTokenGovernance: deployOrAttach('TestTokenGovernance'),
    LiquidityProtectionSettings: deployOrAttach('LiquidityProtectionSettings'),
    LiquidityProtectionStore: deployOrAttach('LiquidityProtectionStore'),
    LiquidityProtectionStats: deployOrAttach('LiquidityProtectionStats'),
    LiquidityProtectionSystemStore: deployOrAttach('LiquidityProtectionSystemStore'),
    TestLiquidityProtection: deployOrAttach('TestLiquidityProtection'),
    TokenHolder: deployOrAttach('TokenHolder'),
    TestLiquidityProtectionEventsSubscriber: deployOrAttach('TestLiquidityProtectionEventsSubscriber'),
    TestStandardPoolConverter: deployOrAttach('TestStandardPoolConverter'),
    TokenGovernance: deployOrAttach('TokenGovernance'),
    CheckpointStore: deployOrAttach('CheckpointStore'),
    LiquidityProtection: deployOrAttach('LiquidityProtection'),
    LiquidityProtectionSettingsMigrator: deployOrAttach('LiquidityProtectionSettingsMigrator'),
    TestMathEx: deployOrAttach('TestMathEx'),
    Owned: deployOrAttach('Owned'),
    TestReentrancyGuardAttacker: deployOrAttach('TestReentrancyGuardAttacker'),
    TestReentrancyGuard: deployOrAttach('TestReentrancyGuard'),
    XTransferRerouter: deployOrAttach('XTransferRerouter')
};
