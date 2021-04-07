import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import MathUtils from './helpers/MathUtils';
import Utils from './helpers/Utils';
import Constants from './helpers/Constants';

import Contracts from './helpers/Contracts';

let now: any;
let bancorNetwork: any;
let networkSettings: any;
let converterUpgrader: any;
let token: any;
let tokenAddress: any;
let contractRegistry: any;
let reserveToken: any;
let reserveToken2: any;
let upgrader: any;
let sender: any;
let sender2: any;
let networkFeeWallet: any;
let accounts: any;

const ONE_TOKEN = BigNumber.from(10).pow(BigNumber.from(18));
const TOTAL_SUPPLY = ONE_TOKEN.mul(1000000);
const MIN_RETURN = BigNumber.from(1);
const MAX_CONVERSION_FEE = BigNumber.from(1000000);

describe('StandardPoolConverter', () => {
    const createPool = async (options: any = {}) => {
        const { disabled, ethIndex, networkFeePercent, conversionFeePercent } = options;

        const poolToken = await Contracts.DSToken.deploy('PT', 'PT', 18);
        let reserveToken1;
        let reserveToken2;

        switch (ethIndex) {
            case 0:
                reserveToken1 = await Contracts.TestStandardToken.deploy('RSV1', 'RSV1', 18, TOTAL_SUPPLY);
                reserveToken2 = await Contracts.TestStandardToken.deploy('RSV2', 'RSV2', 18, TOTAL_SUPPLY);
                break;
            case 1:
                reserveToken1 = { address: Constants.NATIVE_TOKEN_ADDRESS };
                reserveToken2 = await Contracts.TestStandardToken.deploy('RSV2', 'RSV2', 18, TOTAL_SUPPLY);
                break;
            case 2:
                reserveToken1 = await Contracts.TestStandardToken.deploy('RSV1', 'RSV1', 18, TOTAL_SUPPLY);
                reserveToken2 = { address: Constants.NATIVE_TOKEN_ADDRESS };
                break;
            default:
                throw new Error(`Unexpected ethIndex ${ethIndex}`);
        }

        const converter = await Contracts.TestStandardPoolConverter.deploy(
            poolToken.address,
            contractRegistry.address,
            MAX_CONVERSION_FEE
        );

        if (networkFeePercent) {
            await networkSettings.setNetworkFee(networkFeePercent * 10000);
        }

        if (conversionFeePercent) {
            await converter.setConversionFee(conversionFeePercent * 10000);
        }

        await converter.addReserve(reserveToken1.address, 500000);
        await converter.addReserve(reserveToken2.address, 500000);

        if (!disabled) {
            await poolToken.transferOwnership(converter.address);
            await converter.acceptTokenOwnership();
        }

        now = await Utils.latest();
        await converter.setTime(now);

        return { poolToken, reserveToken1, reserveToken2, converter };
    };

    const addLiquidity = async (converter: any, reserveToken1: any, reserveToken2: any, reserveAmounts: any) => {
        const { transactionCost: approveTransactionCost } = await approve(reserveToken1, converter, reserveAmounts[0]);
        const { transactionCost: approveTransactionCost2 } = await approve(reserveToken2, converter, reserveAmounts[1]);

        let value = BigNumber.from(0);
        if (reserveToken1.address === Constants.NATIVE_TOKEN_ADDRESS) {
            value = reserveAmounts[0];
        } else if (reserveToken2.address === Constants.NATIVE_TOKEN_ADDRESS) {
            value = reserveAmounts[1];
        }

        const res = await converter.addLiquidity(
            [reserveToken1.address, reserveToken2.address],
            reserveAmounts,
            MIN_RETURN,
            {
                value: value
            }
        );

        return {
            res,
            transactionCost: approveTransactionCost.add(approveTransactionCost2).add(await getTransactionCost(res))
        };
    };

    const removeLiquidity = async (converter: any, reserveToken1: any, reserveToken2: any, amount: any) => {
        const res = await converter.removeLiquidity(
            amount,
            [reserveToken1.address, reserveToken2.address],
            [MIN_RETURN, MIN_RETURN]
        );
        return { res, transactionCost: await getTransactionCost(res) };
    };

    const convert = async (conversionPath: any, amount: any, minReturn: any) => {
        const [sourceToken, poolToken] = conversionPath;
        await approve(sourceToken, bancorNetwork, amount);

        const value = sourceToken.address === Constants.NATIVE_TOKEN_ADDRESS ? amount : 0;
        const conversionPathAddresses = conversionPath.map((token: any) => token.address);
        const res = await bancorNetwork.convertByPath2(
            conversionPathAddresses,
            amount,
            minReturn,
            Constants.ZERO_ADDRESS,
            {
                value
            }
        );

        const converter = await Contracts.TestStandardPoolConverter.attach(await poolToken.owner());

        const filter = converter.filters.Conversion(null, null, null, null, null, null);
        const events = await converter.queryFilter(filter, res.blockNumber, res.blockNumber);

        const args = events.slice(-1)[0].args;
        return { res, amount: args._return, fee: args._conversionFee };
    };

    const getBalance = async (reserveToken: any, account: any) => {
        const reserveTokenAddress = reserveToken.address || reserveToken;
        const address = account.address || account;

        if (reserveTokenAddress === Constants.NATIVE_TOKEN_ADDRESS) {
            return ethers.provider.getBalance(address);
        }

        if (typeof reserveToken === 'string') {
            const token = await Contracts.TestStandardToken.attach(reserveToken);
            return await token.balanceOf(address);
        }

        return reserveToken.balanceOf(address);
    };

    const getAllowance = async (reserveToken: any, account: any) => {
        const reserveTokenAddress = reserveToken.address || reserveToken;
        if (reserveTokenAddress === Constants.NATIVE_TOKEN_ADDRESS) {
            return BigNumber.from(0);
        }

        const address = account.address || account;
        if (typeof reserveToken === 'string') {
            const token = await Contracts.TestStandardToken.attach(reserveToken);
            return token.allowance(sender.address, address);
        }

        return reserveToken.allowance(sender.address, address);
    };

    const approve = async (reserveToken: any, account: any, amount: any, options: any = {}) => {
        let transactionCost = BigNumber.from(0);

        const reserveTokenAddress = reserveToken.address || reserveToken;
        if (reserveTokenAddress === Constants.NATIVE_TOKEN_ADDRESS) {
            return { transactionCost };
        }

        if (!options.from) {
            options.from = sender.address;
        }

        const address = account.address || account;

        if (typeof reserveToken === 'string') {
            const token = await Contracts.TestStandardToken.attach(reserveToken);
            let res = await token.approve(address, 0, options);
            transactionCost = transactionCost.add(await getTransactionCost(res));

            res = await token.approve(address, amount, options);
            transactionCost = transactionCost.add(await getTransactionCost(res));

            return { transactionCost };
        }

        let res = await reserveToken.approve(address, 0, options);
        transactionCost = transactionCost.add(await getTransactionCost(res));

        res = await reserveToken.approve(address, amount, options);
        transactionCost = transactionCost.add(await getTransactionCost(res));

        return { transactionCost };
    };

    const transfer = async (reserveToken: any, account: any, amount: any) => {
        const reserveTokenAddress = reserveToken.address || reserveToken;
        if (reserveTokenAddress === Constants.NATIVE_TOKEN_ADDRESS) {
            return await sender.sendTransaction({ to: account.address, value: amount });
        }

        const address = account.address || account;

        if (typeof reserveToken === 'string') {
            const token = await Contracts.TestStandardToken.attach(reserveToken);
            return await token.transfer(address, amount);
        }

        return await reserveToken.transfer(address, amount);
    };

    const getTransactionCost = async (txResult: any) => {
        const cumulativeGasUsed = (await txResult.wait()).cumulativeGasUsed;
        return BigNumber.from(txResult.gasPrice).mul(BigNumber.from(cumulativeGasUsed));
    };

    before(async () => {
        accounts = await ethers.getSigners();

        sender = accounts[0];
        networkFeeWallet = accounts[1];

        // The following contracts are unaffected by the underlying tests, this can be shared.
        contractRegistry = await Contracts.ContractRegistry.deploy();

        converterUpgrader = await Contracts.ConverterUpgrader.deploy(contractRegistry.address);
        await contractRegistry.registerAddress(Constants.registry.CONVERTER_UPGRADER, converterUpgrader.address);

        const factory = await Contracts.ConverterFactory.deploy();
        await contractRegistry.registerAddress(Constants.registry.CONVERTER_FACTORY, factory.address);

        await factory.registerTypedConverterFactory((await Contracts.StandardPoolConverterFactory.deploy()).address);
    });

    beforeEach(async () => {
        bancorNetwork = await Contracts.BancorNetwork.deploy(contractRegistry.address);
        await contractRegistry.registerAddress(Constants.registry.BANCOR_NETWORK, bancorNetwork.address);

        networkSettings = await Contracts.NetworkSettings.deploy(networkFeeWallet.address, 0);
        await contractRegistry.registerAddress(Constants.registry.NETWORK_SETTINGS, networkSettings.address);
    });

    const upgradeConverter = async (upgrader: any, converter: any) => {
        let res;

        // For versions 11 or higher, we just call upgrade on the converter.
        if (converter.upgrade) {
            res = await converter.upgrade();
        } else {
            // For previous versions we transfer ownership to the upgrader, then call upgradeOld on the upgrader,
            // then accept ownership of the new and old converter. The end results should be the same.
            await converter.transferOwnership(upgrader.address);
            res = await upgrader.upgradeOld(converter.address, ethers.utils.formatBytes32String(''));
            await converter.acceptOwnership();
        }
        let tx = await res.wait();
        const logs = tx.logs.filter((log: any) => log.event === 'ConverterUpgrade');
        expect(logs.length).to.be.at.most(1);

        if (logs.length === 1) {
            return Contracts.TestStandardPoolConverter.attach(logs[0].args._newConverter);
        }

        const events = await upgrader.queryFilter('ConverterUpgrade', tx.blockNumber, tx.blockNumber);

        return Contracts.TestStandardPoolConverter.attach(events[0].args._newConverter);
    };

    for (const ethIndex of [0, 1, 2]) {
        const ethIndexDescription = () => {
            switch (ethIndex) {
                case 0:
                    return 'with [ERC20, ERC20] reserves';

                case 1:
                    return 'with [ETH, ERC20] reserve';

                case 2:
                    return 'with [ERC20, ETH] reserve';

                default:
                    throw new Error(`Unexpected ethIndex ${ethIndex}`);
            }
        };

        context(ethIndexDescription(), () => {
            describe('construction', () => {
                it('verifies the Activation event after converter activation', async () => {
                    const { converter, poolToken } = await createPool({ ethIndex, disabled: true });
                    await poolToken.transferOwnership(converter.address);
                    const res = await converter.acceptTokenOwnership();

                    expect(res).to.emit(converter, 'Activation').withArgs(BigNumber.from(3), poolToken.address, true);
                });
            });

            describe('source and target amounts and fees', () => {
                const expectAlmostEqual = (amount1: any, amount2: any, maxError: any) => {
                    if (!amount1.eq(amount2)) {
                        const error = new MathUtils.Decimal(amount1.toString()).div(amount2.toString()).sub(1).abs();
                        expect(error.lte(maxError)).to.be.equal(true, `error = ${error.toFixed(maxError.length)}`);
                    }
                };

                for (const amount of [0, 500, 1234, 5678, 9999, 12345, 98765]) {
                    for (const conversionFeePercent of [0, 5, 10, 25]) {
                        context(`when amount = ${amount}, conversionFeePercent = ${conversionFeePercent}%`, () => {
                            let converter: any;
                            let reserveToken1: any;
                            let reserveToken2: any;

                            beforeEach(async () => {
                                ({ converter, reserveToken1, reserveToken2 } = await createPool({
                                    ethIndex,
                                    conversionFeePercent
                                }));

                                await addLiquidity(converter, reserveToken1, reserveToken2, [
                                    BigNumber.from(1000000000),
                                    BigNumber.from(1000000000)
                                ]);
                            });

                            it('verifies sourceAmountAndFee', async () => {
                                const targetAmountAndFee = await converter.callStatic.targetAmountAndFee(
                                    reserveToken1.address,
                                    reserveToken2.address,
                                    amount
                                );

                                const sourceAmountAndFee = await converter.callStatic.sourceAmountAndFee(
                                    reserveToken1.address,
                                    reserveToken2.address,
                                    targetAmountAndFee[0]
                                );

                                expectAlmostEqual(sourceAmountAndFee[0], BigNumber.from(amount), '0.003');
                                expect(sourceAmountAndFee[1]).to.be.gte(targetAmountAndFee[1]);
                                expect(sourceAmountAndFee[1]).to.be.lte(targetAmountAndFee[1].add(1));
                            });
                        });
                    }
                }
            });

            describe('conversion', () => {
                let converter: any;
                let poolToken: any;
                let reserveToken1: any;
                let reserveToken2: any;

                beforeEach(async () => {
                    ({ converter, poolToken, reserveToken1, reserveToken2 } = await createPool({
                        ethIndex,
                        conversionFeePercent: 0.3
                    }));

                    await addLiquidity(converter, reserveToken1, reserveToken2, [
                        BigNumber.from(1000000000),
                        BigNumber.from(1000000000)
                    ]);
                });

                it('verifies that convert returns valid amount and fee after converting', async () => {
                    const amount = BigNumber.from(500);
                    const purchaseAmount = (
                        await converter.callStatic.targetAmountAndFee(
                            reserveToken1.address,
                            reserveToken2.address,
                            amount
                        )
                    )[0];

                    const { res } = await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);

                    expect(res)
                        .to.emit(bancorNetwork, 'Conversion')
                        .withArgs(
                            poolToken.address,
                            reserveToken1.address,
                            reserveToken2.address,
                            amount,
                            purchaseAmount,
                            sender.address
                        );
                });

                it('verifies the TokenRateUpdate event after conversion', async () => {
                    const amount = BigNumber.from(500);

                    const { res } = await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);

                    const poolTokenSupply = await poolToken.totalSupply();
                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    const filter = converter.filters.TokenRateUpdate(null, null, null, null);
                    const events = await converter.queryFilter(filter, res.blockNumber, res.blockNumber);

                    // TokenRateUpdate for [source, target):
                    const { args: event1 } = events[0];
                    expect(event1._token1).to.eql(reserveToken1.address);
                    expect(event1._token2).to.eql(reserveToken2.address);
                    expect(event1._rateN).to.be.equal(reserve2Balance);
                    expect(event1._rateD).to.be.equal(reserve1Balance);

                    // TokenRateUpdate for [source, pool token):
                    const { args: event2 } = events[1];
                    expect(event2._token1).to.eql(poolToken.address);
                    expect(event2._token2).to.eql(reserveToken1.address);
                    expect(event2._rateN).to.be.equal(reserve1Balance);
                    expect(event2._rateD).to.be.equal(poolTokenSupply);

                    // TokenRateUpdate for [pool token, target):
                    const { args: event3 } = events[2];
                    expect(event3._token1).to.eql(poolToken.address);
                    expect(event3._token2).to.eql(reserveToken2.address);
                    expect(event3._rateN).to.be.equal(reserve2Balance);
                    expect(event3._rateD).to.be.equal(poolTokenSupply);
                });

                it('should revert when attempting to convert when the return is smaller than the minimum requested amount', async () => {
                    const amount = BigNumber.from(500);

                    await expect(convert([reserveToken1, poolToken, reserveToken2], amount, 200000)).to.be.revertedWith(
                        'ERR_RETURN_TOO_LOW'
                    );
                });
            });

            describe('recent average rate', () => {
                const AVERAGE_RATE_PERIOD = Utils.duration.minutes(10);

                let converter: any;
                let poolToken: any;
                let reserveToken1: any;
                let reserveToken2: any;

                beforeEach(async () => {
                    ({ converter, poolToken, reserveToken1, reserveToken2 } = await createPool({
                        ethIndex,
                        conversionFeePercent: 0.3
                    }));

                    await addLiquidity(converter, reserveToken1, reserveToken2, [
                        BigNumber.from(1000000000),
                        BigNumber.from(1000000000)
                    ]);
                });

                const getExpectedAverageRate = (prevAverageRate: any, currentRate: any, timeElapsed: any) => {
                    if (timeElapsed.eq(BigNumber.from(0))) {
                        return prevAverageRate;
                    }

                    if (timeElapsed.gte(AVERAGE_RATE_PERIOD)) {
                        return currentRate;
                    }

                    const newAverageRateN = prevAverageRate.n
                        .mul(currentRate.d)
                        .mul(AVERAGE_RATE_PERIOD.sub(timeElapsed))
                        .add(prevAverageRate.d.mul(currentRate.n).mul(timeElapsed));
                    const newAverageRateD = AVERAGE_RATE_PERIOD.mul(prevAverageRate.d).mul(currentRate.d);

                    return { n: newAverageRateN, d: newAverageRateD };
                };

                const expectRatesAlmostEqual = (rate: any, newRate: any) => {
                    const rate1 = new MathUtils.Decimal(rate.n.toString()).div(
                        new MathUtils.Decimal(rate.d.toString())
                    );
                    const rate2 = new MathUtils.Decimal(newRate.n.toString()).div(
                        new MathUtils.Decimal(newRate.d.toString())
                    );

                    if (!rate1.eq(rate2)) {
                        const error = new MathUtils.Decimal(rate1.toString()).div(rate2.toString()).sub(1).abs();
                        expect(error.lte('0.000002')).to.be.equal(true, `error = ${error.toFixed(10)}`);
                    }
                };

                const getCurrentRate = async (reserveToken1: any, reserveToken2: any) => {
                    const balance1 = await converter.callStatic.reserveBalance(reserveToken1.address || reserveToken1);
                    const balance2 = await converter.callStatic.reserveBalance(reserveToken2.address || reserveToken2);
                    return { n: balance2, d: balance1 };
                };

                const getAverageRate = async (reserveToken: any) => {
                    const averageRate = await converter.callStatic.recentAverageRate(
                        reserveToken.address || reserveToken
                    );
                    return { n: averageRate[0], d: averageRate[1] };
                };

                const getPrevAverageRate = async () => {
                    const averageRateInfo = await converter.callStatic.averageRateInfo();
                    return { n: averageRateInfo.shr(112).mask(112), d: averageRateInfo.mask(112) };
                };

                const getPrevAverageRateUpdateTime = async () => {
                    const averageRateInfo = await converter.callStatic.averageRateInfo();
                    return averageRateInfo.shr(224);
                };

                it('should revert when requesting the average rate for a non reserve token', async () => {
                    await expect(converter.callStatic.recentAverageRate(accounts[7].address)).to.be.revertedWith(
                        'ERR_INVALID_RESERVE'
                    );
                });

                it('should be initially equal to the current rate', async () => {
                    const averageRate = await getAverageRate(reserveToken1);
                    const currentRate = await getCurrentRate(reserveToken1, reserveToken2);
                    const prevAverageRateUpdateTime = await getPrevAverageRateUpdateTime();

                    expect(averageRate.n.mul(currentRate.d)).to.be.equal(currentRate.n.mul(averageRate.d));
                    expect(prevAverageRateUpdateTime).to.be.equal(BigNumber.from(0));
                });

                it('should change after a conversion', async () => {
                    const amount = BigNumber.from(500);

                    await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);
                    const prevAverageRate = await getAverageRate(reserveToken1);
                    const prevAverageRateUpdateTime = await getPrevAverageRateUpdateTime();

                    await converter.setTime(now.add(Utils.duration.seconds(10)));

                    await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);
                    const averageRate = await getAverageRate(reserveToken1);
                    const averageRateUpdateTime = await getPrevAverageRateUpdateTime();

                    expect(averageRate.n).not.to.be.equal(prevAverageRate.n);
                    expect(averageRate.d).not.to.be.equal(prevAverageRate.d);
                    expect(averageRateUpdateTime).not.to.be.equal(prevAverageRateUpdateTime);
                });

                it('should be identical to the current rate after the full average rate period has passed', async () => {
                    const amount = BigNumber.from(500);

                    // set initial rate
                    await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);

                    let converterTime = now.add(Utils.duration.seconds(10));
                    await converter.setTime(converterTime);
                    await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);

                    const currentRate = await getCurrentRate(reserveToken1, reserveToken2);
                    let averageRate = await getAverageRate(reserveToken1);

                    expect(averageRate.n).not.to.be.equal(currentRate.n);
                    expect(averageRate.d).not.to.be.equal(currentRate.d);

                    converterTime = converterTime.add(AVERAGE_RATE_PERIOD);
                    await converter.setTime(converterTime);
                    averageRate = await getAverageRate(reserveToken1);

                    expect(averageRate.n).to.be.equal(currentRate.n);
                    expect(averageRate.d).to.be.equal(currentRate.d);
                });

                for (const seconds of [0, 1, 2, 3, 10, 100, 200, 300, 400, 500]) {
                    const timeElapsed = Utils.duration.seconds(seconds);
                    context(`${timeElapsed.toString()} seconds after conversion`, async () => {
                        beforeEach(async () => {
                            const amount = BigNumber.from(500);

                            // set initial rate (a second ago)
                            await converter.setTime(now.sub(Utils.duration.seconds(1)));
                            await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);

                            // reset converter time to current time
                            await converter.setTime(now);

                            // convert
                            await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);

                            // increase the current time
                            await converter.setTime(now.add(timeElapsed));
                        });

                        it('should properly calculate the average rate', async () => {
                            const amount = BigNumber.from(1000);

                            const prevAverageRate = await getPrevAverageRate();
                            const currentRate = await getCurrentRate(reserveToken1, reserveToken2);
                            const expectedAverageRate = getExpectedAverageRate(
                                prevAverageRate,
                                currentRate,
                                timeElapsed
                            );
                            await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);
                            const averageRate = await getAverageRate(reserveToken1);

                            expectRatesAlmostEqual(averageRate, expectedAverageRate);
                        });

                        it('should not change more than once in a block', async () => {
                            const amount = BigNumber.from(1000);

                            await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);
                            const averageRate = await getAverageRate(reserveToken1);

                            for (let i = 0; i < 5; i++) {
                                await convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN);
                                const averageRate2 = await getAverageRate(reserveToken1);

                                expect(averageRate.n).to.be.equal(averageRate2.n);
                                expect(averageRate.d).to.be.equal(averageRate2.d);
                            }
                        });

                        it('should change after some time with no conversions', async () => {
                            const prevAverageRate = await getPrevAverageRate();
                            const currentRate = await getCurrentRate(reserveToken1, reserveToken2);

                            for (let i = 0; i < 10; i++) {
                                // increase the current time and verify that the average rate is updated accordingly
                                const delta = Utils.duration.seconds(10).mul(BigNumber.from(i));
                                const totalElapsedTime = timeElapsed.add(delta);
                                await converter.setTime(now.add(totalElapsedTime));

                                const expectedAverageRate = getExpectedAverageRate(
                                    prevAverageRate,
                                    currentRate,
                                    totalElapsedTime
                                );
                                const averageRate = await getAverageRate(reserveToken1);

                                expectRatesAlmostEqual(averageRate, expectedAverageRate);
                            }
                        });
                    });
                }
            });

            describe('add/remove liquidity', () => {
                const getLiquidityCosts = async (
                    firstTime: any,
                    converter: any,
                    reserveTokens: any,
                    reserveAmounts: any
                ) => {
                    if (firstTime) {
                        return reserveAmounts.map((reserveAmount: any, i: any) => reserveAmounts);
                    }

                    return await Promise.all(
                        reserveAmounts.map((reserveAmount: any, i: any) =>
                            converter.addLiquidityCost(
                                reserveTokens.map((reserveToken: any) => reserveToken.address || reserveToken),
                                i,
                                reserveAmount
                            )
                        )
                    );
                };

                const getLiquidityReturn = async (
                    firstTime: any,
                    converter: any,
                    reserveTokens: any,
                    reserveAmounts: any
                ) => {
                    if (firstTime) {
                        const length = Math.round(
                            reserveAmounts.map((reserveAmount: any) => reserveAmount.toString()).join('').length /
                                reserveAmounts.length
                        );
                        return BigNumber.from(10).pow(BigNumber.from(length - 1));
                    }

                    return await converter.addLiquidityReturn(
                        reserveTokens.map((reserveToken: any) => reserveToken.address || reserveToken),
                        reserveAmounts
                    );
                };

                const removeLiquidityTest = async (ethIndex: any, reverse: any = false) => {
                    const { poolToken, reserveToken1, reserveToken2, converter } = await createPool({ ethIndex });
                    const reserveTokens = [reserveToken1, reserveToken2];

                    if (reverse) {
                        reserveTokens.reverse();
                    }

                    const amount = BigNumber.from(100000);
                    await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                    const poolTokenSupply = await poolToken.totalSupply();
                    const reserveBalances = await Promise.all(
                        reserveTokens.map((reserveToken) => converter.reserveBalance(reserveToken.address))
                    );

                    const removeAmount = BigNumber.from(100);
                    const expectedOutputAmounts = reserveBalances.map((reserveBalance) =>
                        reserveBalance.mul(removeAmount).div(poolTokenSupply)
                    );
                    await converter.removeLiquidityTest(
                        removeAmount,
                        reserveTokens.map((reserveToken) => reserveToken.address),
                        [MIN_RETURN, MIN_RETURN]
                    );
                    const actualOutputAmounts = await Promise.all(
                        reserveTokens.map((reserveToken, i) => converter.reserveAmountsRemoved(i))
                    );
                    reserveTokens.map((reserveToken, i) =>
                        expect(actualOutputAmounts[i]).to.be.equal(expectedOutputAmounts[i])
                    );
                };

                let converter: any;
                let poolToken: any;
                let reserveToken1: any;
                let reserveToken2: any;

                beforeEach(async () => {
                    ({ converter, poolToken, reserveToken1, reserveToken2 } = await createPool({ ethIndex }));
                });

                it('verifies function removeLiquidity when the reserves tokens are passed in the initial order', async () => {
                    await removeLiquidityTest(ethIndex);
                });

                it('verifies function removeLiquidity when the reserves tokens are passed in the opposite order', async () => {
                    await removeLiquidityTest(ethIndex, true);
                });

                it('verifies the TokenRateUpdate event after adding liquidity', async () => {
                    const amount = BigNumber.from(500);
                    const { res } = await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                    const poolTokenSupply = await poolToken.totalSupply();
                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    expect(res)
                        .to.emit(converter, 'TokenRateUpdate')
                        .withArgs(poolToken.address, reserveToken1.address, reserve1Balance, poolTokenSupply);

                    expect(res)
                        .to.emit(converter, 'TokenRateUpdate')
                        .withArgs(poolToken.address, reserveToken2.address, reserve2Balance, poolTokenSupply);
                });

                it('verifies the TokenRateUpdate event after removing liquidity', async () => {
                    const amount = BigNumber.from(1000);
                    await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                    const removeAmount = BigNumber.from(100);
                    const { res } = await removeLiquidity(converter, reserveToken1, reserveToken2, removeAmount);

                    const poolTokenSupply = await poolToken.totalSupply();
                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    await converter.reserveWeight(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);
                    await converter.reserveWeight(reserveToken2.address);

                    expect(res)
                        .to.emit(converter, 'TokenRateUpdate')
                        .withArgs(poolToken.address, reserveToken1.address, reserve1Balance, poolTokenSupply);

                    expect(res)
                        .to.emit(converter, 'TokenRateUpdate')
                        .withArgs(poolToken.address, reserveToken2.address, reserve2Balance, poolTokenSupply);
                });

                it('should allow adding and removing liquidity', async () => {
                    const reserveTokens = [reserveToken1, reserveToken2];

                    const state = [];
                    let expected: any = [];
                    let prevSupply = BigNumber.from(0);
                    let prevBalances = reserveTokens.map((reserveToken) => BigNumber.from(0));

                    for (const supplyAmount of [1000000000, 1000000, 2000000, 3000000, 4000000]) {
                        const reserveAmounts = reserveTokens.map((reserveToken, i) =>
                            BigNumber.from(supplyAmount)
                                .mul(BigNumber.from(100 + i))
                                .div(BigNumber.from(100))
                        );
                        await Promise.all(
                            reserveTokens.map((reserveToken, i) =>
                                approve(reserveToken, converter, reserveAmounts[i].mul(BigNumber.from(0)))
                            )
                        );

                        await Promise.all(
                            reserveTokens.map((reserveToken, i) =>
                                approve(reserveToken, converter, reserveAmounts[i].mul(BigNumber.from(1)))
                            )
                        );

                        const liquidityCosts = await getLiquidityCosts(
                            state.length === 0,
                            converter,
                            reserveTokens,
                            reserveAmounts
                        );

                        const liquidityReturn = await getLiquidityReturn(
                            state.length === 0,
                            converter,
                            reserveTokens,
                            reserveAmounts
                        );

                        await addLiquidity(converter, reserveToken1, reserveToken2, reserveAmounts);

                        const allowances = await Promise.all(
                            reserveTokens.map((reserveToken) => getAllowance(reserveToken, converter.address))
                        );
                        const balances = await Promise.all(
                            reserveTokens.map((reserveToken) => getBalance(reserveToken, converter.address))
                        );
                        const supply = await poolToken.totalSupply();

                        state.push({ supply: supply, balances: balances });

                        for (let i = 0; i < allowances.length; i++) {
                            const diff = new MathUtils.Decimal(allowances[i].toString()).div(
                                reserveAmounts[i].toString()
                            );
                            expect(diff.toFixed()).to.be.equal('0');
                        }

                        const actual = balances.map((balance) =>
                            new MathUtils.Decimal(balance.toString()).div(supply.toString())
                        );
                        for (let i = 0; i < expected.length; i++) {
                            const diff = expected[i].div(actual[i]);
                            expect(diff.toFixed()).to.be.equal('1');
                            for (const liquidityCost of liquidityCosts) {
                                expect(liquidityCost[i]).to.be.equal(balances[i].sub(prevBalances[i]));
                            }
                        }

                        expect(liquidityReturn).to.be.equal(supply.sub(prevSupply));

                        expected = actual;
                        prevSupply = supply;
                        prevBalances = balances;
                    }

                    for (let n = state.length - 1; n > 0; n--) {
                        const supplyAmount = state[n].supply.sub(BigNumber.from(state[n - 1].supply));
                        const reserveAmounts = await converter.removeLiquidityReturn(
                            supplyAmount,
                            reserveTokens.map((reserveToken) => reserveToken.address)
                        );
                        await removeLiquidity(converter, reserveToken1, reserveToken2, supplyAmount);

                        const balances = await Promise.all(
                            reserveTokens.map((reserveToken) => getBalance(reserveToken, converter))
                        );
                        for (let i = 0; i < balances.length; i++) {
                            const diff = new MathUtils.Decimal(state[n - 1].balances[i].toString()).div(
                                new MathUtils.Decimal(balances[i].toString())
                            );
                            expect(diff.toFixed()).to.be.equal('1');
                            expect(prevBalances[i].sub(balances[i])).to.be.equal(reserveAmounts[i]);
                        }
                        prevBalances = balances;
                    }

                    const supplyAmount = state[0].supply;
                    const reserveAmounts = await converter.removeLiquidityReturn(
                        supplyAmount,
                        reserveTokens.map((reserveToken) => reserveToken.address)
                    );

                    await removeLiquidity(converter, reserveToken1, reserveToken2, supplyAmount);

                    const balances = await Promise.all(
                        reserveTokens.map((reserveToken) => getBalance(reserveToken, converter.address))
                    );
                    for (let i = 0; i < balances.length; i++) {
                        expect(balances[i]).to.be.equal(BigNumber.from(0));
                        expect(prevBalances[i].sub(balances[i])).to.be.equal(reserveAmounts[i]);
                    }
                });

                it('verifies that addLiquidity gets the correct reserve balance amounts from the caller', async () => {
                    const prevReserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const prevReserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    const token1Amount = BigNumber.from(10000).mul(ONE_TOKEN);
                    const token2Amount = BigNumber.from(20000).mul(ONE_TOKEN);

                    await addLiquidity(converter, reserveToken1, reserveToken2, [token1Amount, token2Amount]);

                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    expect(reserve1Balance).to.be.equal(prevReserve1Balance.add(token1Amount));
                    expect(reserve2Balance).to.be.equal(prevReserve2Balance.add(token2Amount));
                });

                it('should revert when attempting to add liquidity with insufficient funds', async () => {
                    const amount = await getBalance(reserveToken1, sender.address);

                    if (reserveToken1.address !== Constants.NATIVE_TOKEN_ADDRESS) {
                        await expect(
                            addLiquidity(converter, reserveToken1, reserveToken2, [amount.add(BigNumber.from(1)), 1000])
                        ).to.be.revertedWith('SafeMath: subtraction overflow');
                    } else {
                        // Not tested: Ethereum is handling this by itself. Tx doesn't occure if the wallet doesn't have the necessary value + gas.
                        // expect(
                        //     addLiquidity(converter, reserveToken1, reserveToken2, [amount.add(BigNumber.from(1)), 1000])
                        // ).to.throw;
                    }
                });

                it('verifies that removeLiquidity sends the correct reserve balance amounts to the caller', async () => {
                    const amount = BigNumber.from(100000).mul(ONE_TOKEN);
                    await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                    const percentage = BigNumber.from(50);
                    const supply = await poolToken.totalSupply();
                    const supplyAmount = supply.mul(percentage).div(supply);
                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);
                    const token1Amount = reserve1Balance.mul(percentage).div(supply);
                    const token2Amount = reserve2Balance.mul(percentage).div(supply);

                    const token1PrevBalance = await getBalance(reserveToken1, sender.address);
                    const token2PrevBalance = await getBalance(reserveToken2, sender.address);

                    const { transactionCost } = await removeLiquidity(
                        converter,
                        reserveToken1,
                        reserveToken2,
                        supplyAmount
                    );

                    const token1Balance = await getBalance(reserveToken1, sender.address);
                    const token2Balance = await getBalance(reserveToken2, sender.address);

                    expect(token1Balance).to.be.equal(
                        token1PrevBalance
                            .add(token1Amount)
                            .sub(
                                reserveToken1.address === Constants.NATIVE_TOKEN_ADDRESS
                                    ? transactionCost
                                    : BigNumber.from(0)
                            )
                    );
                    expect(token2Balance).to.be.equal(
                        token2PrevBalance
                            .add(token2Amount)
                            .sub(
                                reserveToken2.address === Constants.NATIVE_TOKEN_ADDRESS
                                    ? transactionCost
                                    : BigNumber.from(0)
                            )
                    );
                });

                it('verifies that removing the entire liquidity sends the full reserve balances to the caller', async () => {
                    const amount = BigNumber.from(100000).mul(ONE_TOKEN);
                    await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    const token1PrevBalance = await getBalance(reserveToken1, sender.address);
                    const token2PrevBalance = await getBalance(reserveToken2, sender.address);

                    const totalSupply = await poolToken.totalSupply();
                    const { transactionCost } = await removeLiquidity(
                        converter,
                        reserveToken1,
                        reserveToken2,
                        totalSupply
                    );

                    const token1Balance = await getBalance(reserveToken1, sender.address);
                    const token2Balance = await getBalance(reserveToken2, sender.address);

                    expect(await poolToken.totalSupply()).to.be.equal(BigNumber.from(0));

                    expect(token1Balance).to.be.equal(
                        token1PrevBalance
                            .add(reserve1Balance)
                            .sub(
                                reserveToken1.address === Constants.NATIVE_TOKEN_ADDRESS
                                    ? transactionCost
                                    : BigNumber.from(0)
                            )
                    );
                    expect(token2Balance).to.be.equal(
                        token2PrevBalance
                            .add(reserve2Balance)
                            .sub(
                                reserveToken2.address === Constants.NATIVE_TOKEN_ADDRESS
                                    ? transactionCost
                                    : BigNumber.from(0)
                            )
                    );
                });

                it('should revert when attempting to remove liquidity with insufficient funds', async () => {
                    const amount = BigNumber.from(100000).mul(ONE_TOKEN);
                    await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                    const totalSupply = await poolToken.totalSupply();

                    await expect(
                        removeLiquidity(converter, reserveToken1, reserveToken2, totalSupply.add(BigNumber.from(1)))
                    ).to.be.revertedWith('ERC20: burn amount exceeds balance');
                });

                describe('verifies that the maximum possible liquidity is added', () => {
                    for (const [amount1, amount2] of [
                        [1000, 1200],
                        [200, 240],
                        [2000, 2400],
                        [20000, 22000],
                        [20000, 26000],
                        [100000, 120000]
                    ]) {
                        it(`addLiquidity(${[amount1, amount2]})`, async () => {
                            await addLiquidity(converter, reserveToken1, reserveToken2, [amount1, amount2]);

                            const balance1 = await getBalance(reserveToken1, converter);
                            const balance2 = await getBalance(reserveToken2, converter);
                            const a1b2 = BigNumber.from(amount1).mul(balance2);
                            const a2b1 = BigNumber.from(amount2).mul(balance1);
                            const expected1 = a1b2.lt(a2b1) ? BigNumber.from(0) : a1b2.sub(a2b1).div(balance2);
                            const expected2 = a2b1.lt(a1b2) ? BigNumber.from(0) : a2b1.sub(a1b2).div(balance1);
                            const actual1 = await getAllowance(reserveToken1, converter);
                            const actual2 = await getAllowance(reserveToken2, converter);
                            expect(actual1).to.be.equal(expected1);
                            expect(actual2).to.be.equal(expected2);
                        });
                    }
                });

                describe('verifies no gain by adding/removing liquidity', () => {
                    for (const amounts of [
                        [1000, 1000],
                        [1000, 2000],
                        [2000, 1000]
                    ]) {
                        for (const percents of [[100], [50, 50], [25, 75], [75, 25], [10, 20, 30, 40]]) {
                            it(`(amounts = ${amounts}, percents = ${percents})`, async () => {
                                let lastAmount = BigNumber.from(0);
                                for (const amount of amounts) {
                                    await addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]);

                                    const balance = await getBalance(poolToken, sender.address);
                                    lastAmount = balance.sub(lastAmount);
                                }
                                const prevBalance1 = await getBalance(reserveToken1, sender.address);
                                const prevBalance2 = await getBalance(reserveToken2, sender.address);

                                let transactionCost = BigNumber.from(0);
                                for (const percent of percents) {
                                    const { transactionCost: removeTransactionConst } = await removeLiquidity(
                                        converter,
                                        reserveToken1,
                                        reserveToken2,
                                        lastAmount.mul(BigNumber.from(percent)).div(BigNumber.from(100))
                                    );

                                    transactionCost = transactionCost.add(removeTransactionConst);
                                }
                                const balance1 = await getBalance(reserveToken1, sender.address);
                                const balance2 = await getBalance(reserveToken2, sender.address);
                                const amount = BigNumber.from(amounts[1]);
                                expect(balance1).to.be.equal(
                                    prevBalance1
                                        .add(amount)
                                        .sub(
                                            reserveToken1.address === Constants.NATIVE_TOKEN_ADDRESS
                                                ? transactionCost
                                                : BigNumber.from(0)
                                        )
                                );
                                expect(balance2).to.be.equal(
                                    prevBalance2
                                        .add(amount)
                                        .sub(
                                            reserveToken2.address === Constants.NATIVE_TOKEN_ADDRESS
                                                ? transactionCost
                                                : BigNumber.from(0)
                                        )
                                );
                            });
                        }
                    }
                });

                it('should refund the provider', async () => {
                    const reserveTokens = [reserveToken1, reserveToken2];
                    const amount = BigNumber.from(1000000000);

                    for (const factors of [
                        [1, 1],
                        [1, 2],
                        [2, 1]
                    ]) {
                        const reserveAmounts = factors.map((factor: number) => amount.mul(factor));
                        for (const reserveToken of reserveTokens) {
                            await approve(reserveToken, converter, 0);
                        }

                        const balancesBefore = await Promise.all(
                            reserveTokens.map((reserveToken) => getBalance(reserveToken, sender.address))
                        );

                        const { transactionCost } = await addLiquidity(
                            converter,
                            reserveToken1,
                            reserveToken2,
                            reserveAmounts
                        );

                        const balancesAfter = await Promise.all(
                            reserveTokens.map((reserveToken) => getBalance(reserveToken, sender.address))
                        );

                        expect(balancesAfter[0]).to.be.equal(
                            balancesBefore[0]
                                .sub(BigNumber.from(amount))
                                .sub(
                                    reserveToken1.address === Constants.NATIVE_TOKEN_ADDRESS
                                        ? transactionCost
                                        : BigNumber.from(0)
                                )
                        );

                        expect(balancesAfter[1]).to.be.equal(
                            balancesBefore[1]
                                .sub(BigNumber.from(amount))
                                .sub(
                                    reserveToken2.address === Constants.NATIVE_TOKEN_ADDRESS
                                        ? transactionCost
                                        : BigNumber.from(0)
                                )
                        );
                    }
                });
            });

            it('should not generate network fees immediately after upgrade', async () => {
                let poolToken: any;
                let reserveToken1: any;
                let reserveToken2: any;
                let converter: any;

                ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                    ethIndex: ethIndex,
                    networkFeePercent: 20,
                    conversionFeePercent: 10
                }));

                await addLiquidity(converter, reserveToken1, reserveToken2, [ONE_TOKEN.mul(1000), ONE_TOKEN.mul(1000)]);

                const balanceBefore1 = await getBalance(reserveToken1, networkFeeWallet);
                const balanceBefore2 = await getBalance(reserveToken2, networkFeeWallet);

                const newConverter = await upgradeConverter(converterUpgrader, converter);
                expect(newConverter.address).to.be.not.equal(converter.address);

                await newConverter.processNetworkFees();

                const balanceAfter1 = await getBalance(reserveToken1, networkFeeWallet);
                const balanceAfter2 = await getBalance(reserveToken2, networkFeeWallet);

                expect(balanceAfter1).to.be.equal(balanceBefore1);
                expect(balanceAfter2).to.be.equal(balanceBefore2);
            });

            describe('network fees', () => {
                const CONVERSION_AMOUNT = ONE_TOKEN.mul(100);

                const description = (
                    prefix: any,
                    initialBalance1: any,
                    initialBalance2: any,
                    conversionFeePercent: any,
                    networkFeePercent: any
                ) => {
                    return (
                        prefix +
                        ` initial balances = [${initialBalance1}, ${initialBalance2}],` +
                        ` conversion fee = ${conversionFeePercent}%` +
                        ` and network fee = ${networkFeePercent}%`
                    );
                };

                let poolToken: any;
                let reserveToken1: any;
                let reserveToken2: any;
                let converter: any;

                let networkFeeWalletReserve1Balance: any;
                let networkFeeWalletReserve2Balance: any;

                for (const initialBalance1 of [100000, 200000, 400000, 800000]) {
                    for (const initialBalance2 of [100000, 300000, 500000, 700000]) {
                        for (const conversionFeePercent of [0, 5, 10, 25, 75]) {
                            for (const networkFeePercent of [0, 5, 10, 25, 75, 100]) {
                                context(
                                    description(
                                        'when',
                                        initialBalance1,
                                        initialBalance2,
                                        conversionFeePercent,
                                        networkFeePercent
                                    ),
                                    () => {
                                        beforeEach(async () => {
                                            ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                                                ethIndex,
                                                networkFeePercent,
                                                conversionFeePercent
                                            }));

                                            networkFeeWalletReserve1Balance = await getBalance(
                                                reserveToken1,
                                                networkFeeWallet
                                            );
                                            networkFeeWalletReserve2Balance = await getBalance(
                                                reserveToken2,
                                                networkFeeWallet
                                            );
                                        });

                                        it('should process network fees after conversion', async () => {
                                            await addLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                [initialBalance1, initialBalance2].map((n) => ONE_TOKEN.mul(n))
                                            );

                                            const conversion = await convert(
                                                [reserveToken1, poolToken, reserveToken2],
                                                CONVERSION_AMOUNT,
                                                MIN_RETURN
                                            );

                                            const expectedFeeBase = conversion.fee.mul(networkFeePercent).div(200);
                                            const reserveBalance1 = ONE_TOKEN.mul(initialBalance1).add(
                                                CONVERSION_AMOUNT
                                            );
                                            const reserveBalance2 = ONE_TOKEN.mul(initialBalance2).sub(
                                                conversion.amount
                                            );

                                            await converter.processNetworkFees();

                                            const expectedFee1 = expectedFeeBase
                                                .mul(reserveBalance1)
                                                .div(reserveBalance2);
                                            const expectedFee2 = expectedFeeBase;

                                            const actualFee1 = (
                                                await getBalance(reserveToken1, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve1Balance);
                                            const actualFee2 = (
                                                await getBalance(reserveToken2, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve2Balance);

                                            expectAlmostEqual(actualFee1, expectedFee1, '2', '0.000188');
                                            expectAlmostEqual(actualFee2, expectedFee2, '2', '0.000188');
                                        });
                                    }
                                );
                            }
                        }
                    }
                }

                for (const initialBalance1 of [100000, 400000]) {
                    for (const initialBalance2 of [100000, 500000]) {
                        for (const conversionFeePercent of [1, 2]) {
                            for (const networkFeePercent of [5, 10]) {
                                context(
                                    description(
                                        'when',
                                        initialBalance1,
                                        initialBalance2,
                                        conversionFeePercent,
                                        networkFeePercent
                                    ),
                                    () => {
                                        beforeEach(async () => {
                                            ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                                                ethIndex,
                                                networkFeePercent,
                                                conversionFeePercent
                                            }));

                                            networkFeeWalletReserve1Balance = await getBalance(
                                                reserveToken1,
                                                networkFeeWallet
                                            );
                                            networkFeeWalletReserve2Balance = await getBalance(
                                                reserveToken2,
                                                networkFeeWallet
                                            );
                                        });

                                        it('should process network fees after liquidity provision', async () => {
                                            await addLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                [initialBalance1, initialBalance2].map((n) => ONE_TOKEN.mul(n))
                                            );

                                            const conversion = await convert(
                                                [reserveToken1, poolToken, reserveToken2],
                                                CONVERSION_AMOUNT,
                                                MIN_RETURN
                                            );
                                            const expectedFeeBase = conversion.fee.mul(networkFeePercent).div(200);
                                            const reserveBalance1 = ONE_TOKEN.mul(initialBalance1).add(
                                                CONVERSION_AMOUNT
                                            );
                                            const reserveBalance2 = ONE_TOKEN.mul(initialBalance2).sub(
                                                conversion.amount
                                            );

                                            const reserveAmounts = [initialBalance1, initialBalance2].map((n) =>
                                                ONE_TOKEN.mul(n)
                                            );

                                            await addLiquidity(converter, reserveToken1, reserveToken2, reserveAmounts);

                                            const expectedFee1 = expectedFeeBase
                                                .mul(reserveBalance1)
                                                .div(reserveBalance2);
                                            const expectedFee2 = expectedFeeBase;

                                            const actualFee1 = (
                                                await getBalance(reserveToken1, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve1Balance);
                                            const actualFee2 = (
                                                await getBalance(reserveToken2, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve2Balance);

                                            expectAlmostEqual(actualFee1, expectedFee1, '0', '0.000005');
                                            expectAlmostEqual(actualFee2, expectedFee2, '0', '0.000005');
                                        });
                                    }
                                );
                            }
                        }
                    }
                }

                for (const initialBalance1 of [100000, 400000]) {
                    for (const initialBalance2 of [100000, 500000]) {
                        for (const conversionFeePercent of [1, 2]) {
                            for (const networkFeePercent of [5, 10]) {
                                context(
                                    description(
                                        'when',
                                        initialBalance1,
                                        initialBalance2,
                                        conversionFeePercent,
                                        networkFeePercent
                                    ),
                                    () => {
                                        beforeEach(async () => {
                                            ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                                                ethIndex,
                                                networkFeePercent,
                                                conversionFeePercent
                                            }));

                                            networkFeeWalletReserve1Balance = await getBalance(
                                                reserveToken1,
                                                networkFeeWallet
                                            );
                                            networkFeeWalletReserve2Balance = await getBalance(
                                                reserveToken2,
                                                networkFeeWallet
                                            );
                                        });

                                        it('should process network fees after multiple conversions', async () => {
                                            await addLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                [initialBalance1, initialBalance2].map((n) => ONE_TOKEN.mul(n))
                                            );

                                            let totalConversionFee1 = BigNumber.from(0);
                                            let totalConversionFee2 = BigNumber.from(0);

                                            for (const n of [10, 20, 30, 40]) {
                                                const conversion = await convert(
                                                    [reserveToken1, poolToken, reserveToken2],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee2 = totalConversionFee2.add(conversion.fee);
                                            }

                                            for (const n of [50, 60, 70, 80]) {
                                                const conversion = await convert(
                                                    [reserveToken2, poolToken, reserveToken1],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee1 = totalConversionFee1.add(conversion.fee);
                                            }

                                            for (const n of [180, 170, 160, 150]) {
                                                const conversion = await convert(
                                                    [reserveToken1, poolToken, reserveToken2],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee2 = totalConversionFee2.add(conversion.fee);
                                            }

                                            for (const n of [140, 130, 120, 110]) {
                                                const conversion = await convert(
                                                    [reserveToken2, poolToken, reserveToken1],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee1 = totalConversionFee1.add(conversion.fee);
                                            }

                                            const totalSupply = await poolToken.totalSupply();
                                            const reserveBalance1 = await getBalance(reserveToken1, converter);
                                            const reserveBalance2 = await getBalance(reserveToken2, converter);

                                            const supplyAmount = await poolToken.balanceOf(sender.address);
                                            await removeLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                supplyAmount
                                            );

                                            const totalConversionFee1InPoolTokenUnits = totalConversionFee1
                                                .mul(totalSupply)
                                                .div(reserveBalance1);
                                            const totalConversionFee2InPoolTokenUnits = totalConversionFee2
                                                .mul(totalSupply)
                                                .div(reserveBalance2);
                                            const totalConversionFeeInPoolTokenUnits = totalConversionFee1InPoolTokenUnits.add(
                                                totalConversionFee2InPoolTokenUnits
                                            );
                                            const expectedFeeBase = totalConversionFeeInPoolTokenUnits
                                                .mul(networkFeePercent)
                                                .div(200);
                                            const expectedFee1 = expectedFeeBase.mul(reserveBalance1).div(totalSupply);
                                            const expectedFee2 = expectedFeeBase.mul(reserveBalance2).div(totalSupply);

                                            const actualFee1 = (
                                                await getBalance(reserveToken1, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve1Balance);
                                            const actualFee2 = (
                                                await getBalance(reserveToken2, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve2Balance);

                                            expectAlmostEqual(actualFee1, expectedFee1, '0', '0.001371');
                                            expectAlmostEqual(actualFee2, expectedFee2, '0', '0.001371');
                                        });
                                    }
                                );
                            }
                        }
                    }
                }

                for (const initialBalance1 of [100000]) {
                    for (const initialBalance2 of [100000]) {
                        for (const conversionFeePercent of [1]) {
                            for (const networkFeePercent of [10]) {
                                context(
                                    description(
                                        'when',
                                        initialBalance1,
                                        initialBalance2,
                                        conversionFeePercent,
                                        networkFeePercent
                                    ),
                                    () => {
                                        beforeEach(async () => {
                                            ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                                                ethIndex,
                                                networkFeePercent,
                                                conversionFeePercent
                                            }));

                                            networkFeeWalletReserve1Balance = await getBalance(
                                                reserveToken1,
                                                networkFeeWallet
                                            );
                                            networkFeeWalletReserve2Balance = await getBalance(
                                                reserveToken2,
                                                networkFeeWallet
                                            );
                                        });

                                        it('should process network fee after liquidity provision and removal', async () => {
                                            await addLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,

                                                [initialBalance1, initialBalance2].map((n) => ONE_TOKEN.mul(n))
                                            );

                                            let totalConversionFee1 = BigNumber.from(0);
                                            let totalConversionFee2 = BigNumber.from(0);

                                            for (const n of [10, 20, 30, 40]) {
                                                const conversion = await convert(
                                                    [reserveToken1, poolToken, reserveToken2],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee2 = totalConversionFee2.add(conversion.fee);
                                            }

                                            for (let n = 0; n < 4; n++) {
                                                const reserveAmounts = [ONE_TOKEN.mul(1000), ONE_TOKEN.mul(1000)];
                                                await addLiquidity(
                                                    converter,
                                                    reserveToken1,
                                                    reserveToken2,
                                                    reserveAmounts
                                                );
                                            }

                                            for (const n of [50, 60, 70, 80]) {
                                                const conversion = await convert(
                                                    [reserveToken2, poolToken, reserveToken1],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee1 = totalConversionFee1.add(conversion.fee);
                                            }

                                            for (let n = 0; n < 4; n++) {
                                                const supplyAmount = await poolToken.balanceOf(sender.address);
                                                await removeLiquidity(
                                                    converter,
                                                    reserveToken1,
                                                    reserveToken2,
                                                    supplyAmount.div(10)
                                                );
                                            }

                                            for (const n of [180, 170, 160, 150]) {
                                                const conversion = await convert(
                                                    [reserveToken1, poolToken, reserveToken2],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee2 = totalConversionFee2.add(conversion.fee);
                                            }

                                            for (let n = 0; n < 4; n++) {
                                                const reserveAmounts = [ONE_TOKEN.mul(1000), ONE_TOKEN.mul(1000)];
                                                await addLiquidity(
                                                    converter,
                                                    reserveToken1,
                                                    reserveToken2,
                                                    reserveAmounts
                                                );
                                            }

                                            for (const n of [140, 130, 120, 110]) {
                                                const conversion = await convert(
                                                    [reserveToken2, poolToken, reserveToken1],
                                                    ONE_TOKEN.mul(n),
                                                    MIN_RETURN
                                                );
                                                totalConversionFee1 = totalConversionFee1.add(conversion.fee);
                                            }

                                            for (let n = 0; n < 4; n++) {
                                                const supplyAmount = await poolToken.balanceOf(sender.address);
                                                await removeLiquidity(
                                                    converter,
                                                    reserveToken1,
                                                    reserveToken2,
                                                    supplyAmount.div(10)
                                                );
                                            }

                                            const totalSupply = await poolToken.totalSupply();
                                            const reserveBalance1 = await getBalance(reserveToken1, converter);
                                            const reserveBalance2 = await getBalance(reserveToken2, converter);

                                            const totalConversionFee1InPoolTokenUnits = totalConversionFee1
                                                .mul(totalSupply)
                                                .div(reserveBalance1);
                                            const totalConversionFee2InPoolTokenUnits = totalConversionFee2
                                                .mul(totalSupply)
                                                .div(reserveBalance2);
                                            const totalConversionFeeInPoolTokenUnits = totalConversionFee1InPoolTokenUnits.add(
                                                totalConversionFee2InPoolTokenUnits
                                            );
                                            const expectedFeeBase = totalConversionFeeInPoolTokenUnits
                                                .mul(networkFeePercent)
                                                .div(200);
                                            const expectedFee1 = expectedFeeBase.mul(reserveBalance1).div(totalSupply);
                                            const expectedFee2 = expectedFeeBase.mul(reserveBalance2).div(totalSupply);

                                            const actualFee1 = (
                                                await getBalance(reserveToken1, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve1Balance);
                                            const actualFee2 = (
                                                await getBalance(reserveToken2, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve2Balance);

                                            expectAlmostEqual(actualFee1, expectedFee1, '0', '0.003391');
                                            expectAlmostEqual(actualFee2, expectedFee2, '0', '0.001671');
                                        });
                                    }
                                );
                            }
                        }
                    }
                }

                for (const initialBalance1 of [100000]) {
                    for (const initialBalance2 of [100000]) {
                        for (const conversionFeePercent of [1]) {
                            for (const networkFeePercent of [10]) {
                                context(
                                    description(
                                        'when',
                                        initialBalance1,
                                        initialBalance2,
                                        conversionFeePercent,
                                        networkFeePercent
                                    ),
                                    () => {
                                        beforeEach(async () => {
                                            ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                                                ethIndex,
                                                networkFeePercent,
                                                conversionFeePercent
                                            }));

                                            networkFeeWalletReserve1Balance = await getBalance(
                                                reserveToken1,
                                                networkFeeWallet
                                            );
                                            networkFeeWalletReserve2Balance = await getBalance(
                                                reserveToken2,
                                                networkFeeWallet
                                            );
                                        });

                                        it('should process network fees after multiple conversions', async () => {
                                            await addLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                [initialBalance1, initialBalance2].map((n) => ONE_TOKEN.mul(n))
                                            );

                                            let totalConversionFee1 = BigNumber.from(0);
                                            let totalConversionFee2 = BigNumber.from(0);

                                            for (const n of [10, 20, 30, 40]) {
                                                const conversion = await convert(
                                                    [reserveToken1, poolToken, reserveToken2],
                                                    1000000 * n,
                                                    MIN_RETURN
                                                );
                                                totalConversionFee2 = totalConversionFee2.add(conversion.fee);
                                            }

                                            await converter.processNetworkFees();

                                            for (const n of [50, 60, 70, 80]) {
                                                const conversion = await convert(
                                                    [reserveToken2, poolToken, reserveToken1],
                                                    1000000 * n,
                                                    MIN_RETURN
                                                );
                                                totalConversionFee1 = totalConversionFee1.add(conversion.fee);
                                            }

                                            await converter.processNetworkFees();

                                            for (const n of [180, 170, 160, 150]) {
                                                const conversion = await convert(
                                                    [reserveToken1, poolToken, reserveToken2],
                                                    1000000 * n,
                                                    MIN_RETURN
                                                );
                                                totalConversionFee2 = totalConversionFee2.add(conversion.fee);
                                            }

                                            await converter.processNetworkFees();

                                            for (const n of [140, 130, 120, 110]) {
                                                const conversion = await convert(
                                                    [reserveToken2, poolToken, reserveToken1],
                                                    1000000 * n,
                                                    MIN_RETURN
                                                );
                                                totalConversionFee1 = totalConversionFee1.add(conversion.fee);
                                            }

                                            await converter.processNetworkFees();

                                            const totalSupply = await poolToken.totalSupply();
                                            const reserveBalance1 = await getBalance(reserveToken1, converter);
                                            const reserveBalance2 = await getBalance(reserveToken2, converter);

                                            const totalConversionFee1InPoolTokenUnits = totalConversionFee1
                                                .mul(totalSupply)
                                                .div(reserveBalance1);
                                            const totalConversionFee2InPoolTokenUnits = totalConversionFee2
                                                .mul(totalSupply)
                                                .div(reserveBalance2);
                                            const totalConversionFeeInPoolTokenUnits = totalConversionFee1InPoolTokenUnits.add(
                                                totalConversionFee2InPoolTokenUnits
                                            );
                                            const expectedFeeBase = totalConversionFeeInPoolTokenUnits
                                                .mul(networkFeePercent)
                                                .div(200);
                                            const expectedFee1 = expectedFeeBase.mul(reserveBalance1).div(totalSupply);
                                            const expectedFee2 = expectedFeeBase.mul(reserveBalance2).div(totalSupply);

                                            const actualFee1 = (
                                                await getBalance(reserveToken1, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve1Balance);
                                            const actualFee2 = (
                                                await getBalance(reserveToken2, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve2Balance);

                                            expectAlmostEqual(actualFee1, expectedFee1, '0', '0.0000014');
                                            expectAlmostEqual(actualFee2, expectedFee2, '0', '0.0000014');
                                        });
                                    }
                                );
                            }
                        }
                    }
                }

                for (const initialBalance1 of [100000, 400000]) {
                    for (const initialBalance2 of [100000, 500000]) {
                        for (const conversionFeePercent of [1, 2]) {
                            for (const networkFeePercent of [5, 10]) {
                                context(
                                    description(
                                        'when',
                                        initialBalance1,
                                        initialBalance2,
                                        conversionFeePercent,
                                        networkFeePercent
                                    ),
                                    () => {
                                        beforeEach(async () => {
                                            ({ poolToken, reserveToken1, reserveToken2, converter } = await createPool({
                                                ethIndex,
                                                networkFeePercent,
                                                conversionFeePercent
                                            }));

                                            networkFeeWalletReserve1Balance = await getBalance(
                                                reserveToken1,
                                                networkFeeWallet
                                            );
                                            networkFeeWalletReserve2Balance = await getBalance(
                                                reserveToken2,
                                                networkFeeWallet
                                            );
                                        });

                                        it('should process network fees after large liquidity removal', async () => {
                                            await addLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                [initialBalance1, initialBalance2].map((n) => ONE_TOKEN.mul(n))
                                            );

                                            const conversionAmount = ONE_TOKEN.mul(
                                                Math.max(initialBalance1, initialBalance2)
                                            );
                                            const conversion = await convert(
                                                [reserveToken1, poolToken, reserveToken2],
                                                conversionAmount,
                                                MIN_RETURN
                                            );
                                            const expectedFeeBase = conversion.fee.mul(networkFeePercent).div(200);
                                            const reserveBalance1 = ONE_TOKEN.mul(initialBalance1).add(
                                                conversionAmount
                                            );
                                            const reserveBalance2 = ONE_TOKEN.mul(initialBalance2).sub(
                                                conversion.amount
                                            );

                                            const supplyAmount = await poolToken.balanceOf(sender.address);
                                            await removeLiquidity(
                                                converter,
                                                reserveToken1,
                                                reserveToken2,
                                                supplyAmount
                                            );

                                            const expectedFee1 = expectedFeeBase
                                                .mul(reserveBalance1)
                                                .div(reserveBalance2);
                                            const expectedFee2 = expectedFeeBase;

                                            const actualFee1 = (
                                                await getBalance(reserveToken1, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve1Balance);
                                            const actualFee2 = (
                                                await getBalance(reserveToken2, networkFeeWallet.address)
                                            ).sub(networkFeeWalletReserve2Balance);

                                            expectAlmostEqual(actualFee1, expectedFee1, '0', '0.02383');
                                            expectAlmostEqual(actualFee2, expectedFee2, '0', '0.02383');
                                        });
                                    }
                                );
                            }
                        }
                    }
                }

                const expectAlmostEqual = (
                    actual: any,
                    expected: any,
                    maxAbsoluteError: any,
                    maxRelativeError: any
                ) => {
                    const x = new MathUtils.Decimal(actual.toString());
                    const y = new MathUtils.Decimal(expected.toString());
                    if (!x.eq(y)) {
                        const absoluteError = x.sub(y).abs();
                        const relativeError = x.div(y).sub(1).abs();
                        expect(absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError)).to.be.equal(
                            true,
                            `\nabsoluteError = ${absoluteError.toFixed()}\nrelativeError = ${relativeError.toFixed(25)}`
                        );
                    }
                };
            });

            describe('sync reserve balances', () => {
                let poolToken: any;
                let reserveToken1: any;
                let reserveToken2: any;
                let converter: any;

                beforeEach(async () => {
                    ({ converter, poolToken, reserveToken1, reserveToken2 } = await createPool({ ethIndex }));

                    await addLiquidity(converter, reserveToken1, reserveToken2, [
                        BigNumber.from(1000000000),
                        BigNumber.from(1000000000)
                    ]);
                });

                const testSync = async (operation: any) => {
                    await operation();

                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    await converter.syncReserveBalances();

                    expect(await converter.reserveBalance(reserveToken1.address)).to.be.equal(reserve1Balance);
                    expect(await converter.reserveBalance(reserveToken2.address)).to.be.equal(reserve2Balance);
                };

                it('should not affect reserve balances before and after conversion', async () => {
                    const amount = BigNumber.from(500);
                    await testSync(async () => convert([reserveToken1, poolToken, reserveToken2], amount, MIN_RETURN));
                });

                it('should not affect reserve balances before and after liquidity is added', async () => {
                    const amount = BigNumber.from(1000).mul(ONE_TOKEN);
                    await testSync(async () => addLiquidity(converter, reserveToken1, reserveToken2, [amount, amount]));
                });

                it('should not affect reserve balances before and after liquidity is removed', async () => {
                    const amount = await poolToken.totalSupply();
                    await testSync(async () =>
                        converter.removeLiquidity(
                            amount,
                            [reserveToken1.address, reserveToken2.address],
                            [MIN_RETURN, MIN_RETURN]
                        )
                    );
                });

                it('should sync with external changes', async () => {
                    const reserve1Balance = await converter.reserveBalance(reserveToken1.address);
                    const reserve2Balance = await converter.reserveBalance(reserveToken2.address);

                    const amount1 = BigNumber.from(1);
                    const amount2 = BigNumber.from(100);

                    await transfer(reserveToken1, converter, amount1);
                    await transfer(reserveToken2, converter, amount2);

                    await converter.syncReserveBalances();

                    expect(await converter.reserveBalance(reserveToken1.address)).to.be.equal(
                        reserve1Balance.add(amount1)
                    );
                    expect(await converter.reserveBalance(reserveToken2.address)).to.be.equal(
                        reserve2Balance.add(amount2)
                    );
                });
            });
        });
    }
});
