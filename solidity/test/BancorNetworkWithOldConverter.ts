import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import Constants from './helpers/Constants';
import ConverterHelper from './helpers/Converter';

import Contracts from './helpers/Contracts';
import { BancorNetwork, ContractRegistry, DSToken } from '../typechain';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

/*
Token network structure:

         DSToken2
         /         \
    DSToken1   DSToken3

*/

const OLD_CONVERTER_VERSION = 9;

let poolToken1: DSToken;
let poolToken2: DSToken;
let poolToken3: DSToken;
let contractRegistry: ContractRegistry;
let converter: any;
let bancorNetwork: BancorNetwork;

let accounts: SignerWithAddress[];
let owner: SignerWithAddress;

describe('BancorNetworkWithOldConverter', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        owner = accounts[0];

        // The following contracts are unaffected by the underlying tests, this can be shared.
        contractRegistry = await Contracts.ContractRegistry.deploy();

        const bancorFormula = await Contracts.BancorFormula.deploy();
        await bancorFormula.init();
        await contractRegistry.registerAddress(Constants.registry.BANCOR_FORMULA, bancorFormula.address);
    });

    beforeEach(async () => {
        bancorNetwork = await Contracts.BancorNetwork.deploy(contractRegistry.address);
        await contractRegistry.registerAddress(Constants.registry.BANCOR_NETWORK, bancorNetwork.address);

        poolToken1 = await Contracts.DSToken.deploy('Token1', 'TKN1', 2);
        await poolToken1.issue(owner.address, 1000000);

        poolToken2 = await Contracts.DSToken.deploy('Token2', 'TKN2', 2);
        await poolToken2.issue(owner.address, 2000000);

        poolToken3 = await Contracts.DSToken.deploy('Token3', 'TKN3', 2);
        await poolToken3.issue(owner.address, 3000000);

        converter = await ConverterHelper.deploy(
            1,
            poolToken2.address,
            contractRegistry.address,
            0,
            poolToken1.address,
            300000,
            OLD_CONVERTER_VERSION
        );
        await converter.addConnector(poolToken3.address, 150000, false);

        await poolToken1.transfer(converter.address, 40000);
        await poolToken3.transfer(converter.address, 25000);

        await poolToken2.transferOwnership(converter.address);
        await converter.acceptTokenOwnership();
    });

    it('verifies that isV28OrHigherConverter returns false', async () => {
        const network = await Contracts.TestBancorNetwork.deploy(0, 0);

        expect(await network.isV28OrHigherConverterExternal(converter.address)).to.be.false;
    });

    it('verifies that getReturnByPath returns the same amount as getReturn when converting a reserve to the liquid token', async () => {
        const value = BigNumber.from(100);
        const getReturn = await converter.getReturn(poolToken1.address, poolToken2.address, value);
        const returnByPath = (
            await bancorNetwork.getReturnByPath([poolToken1.address, poolToken2.address, poolToken2.address], value)
        )[0];

        expect(getReturn).to.be.equal(returnByPath);
    });

    it('verifies that getReturnByPath returns the same amount as getReturn when converting from a token to a reserve', async () => {
        const value = BigNumber.from(100);
        const getReturn = await converter.getReturn(poolToken2.address, poolToken1.address, value);
        const returnByPath = (
            await bancorNetwork.getReturnByPath([poolToken2.address, poolToken2.address, poolToken1.address], value)
        )[0];

        expect(getReturn).to.be.equal(returnByPath);
    });

    for (let amount = 0; amount < 10; amount++) {
        for (let fee = 0; fee < 10; fee++) {
            it(`test old getReturn with amount = ${amount} and fee = ${fee}`, async () => {
                const tester = await Contracts.TestBancorNetwork.deploy(amount, fee);
                const amounts = await tester.getReturnOld();
                const returnAmount = amounts[0];
                const returnFee = amounts[1];

                expect(returnAmount).to.be.equal(BigNumber.from(amount));
                expect(returnFee).to.be.equal(BigNumber.from(0));
            });
        }
    }

    for (let amount = 0; amount < 10; amount++) {
        for (let fee = 0; fee < 10; fee++) {
            it(`test new getReturn with amount = ${amount} and fee = ${fee}`, async () => {
                const tester = await Contracts.TestBancorNetwork.deploy(amount, fee);
                const amounts = await tester.getReturnNew();
                const returnAmount = amounts[0];
                const returnFee = amounts[1];

                expect(returnAmount).to.be.equal(BigNumber.from(amount));
                expect(returnFee).to.be.equal(BigNumber.from(fee));
            });
        }
    }
});
