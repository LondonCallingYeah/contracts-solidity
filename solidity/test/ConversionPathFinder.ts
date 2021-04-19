import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ContractRegistry, ConverterFactory, ConverterRegistry, ConverterRegistryData } from '../../typechain';

import Constants from './helpers/Constants';
import Contracts from './helpers/Contracts';

const ANCHOR_TOKEN_SYMBOL = 'ETH';
const STANDARD_CONVERTER_TYPE = 3;
const STANDARD_CONVERTER_WEIGHTS = [500_000, 500_000];

let accounts: SignerWithAddress[];
let contractRegistry: ContractRegistry;
let converterFactory: ConverterFactory;
let converterRegistry: ConverterRegistry;
let converterRegistryData: ConverterRegistryData;
let pathFinder: any;
let anchorToken: string;
let nonOwner: SignerWithAddress;

/* eslint-disable no-multi-spaces,comma-spacing */
const LAYOUT = {
    reserves: [{ symbol: 'BNT' }, { symbol: 'AAA' }, { symbol: 'BBB' }, { symbol: 'CCC' }, { symbol: 'DDD' }],
    converters: [
        { symbol: 'ETHBNT', reserves: [{ symbol: 'ETH' }, { symbol: 'BNT' }] },
        { symbol: 'AAABNT', reserves: [{ symbol: 'AAA' }, { symbol: 'BNT' }] },
        { symbol: 'BBBBNT', reserves: [{ symbol: 'BBB' }, { symbol: 'BNT' }] },
        { symbol: 'CCCBNT', reserves: [{ symbol: 'CCC' }, { symbol: 'BNT' }] },
        { symbol: 'AAABNTBNT', reserves: [{ symbol: 'AAABNT' }, { symbol: 'BNT' }] },
        { symbol: 'BBBBNTBNT', reserves: [{ symbol: 'BBBBNT' }, { symbol: 'BNT' }] },
        { symbol: 'DDDAAABNTBNT', reserves: [{ symbol: 'DDD' }, { symbol: 'AAABNTBNT' }] }
    ]
};
/* eslint-enable no-multi-spaces,comma-spacing */

const getSymbol = async (tokenAddress: string) => {
    if (tokenAddress === Constants.NATIVE_TOKEN_ADDRESS) {
        return 'ETH';
    }

    const token = await Contracts.TestStandardToken.attach(tokenAddress);
    return token.symbol();
};

const printPath = async (sourceToken: any, targetToken: any, path: any) => {
    const sourceSymbol = await getSymbol(sourceToken);
    const targetSymbol = await getSymbol(targetToken);
    const symbols = await Promise.all(path.map((token: any) => getSymbol(token)));
    console.log(`path from ${sourceSymbol} to ${targetSymbol} = [${symbols}]`);
};

const findPath = async (sourceToken: any, targetToken: any, anchorToken: any, converterRegistry: any) => {
    const sourcePath = await getPath(sourceToken, anchorToken, converterRegistry);
    const targetPath = await getPath(targetToken, anchorToken, converterRegistry);

    return getShortestPath(sourcePath, targetPath);
};

const getPath = async (token: any, anchorToken: any, converterRegistry: any): Promise<any> => {
    if (token === anchorToken) {
        return [token];
    }

    const isAnchor = await converterRegistry.isAnchor(token);
    const anchors = isAnchor ? [token] : await converterRegistry.getConvertibleTokenAnchors(token);
    for (const anchor of anchors) {
        const converterAnchor = await Contracts.IConverterAnchor.attach(anchor);
        const converterAnchorOwner = await converterAnchor.owner();
        const converter = await Contracts.StandardPoolConverter.attach(converterAnchorOwner);
        const connectorTokenCount = await converter.connectorTokenCount();
        for (let i = 0; i < connectorTokenCount; i++) {
            const connectorToken = await converter.connectorTokens(i);
            if (connectorToken !== token) {
                const path = await getPath(connectorToken, anchorToken, converterRegistry);
                if (path.length > 0) {
                    return [token, anchor, ...path];
                }
            }
        }
    }

    return [];
};

