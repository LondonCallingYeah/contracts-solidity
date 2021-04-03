import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import Constants from './helpers/Constants';

import ConverterHelper from './helpers/Converter';
import Contracts from './helpers/Contracts';
import {
    ContractRegistry,
    ConverterBase,
    ConverterFactory,
    ConverterRegistryData,
    DSToken,
    TestConverterRegistry,
    TestStandardToken
} from '../../typechain';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

let contractRegistry: ContractRegistry;
let converterFactory: ConverterFactory;
let converterRegistry: TestConverterRegistry;
let converterRegistryData: ConverterRegistryData;

let accounts: SignerWithAddress[];

describe('ConverterRegistry', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        // The following contracts are unaffected by the underlying tests, this can be shared.
        converterFactory = await Contracts.ConverterFactory.deploy();
        await converterFactory.registerTypedConverterFactory(
            (await Contracts.LiquidityPoolV1ConverterFactory.deploy()).address
        );
        await converterFactory.registerTypedConverterFactory(
            (await Contracts.StandardPoolConverterFactory.deploy()).address
        );
    });

    beforeEach(async () => {
        contractRegistry = await Contracts.ContractRegistry.deploy();
        converterRegistry = await Contracts.TestConverterRegistry.deploy(contractRegistry.address);
        converterRegistryData = await Contracts.ConverterRegistryData.deploy(contractRegistry.address);
        await contractRegistry.registerAddress(Constants.registry.CONVERTER_FACTORY, converterFactory.address);
        await contractRegistry.registerAddress(Constants.registry.CONVERTER_REGISTRY, converterRegistry.address);
        await contractRegistry.registerAddress(
            Constants.registry.CONVERTER_REGISTRY_DATA,
            converterRegistryData.address
        );
    });

    const testRemove = async (converter: any) => {
        const res = await converterRegistry.removeConverter(converter.address);

        return testEvents(res, converter, 'Removed');
    };

    const testEvents = async (res: any, converter: any, suffix: any) => {
        const anchor = await converter.token();
        const count = await converter.connectorTokenCount();

        expect(res).to.emit(converterRegistry, `ConverterAnchor${suffix}`).withArgs(anchor);

        if (count > BigNumber.from(1)) {
            expect(res).to.emit(converterRegistry, `LiquidityPool${suffix}`).withArgs(anchor);
        } else {
            expect(res).to.emit(converterRegistry, `ConvertibleToken${suffix}`).withArgs(anchor, anchor);
        }

        for (let i = 0; count > BigNumber.from(i); ++i) {
            const connectorToken = await converter.connectorTokens(i);
            expect(res).to.emit(converterRegistry, `ConvertibleToken${suffix}`).withArgs(connectorToken, anchor);
        }
    };

    describe('add old converters', () => {
        let converter1: any;
        let converter2: any;
        let converter3: any;
        let converter4: any;
        let converter5: any;
        let converter6: any;
        let converter7: any;
        let token0: DSToken;
        let token1: DSToken;
        let token2: DSToken;
        let token3: DSToken;
        let token4: DSToken;
        let token5: DSToken;
        let token6: DSToken;
        let token7: DSToken;
        let token8: DSToken;
        let tokenA: DSToken;
        let tokenC: DSToken;
        let tokenE: DSToken;

        const testAdd = async (converter: any) => {
            const res = await converterRegistry.addConverter(converter.address);

            return testEvents(res, converter, 'Added');
        };

        beforeEach(async () => {
            token0 = await Contracts.DSToken.deploy('Token0', 'TKN0', 18);
            token1 = await Contracts.DSToken.deploy('Token1', 'TKN1', 18);
            token2 = await Contracts.DSToken.deploy('Token2', 'TKN2', 18);
            token3 = await Contracts.DSToken.deploy('Token3', 'TKN3', 18);
            token4 = await Contracts.DSToken.deploy('Token4', 'TKN4', 18);
            token5 = await Contracts.DSToken.deploy('Token5', 'TKN5', 18);
            token6 = await Contracts.DSToken.deploy('Token6', 'TKN6', 18);
            token7 = await Contracts.DSToken.deploy('Token7', 'TKN7', 18);
            token8 = await Contracts.DSToken.deploy('Token8', 'TKN8', 18);
            tokenA = await Contracts.DSToken.deploy('TokenA', 'TKNA', 18);
            tokenC = await Contracts.DSToken.deploy('TokenC', 'TKNC', 18);
            tokenE = await Contracts.DSToken.deploy('TokenE', 'TKNE', 18);

            converter1 = await ConverterHelper.deploy(
                1,
                token1.address,
                contractRegistry.address,
                0,
                token0.address,
                0x1000,
                23
            );
            converter2 = await ConverterHelper.deploy(
                1,
                token2.address,
                contractRegistry.address,
                0,
                token4.address,
                0x2400,
                23
            );
            converter3 = await ConverterHelper.deploy(
                1,
                token3.address,
                contractRegistry.address,
                0,
                token6.address,
                0x3600,
                23
            );
            converter4 = await ConverterHelper.deploy(
                1,
                token4.address,
                contractRegistry.address,
                0,
                token8.address,
                0x4800,
                23
            );
            converter5 = await ConverterHelper.deploy(
                1,
                token5.address,
                contractRegistry.address,
                0,
                tokenA.address,
                0x5a00,
                23
            );
            converter6 = await ConverterHelper.deploy(
                1,
                token6.address,
                contractRegistry.address,
                0,
                tokenC.address,
                0x6c00,
                23
            );
            converter7 = await ConverterHelper.deploy(
                1,
                token7.address,
                contractRegistry.address,
                0,
                tokenE.address,
                0x7e00,
                23
            );

            await converter2.addReserve(token1.address, 0x2100);
            await converter3.addReserve(token1.address, 0x3100);
            await converter4.addReserve(token1.address, 0x4100);
            await converter5.addReserve(token1.address, 0x5100);
            await converter6.addReserve(token1.address, 0x6100);
            await converter7.addReserve(token2.address, 0x7200);

            await token1.issue(accounts[0].address, 1);
            await token2.issue(accounts[0].address, 1);
            await token3.issue(accounts[0].address, 1);
            await token4.issue(accounts[0].address, 1);
            await token5.issue(accounts[0].address, 1);
            await token6.issue(accounts[0].address, 1);
            await token7.issue(accounts[0].address, 1);

            await token1.transferOwnership(converter1.address);
            await token2.transferOwnership(converter2.address);
            await token3.transferOwnership(converter3.address);
            await token4.transferOwnership(converter4.address);
            await token5.transferOwnership(converter5.address);
            await token6.transferOwnership(converter6.address);
            await token7.transferOwnership(converter7.address);

            await converter1.acceptTokenOwnership();
            await converter2.acceptTokenOwnership();
            await converter3.acceptTokenOwnership();
            await converter4.acceptTokenOwnership();
            await converter5.acceptTokenOwnership();
            await converter6.acceptTokenOwnership();
            await converter7.acceptTokenOwnership();
        });

        const addConverters = async () => {
            await testAdd(converter1);
            await testAdd(converter2);
            await testAdd(converter3);
            await testAdd(converter4);
            await testAdd(converter5);
            await testAdd(converter6);
            await testAdd(converter7);
        };

        const removeConverters = async () => {
            await testRemove(converter1);
            await testRemove(converter2);
            await testRemove(converter3);
            await testRemove(converter4);
            await testRemove(converter5);
            await testRemove(converter6);
            await testRemove(converter7);
        };

        it('should add converters', async () => {
            await addConverters();
        });

        context('with registered converters', async () => {
            beforeEach(async () => {
                await addConverters();
            });

            it('should not allow to add the same converter twice', async () => {
                await expect(converterRegistry.addConverter(converter1.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter2.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter3.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter4.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter5.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter6.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter7.address)).to.be.revertedWith('ERR_INVALID_ITEM');
            });

            it('should find liquidity pool by its configuration', async () => {
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, token4.address],
                        [0x2400, 0x2100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, token6.address],
                        [0x3600, 0x3100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, tokenA.address],
                        [0x5a00, 0x5100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, token8.address],
                        [0x4800, 0x4100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, tokenC.address],
                        [0x6c00, 0x6100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token2.address, tokenE.address],
                        [0x7e00, 0x7200]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token4.address, token1.address],
                        [0x2100, 0x2400]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token6.address, token1.address],
                        [0x3100, 0x3600]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token8.address, token1.address],
                        [0x4100, 0x4800]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [tokenA.address, token1.address],
                        [0x5100, 0x5a00]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [tokenC.address, token1.address],
                        [0x6100, 0x6c00]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [tokenE.address, token2.address],
                        [0x7200, 0x7e00]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, token4.address],
                        [0x2100, 0x2400]
                    )
                ).to.eql(token2.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, token6.address],
                        [0x3100, 0x3600]
                    )
                ).to.eql(token3.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, token8.address],
                        [0x4100, 0x4800]
                    )
                ).to.eql(token4.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, tokenA.address],
                        [0x5100, 0x5a00]
                    )
                ).to.eql(token5.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token1.address, tokenC.address],
                        [0x6100, 0x6c00]
                    )
                ).to.eql(token6.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token2.address, tokenE.address],
                        [0x7200, 0x7e00]
                    )
                ).to.eql(token7.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token4.address, token1.address],
                        [0x2400, 0x2100]
                    )
                ).to.eql(token2.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token6.address, token1.address],
                        [0x3600, 0x3100]
                    )
                ).to.eql(token3.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [token8.address, token1.address],
                        [0x4800, 0x4100]
                    )
                ).to.eql(token4.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [tokenA.address, token1.address],
                        [0x5a00, 0x5100]
                    )
                ).to.eql(token5.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [tokenC.address, token1.address],
                        [0x6c00, 0x6100]
                    )
                ).to.eql(token6.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [tokenE.address, token2.address],
                        [0x7e00, 0x7200]
                    )
                ).to.eql(token7.address);
            });

            it('should return a list of converters for a list of tokens', async () => {
                const tokens = [token1.address, token2.address, token3.address];
                const expected = [converter1.address, converter2.address, converter3.address];
                const actual = await converterRegistry.getConvertersByAnchors(tokens);
                expect(actual).to.deep.equal(expected);
            });

            it('should remove converters', async () => {
                await removeConverters();
            });

            context('with unregistered converters', async () => {
                beforeEach(async () => {
                    await removeConverters();
                });

                it('should not allow to remove the same converter twice', async () => {
                    await expect(converterRegistry.removeConverter(converter1.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter2.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter3.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter4.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter5.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter6.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter7.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                });

                it('should not be able to find liquidity pool by its configuration', async () => {
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, token4.address],
                            [0x2400, 0x2100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, token6.address],
                            [0x3600, 0x3100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, token8.address],
                            [0x4800, 0x4100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, tokenA.address],
                            [0x5a00, 0x5100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, tokenC.address],
                            [0x6c00, 0x6100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token2.address, tokenE.address],
                            [0x7e00, 0x7200]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token4.address, token1.address],
                            [0x2100, 0x2400]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token6.address, token1.address],
                            [0x3100, 0x3600]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token8.address, token1.address],
                            [0x4100, 0x4800]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [tokenA.address, token1.address],
                            [0x5100, 0x5a00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [tokenC.address, token1.address],
                            [0x6100, 0x6c00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [tokenE.address, token2.address],
                            [0x7200, 0x7e00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, token4.address],
                            [0x2100, 0x2400]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, token6.address],
                            [0x3100, 0x3600]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, token8.address],
                            [0x4100, 0x4800]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, tokenA.address],
                            [0x5100, 0x5a00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token1.address, tokenC.address],
                            [0x6100, 0x6c00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token2.address, tokenE.address],
                            [0x7200, 0x7e00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token4.address, token1.address],
                            [0x2400, 0x2100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token6.address, token1.address],
                            [0x3600, 0x3100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [token8.address, token1.address],
                            [0x4800, 0x4100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [tokenA.address, token1.address],
                            [0x5a00, 0x5100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [tokenC.address, token1.address],
                            [0x6c00, 0x6100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [tokenE.address, token2.address],
                            [0x7e00, 0x7200]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                });
            });
        });
    });

    describe('add new converters', () => {
        let converter1: any;
        let converter2: any;
        let converter3: any;
        let converter4: any;
        let converter5: any;
        let converter6: any;
        let anchor1: DSToken;
        let anchor2: DSToken;
        let anchor3: DSToken;
        let anchor4: DSToken;
        let anchor5: DSToken;
        let anchor6: DSToken;
        let anchor7: DSToken;
        let anchor8: DSToken;
        let anchorA: DSToken;
        let anchorC: DSToken;
        let anchorE: DSToken;

        const testAdd = async (converter: any) => {
            const res = await converterRegistry.addConverter(converter.address);

            return testEvents(res, converter, 'Added');
        };

        beforeEach(async () => {
            anchor1 = await Contracts.DSToken.deploy('Token1', 'TKN1', 18);
            anchor2 = await Contracts.DSToken.deploy('Token2', 'TKN2', 18);
            anchor3 = await Contracts.DSToken.deploy('Token3', 'TKN3', 18);
            anchor4 = await Contracts.DSToken.deploy('Token4', 'TKN4', 18);
            anchor5 = await Contracts.DSToken.deploy('Token5', 'TKN5', 18);
            anchor6 = await Contracts.DSToken.deploy('Token6', 'TKN6', 18);
            anchor7 = await Contracts.DSToken.deploy('Token7', 'TKN7', 18);
            anchor8 = await Contracts.DSToken.deploy('Token8', 'TKN8', 18);
            anchorA = await Contracts.DSToken.deploy('TokenA', 'TKNA', 18);
            anchorC = await Contracts.DSToken.deploy('TokenC', 'TKNC', 18);
            anchorE = await Contracts.DSToken.deploy('TokenE', 'TKNE', 18);

            converter1 = await Contracts.LiquidityPoolV1Converter.deploy(anchor2.address, contractRegistry.address, 0);
            converter2 = await Contracts.LiquidityPoolV1Converter.deploy(anchor3.address, contractRegistry.address, 0);
            converter3 = await Contracts.LiquidityPoolV1Converter.deploy(anchor4.address, contractRegistry.address, 0);
            converter4 = await Contracts.LiquidityPoolV1Converter.deploy(anchor5.address, contractRegistry.address, 0);
            converter5 = await Contracts.LiquidityPoolV1Converter.deploy(anchor6.address, contractRegistry.address, 0);
            converter6 = await Contracts.LiquidityPoolV1Converter.deploy(anchor7.address, contractRegistry.address, 0);

            await converter1.addReserve(anchor4.address, 0x2400);
            await converter2.addReserve(anchor6.address, 0x3600);
            await converter3.addReserve(anchor8.address, 0x4800);
            await converter4.addReserve(anchorA.address, 0x5a00);
            await converter5.addReserve(anchorC.address, 0x6c00);
            await converter6.addReserve(anchorE.address, 0x7e00);

            await converter1.addReserve(anchor1.address, 0x2100);
            await converter2.addReserve(anchor1.address, 0x3100);
            await converter3.addReserve(anchor1.address, 0x4100);
            await converter4.addReserve(anchor1.address, 0x5100);
            await converter5.addReserve(anchor1.address, 0x6100);
            await converter6.addReserve(anchor2.address, 0x7200);

            await anchor2.transferOwnership(converter1.address);
            await anchor3.transferOwnership(converter2.address);
            await anchor4.transferOwnership(converter3.address);
            await anchor5.transferOwnership(converter4.address);
            await anchor6.transferOwnership(converter5.address);
            await anchor7.transferOwnership(converter6.address);

            await converter1.acceptAnchorOwnership();
            await converter2.acceptAnchorOwnership();
            await converter3.acceptAnchorOwnership();
            await converter4.acceptAnchorOwnership();
            await converter5.acceptAnchorOwnership();
            await converter6.acceptAnchorOwnership();
        });

        const addConverters = async () => {
            await testAdd(converter1);
            await testAdd(converter2);
            await testAdd(converter3);
            await testAdd(converter4);
            await testAdd(converter5);
            await testAdd(converter6);
        };

        const removeConverters = async () => {
            await testRemove(converter1);
            await testRemove(converter2);
            await testRemove(converter3);
            await testRemove(converter4);
            await testRemove(converter5);
            await testRemove(converter6);
        };

        it('should add converters', async () => {
            await addConverters();
        });

        context('with registered converters', async () => {
            beforeEach(async () => {
                await addConverters();
            });

            it('should not allow to add the same converter twice', async () => {
                await expect(converterRegistry.addConverter(converter1.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter2.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter3.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter4.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter5.address)).to.be.revertedWith('ERR_INVALID_ITEM');
                await expect(converterRegistry.addConverter(converter6.address)).to.be.revertedWith('ERR_INVALID_ITEM');
            });

            it('should find liquidity pool by its configuration', async () => {
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchor4.address],
                        [0x2400, 0x2100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchor6.address],
                        [0x3600, 0x3100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchorA.address],
                        [0x5a00, 0x5100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchor8.address],
                        [0x4800, 0x4100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchorC.address],
                        [0x6c00, 0x6100]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor2.address, anchorE.address],
                        [0x7e00, 0x7200]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor4.address, anchor1.address],
                        [0x2100, 0x2400]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor6.address, anchor1.address],
                        [0x3100, 0x3600]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor8.address, anchor1.address],
                        [0x4100, 0x4800]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchorA.address, anchor1.address],
                        [0x5100, 0x5a00]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchorC.address, anchor1.address],
                        [0x6100, 0x6c00]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchorE.address, anchor2.address],
                        [0x7200, 0x7e00]
                    )
                ).to.eql(Constants.ZERO_ADDRESS);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchor4.address],
                        [0x2100, 0x2400]
                    )
                ).to.eql(anchor2.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchor6.address],
                        [0x3100, 0x3600]
                    )
                ).to.eql(anchor3.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchor8.address],
                        [0x4100, 0x4800]
                    )
                ).to.eql(anchor4.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchorA.address],
                        [0x5100, 0x5a00]
                    )
                ).to.eql(anchor5.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor1.address, anchorC.address],
                        [0x6100, 0x6c00]
                    )
                ).to.eql(anchor6.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor2.address, anchorE.address],
                        [0x7200, 0x7e00]
                    )
                ).to.eql(anchor7.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor4.address, anchor1.address],
                        [0x2400, 0x2100]
                    )
                ).to.eql(anchor2.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor6.address, anchor1.address],
                        [0x3600, 0x3100]
                    )
                ).to.eql(anchor3.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchor8.address, anchor1.address],
                        [0x4800, 0x4100]
                    )
                ).to.eql(anchor4.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchorA.address, anchor1.address],
                        [0x5a00, 0x5100]
                    )
                ).to.eql(anchor5.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchorC.address, anchor1.address],
                        [0x6c00, 0x6100]
                    )
                ).to.eql(anchor6.address);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [anchorE.address, anchor2.address],
                        [0x7e00, 0x7200]
                    )
                ).to.eql(anchor7.address);
            });

            it('should return a list of converters for a list of anchors', async () => {
                const tokens = [anchor2.address, anchor3.address, anchor4.address];
                const expected = [converter1.address, converter2.address, converter3.address];
                const actual = await converterRegistry.getConvertersByAnchors(tokens);
                expect(actual).to.deep.equal(expected);
            });

            it('should remove converters', async () => {
                await removeConverters();
            });

            context('with unregistered converters', async () => {
                beforeEach(async () => {
                    await removeConverters();
                });

                it('should not allow to remove the same converter twice', async () => {
                    await expect(converterRegistry.removeConverter(converter1.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter2.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter3.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter4.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter5.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                    await expect(converterRegistry.removeConverter(converter6.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                });

                it('should not be able to find liquidity pool by its configuration', async () => {
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchor4.address],
                            [0x2400, 0x2100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchor6.address],
                            [0x3600, 0x3100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchor8.address],
                            [0x4800, 0x4100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchorA.address],
                            [0x5a00, 0x5100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchorC.address],
                            [0x6c00, 0x6100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor2.address, anchorE.address],
                            [0x7e00, 0x7200]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor4.address, anchor1.address],
                            [0x2100, 0x2400]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor6.address, anchor1.address],
                            [0x3100, 0x3600]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor8.address, anchor1.address],
                            [0x4100, 0x4800]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchorA.address, anchor1.address],
                            [0x5100, 0x5a00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchorC.address, anchor1.address],
                            [0x6100, 0x6c00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchorE.address, anchor2.address],
                            [0x7200, 0x7e00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchor4.address],
                            [0x2100, 0x2400]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchor6.address],
                            [0x3100, 0x3600]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchor8.address],
                            [0x4100, 0x4800]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchorA.address],
                            [0x5100, 0x5a00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor1.address, anchorC.address],
                            [0x6100, 0x6c00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor2.address, anchorE.address],
                            [0x7200, 0x7e00]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor4.address, anchor1.address],
                            [0x2400, 0x2100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor6.address, anchor1.address],
                            [0x3600, 0x3100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchor8.address, anchor1.address],
                            [0x4800, 0x4100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchorA.address, anchor1.address],
                            [0x5a00, 0x5100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchorC.address, anchor1.address],
                            [0x6c00, 0x6100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [anchorE.address, anchor2.address],
                            [0x7e00, 0x7200]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                });
            });
        });
    });

    describe('create new converters', () => {
        const testCreate = async (
            type: any,
            name: any,
            symbol: any,
            decimals: any,
            maxConversionFee: any,
            reserveTokens: any,
            reserveWeights: any
        ) => {
            const res = await converterRegistry.newConverter(
                type,
                name,
                symbol,
                decimals,
                maxConversionFee,
                reserveTokens,
                reserveWeights
            );
            const converter = await Contracts.ConverterBase.attach(await converterRegistry.createdConverter());
            await testEvents(res, converter, 'Added');

            await converter.acceptOwnership();
        };

        let erc20Token1: TestStandardToken;
        let erc20Token2: TestStandardToken;

        beforeEach(async () => {
            erc20Token1 = await Contracts.TestStandardToken.deploy('TKN1', 'ET1', 18, 1000000000);
            erc20Token2 = await Contracts.TestStandardToken.deploy('TKN2', 'ET2', 18, 1000000000);
        });

        const createConverters = async () => {
            await testCreate(
                1,
                'Pool1',
                'ST4',
                18,
                0,
                [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                [0x4000, 0x4100]
            );
            await testCreate(1, 'Pool2', 'ST5', 18, 0, [erc20Token1.address, erc20Token2.address], [0x5100, 0x5200]);
            await testCreate(
                1,
                'Pool3',
                'ST6',
                18,
                0,
                [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                [0x6200, 0x6000]
            );
            await testCreate(
                3,
                'Pool7',
                'STA',
                18,
                0,
                [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                [500000, 500000]
            );
            await testCreate(3, 'Pool8', 'STB', 18, 0, [erc20Token1.address, erc20Token2.address], [500000, 500000]);
            await testCreate(
                3,
                'Pool9',
                'STC',
                18,
                0,
                [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                [500000, 500000]
            );
        };

        it('should create converters', async () => {
            await createConverters();
        });

        context('with created converters', async () => {
            const removeConverters = async () => {
                for (const converter of converters) {
                    await testRemove(converter);
                }
            };

            let converters: ConverterBase[];
            let anchors: string[];

            beforeEach(async () => {
                await createConverters();

                anchors = await converterRegistry.getAnchors();
                const converterAnchors = await Promise.all(
                    anchors.map((anchor) => ethers.getContractAt('IConverterAnchor', anchor))
                );
                const converterAddresses = await Promise.all(converterAnchors.map((anchor) => anchor.owner()));
                converters = await Promise.all(
                    converterAddresses.map((address: string) => Contracts.ConverterBase.attach(address))
                );
            });

            it('should not allow to add the same converter twice', async () => {
                for (const converter of converters) {
                    await expect(converterRegistry.addConverter(converter.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                }
            });

            it('should find liquidity pool by its configuration', async () => {
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                        [0x4000, 0x4100]
                    )
                ).to.eql(anchors[0]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [erc20Token1.address, erc20Token2.address],
                        [0x5100, 0x5200]
                    )
                ).to.eql(anchors[1]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        1,
                        [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                        [0x6200, 0x6000]
                    )
                ).to.eql(anchors[2]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        3,
                        [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                        [500000, 500000]
                    )
                ).to.eql(anchors[3]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        3,
                        [erc20Token1.address, erc20Token2.address],
                        [500000, 500000]
                    )
                ).to.eql(anchors[4]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        3,
                        [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                        [500000, 500000]
                    )
                ).to.eql(anchors[5]);
            });

            it('should return a list of converters for a list of anchors', async () => {
                expect(await converterRegistry.getConvertersByAnchors(anchors)).to.have.members(
                    converters.map((converter) => converter.address)
                );
            });

            it('should remove converters', async () => {
                await removeConverters();
            });

            context('with removed converters', async () => {
                beforeEach(async () => {
                    await removeConverters();
                });

                it('should not allow to remove the same converter twice', async () => {
                    for (const converter of converters) {
                        await expect(converterRegistry.removeConverter(converter.address)).to.be.revertedWith(
                            'ERR_INVALID_ITEM'
                        );
                    }
                });

                it('should not be able to find liquidity pool by its configuration', async () => {
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                            [0x4000, 0x4100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [erc20Token1.address, erc20Token2.address],
                            [0x5100, 0x5200]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            1,
                            [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                            [0x6200, 0x6000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            2,
                            [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                            [0x4000, 0x4100]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            2,
                            [erc20Token1.address, erc20Token2.address],
                            [0x5100, 0x5200]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            2,
                            [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                            [0x6200, 0x6000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            3,
                            [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                            [500000, 500000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            3,
                            [erc20Token1.address, erc20Token2.address],
                            [500000, 500000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            3,
                            [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                            [500000, 500000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                });
            });
        });
    });

    describe('create new standard converters of type 1', () => {
        const testCreate = async (
            type: any,
            name: any,
            symbol: any,
            decimals: any,
            maxConversionFee: any,
            reserveTokens: any,
            reserveWeights: any
        ) => {
            const res = await converterRegistry.newConverter(
                type,
                name,
                symbol,
                decimals,
                maxConversionFee,
                reserveTokens,
                reserveWeights
            );
            const converter = await Contracts.ConverterBase.attach(await converterRegistry.createdConverter());
            await testEvents(res, converter, 'Added');

            await converter.acceptOwnership();
        };

        let erc20Token1: TestStandardToken;
        let erc20Token2: TestStandardToken;

        beforeEach(async () => {
            erc20Token1 = await Contracts.TestStandardToken.deploy('TKN1', 'ET1', 18, 1000000000);
            erc20Token2 = await Contracts.TestStandardToken.deploy('TKN2', 'ET2', 18, 1000000000);
        });

        const createConverters = async () => {
            await testCreate(
                1,
                'Pool1',
                'ST4',
                18,
                0,
                [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                [500000, 500000]
            );
            await testCreate(1, 'Pool2', 'ST5', 18, 0, [erc20Token1.address, erc20Token2.address], [500000, 500000]);
            await testCreate(
                1,
                'Pool3',
                'ST6',
                18,
                0,
                [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                [500000, 500000]
            );
        };

        it('should create converters', async () => {
            await createConverters();
        });

        context('with created converters', async () => {
            const removeConverters = async () => {
                for (const converter of converters) {
                    await testRemove(converter);
                }
            };

            let converters: ConverterBase[];
            let anchors: string[];

            beforeEach(async () => {
                await createConverters();

                anchors = await converterRegistry.getAnchors();
                const converterAnchors = await Promise.all(
                    anchors.map((anchor) => ethers.getContractAt('IConverterAnchor', anchor))
                );
                const converterAddresses = await Promise.all(converterAnchors.map((anchor) => anchor.owner()));
                converters = await Promise.all(
                    converterAddresses.map((address) => Contracts.ConverterBase.attach(address))
                );
            });

            it('should not allow to add the same converter twice', async () => {
                for (const converter of converters) {
                    await expect(converterRegistry.addConverter(converter.address)).to.be.revertedWith(
                        'ERR_INVALID_ITEM'
                    );
                }
            });

            it('should find liquidity pool by its configuration', async () => {
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        3,
                        [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                        [500000, 500000]
                    )
                ).to.eql(anchors[0]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        3,
                        [erc20Token1.address, erc20Token2.address],
                        [500000, 500000]
                    )
                ).to.eql(anchors[1]);
                expect(
                    await converterRegistry.getLiquidityPoolByConfig(
                        3,
                        [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                        [500000, 500000]
                    )
                ).to.eql(anchors[2]);
            });

            it('should return a list of converters for a list of anchors', async () => {
                expect(await converterRegistry.getConvertersByAnchors(anchors)).to.have.members(
                    converters.map((converter) => converter.address)
                );
            });

            it('should remove converters', async () => {
                await removeConverters();
            });

            context('with removed converters', async () => {
                beforeEach(async () => {
                    await removeConverters();
                });

                it('should not allow to remove the same converter twice', async () => {
                    for (const converter of converters) {
                        await expect(converterRegistry.removeConverter(converter.address)).to.be.revertedWith(
                            'ERR_INVALID_ITEM'
                        );
                    }
                });

                it('should not be able to find liquidity pool by its configuration', async () => {
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            3,
                            [Constants.NATIVE_TOKEN_ADDRESS, erc20Token1.address],
                            [500000, 500000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            3,
                            [erc20Token1.address, erc20Token2.address],
                            [500000, 500000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                    expect(
                        await converterRegistry.getLiquidityPoolByConfig(
                            3,
                            [erc20Token2.address, Constants.NATIVE_TOKEN_ADDRESS],
                            [500000, 500000]
                        )
                    ).to.eql(Constants.ZERO_ADDRESS);
                });
            });
        });
    });
});