const getShortestPath = (sourcePath: any, targetPath: any) => {
    if (sourcePath.length === 0 || targetPath.length === 0) {
        return [];
    }

    let i = sourcePath.length - 1;
    let j = targetPath.length - 1;
    while (i >= 0 && j >= 0 && sourcePath[i] === targetPath[j]) {
        i--;
        j--;
    }

    const path = [];
    for (let m = 0; m <= i + 1; m++) {
        path.push(sourcePath[m]);
    }
    for (let n = j; n >= 0; n--) {
        path.push(targetPath[n]);
    }

    let length = 0;
    for (let p = 0; p < path.length; p += 1) {
        for (let q = p + 2; q < path.length - (p % 2); q += 2) {
            if (path[p] === path[q]) {
                p = q;
            }
        }
        path[length++] = path[p];
    }

    return path.slice(0, length);
};

describe('ConversionPathFinder', () => {
    let addresses = { ETH: Constants.NATIVE_TOKEN_ADDRESS } as any;

    before(async () => {
        accounts = await ethers.getSigners();

        nonOwner = accounts[1];

        // The following contracts are unaffected by the underlying tests, this can be shared.
        contractRegistry = await Contracts.ContractRegistry.deploy();

        converterFactory = await Contracts.ConverterFactory.deploy();
        converterRegistry = await Contracts.ConverterRegistry.deploy(contractRegistry.address);
        converterRegistryData = await Contracts.ConverterRegistryData.deploy(contractRegistry.address);
        pathFinder = await Contracts.ConversionPathFinder.deploy(contractRegistry.address);

        await converterFactory.registerTypedConverterFactory(
            (await Contracts.StandardPoolConverterFactory.deploy()).address
        );

        await contractRegistry.registerAddress(Constants.registry.CONVERTER_FACTORY, converterFactory.address);
        await contractRegistry.registerAddress(Constants.registry.CONVERTER_REGISTRY, converterRegistry.address);
        await contractRegistry.registerAddress(
            Constants.registry.CONVERTER_REGISTRY_DATA,
            converterRegistryData.address
        );
    });

    beforeEach(async () => {
        for (const reserve of LAYOUT.reserves) {
            const erc20Token = await Contracts.TestStandardToken.deploy('name', reserve.symbol, 18, 0);
            addresses[reserve.symbol] = erc20Token.address;
        }

        for (const converter of LAYOUT.converters) {
            const tokens = converter.reserves.map((reserve) => addresses[reserve.symbol]);
            await converterRegistry.newConverter(
                STANDARD_CONVERTER_TYPE,
                'name',
                converter.symbol,
                0,
                0,
                tokens,
                STANDARD_CONVERTER_WEIGHTS
            );
            const anchor = await Contracts.IConverterAnchor.attach((await converterRegistry.getAnchors()).slice(-1)[0]);
            const converterBase = await Contracts.StandardPoolConverter.attach(await anchor.owner());
            await converterBase.acceptOwnership();
            addresses[converter.symbol] = anchor.address;
        }

        anchorToken = addresses[ANCHOR_TOKEN_SYMBOL];
        await pathFinder.setAnchorToken(anchorToken);
    });

    it('should revert when a non owner tries to update the anchor token', async () => {
        await expect(pathFinder.connect(nonOwner).setAnchorToken(accounts[0].address)).to.be.revertedWith(
            'ERR_ACCESS_DENIED'
        );
    });

    it('should return an empty path if the source-token has no path to the anchor-token', async () => {
        const sourceToken = accounts[0];
        const targetToken = anchorToken;
        const expected = await findPath(sourceToken.address, targetToken, anchorToken, converterRegistry);
        const actual = await pathFinder.findPath(sourceToken.address, targetToken);
        expect(expected).to.be.empty;
        expect(actual).to.be.empty;
    });

    it('should return an empty path if the target-token has no path to the anchor-token', async () => {
        const sourceToken = anchorToken;
        const targetToken = accounts[0];
        const expected = await findPath(sourceToken, targetToken.address, anchorToken, converterRegistry);
        const actual = await pathFinder.findPath(sourceToken, targetToken.address);
        expect(expected).to.be.empty;
        expect(actual).to.be.empty;
    });

    const allSymbols = ['ETH', ...[...LAYOUT.reserves, ...LAYOUT.converters].map((record) => record.symbol)];
    for (const sourceSymbol of allSymbols) {
        for (const targetSymbol of allSymbols) {
            it(`from ${sourceSymbol} to ${targetSymbol}`, async () => {
                const sourceToken = addresses[sourceSymbol];
                const targetToken = addresses[targetSymbol];
                const expected = await findPath(sourceToken, targetToken, anchorToken, converterRegistry);
                const actual = await pathFinder.findPath(sourceToken, targetToken);
                expect(actual).to.be.deep.equal(expected);

                await printPath(sourceToken, targetToken, actual);
            });
        }
    }
});