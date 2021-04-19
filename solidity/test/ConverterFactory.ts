import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import Constants from './helpers/Constants';

import Contracts, { ContractType } from './helpers/Contracts';
import { ContractRegistry, TestConverterFactory, TestTypedConverterAnchorFactory } from '../../typechain';

const Factories: { [key: string]: ContractType } = {
    StandardPoolConverterFactory: Contracts.StandardPoolConverterFactory
};

let contractRegistry: ContractRegistry;
let converterFactory: TestConverterFactory;
let anchorFactory: TestTypedConverterAnchorFactory;
let factory: any;

let accounts: SignerWithAddress[];
let owner: SignerWithAddress;
let nonOwner: SignerWithAddress;

describe('ConverterFactory', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        owner = accounts[0];
        nonOwner = accounts[1];
    });

    const MAX_CONVERSION_FEE = BigNumber.from(10000);

    for (const contractName in Factories) {
        describe(contractName, () => {
            before(async () => {
                // The following contracts are unaffected by the underlying tests, this can be shared.
                contractRegistry = await Contracts.ContractRegistry.deploy();
            });

            beforeEach(async () => {
                converterFactory = await Contracts.TestConverterFactory.deploy();
                anchorFactory = await Contracts.TestTypedConverterAnchorFactory.deploy('TypedAnchor');
                factory = await Factories[contractName].deploy();
            });

            it('should allow the owner to register a typed converter factory', async () => {
                await converterFactory.registerTypedConverterFactory(factory.address);
                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    factory.address
                );
            });

            it('should allow the owner to reregister a typed converter factory', async () => {
                await converterFactory.registerTypedConverterFactory(factory.address);

                const factory2 = await Factories[contractName].deploy();
                expect(await factory.converterType()).to.be.equal(await factory2.converterType());

                await converterFactory.registerTypedConverterFactory(factory2.address);
                expect(await converterFactory.converterFactories(await factory2.converterType())).to.eql(
                    factory2.address
                );
            });

            it('should revert if a non-owner attempts to register a typed converter factory', async () => {
                await expect(
                    converterFactory.connect(nonOwner).registerTypedConverterFactory(factory.address)
                ).to.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should allow the owner to register a typed converter anchor factory', async () => {
                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory.address);
                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    anchorFactory.address
                );
            });

            it('should allow the owner to reregister a typed converter anchor factory', async () => {
                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory.address);

                const anchorFactory2 = await Contracts.TestTypedConverterAnchorFactory.deploy('TypedAnchor2');
                expect(await anchorFactory.converterType()).to.be.equal(await anchorFactory.converterType());

                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory2.address);
                expect(await converterFactory.anchorFactories(await anchorFactory2.converterType())).to.eql(
                    anchorFactory2.address
                );
            });

            it('should revert if a non-owner attempts to register a typed converter anchor factory', async () => {
                await expect(
                    converterFactory.connect(nonOwner).registerTypedConverterAnchorFactory(anchorFactory.address)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should allow the owner to unregister a registered typed converter anchor factory', async () => {
                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory.address);

                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    anchorFactory.address
                );

                await converterFactory.unregisterTypedConverterAnchorFactory(anchorFactory.address);

                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    Constants.ZERO_ADDRESS
                );
            });

            it('should revert if the owner attempts to unregister an unregistered typed converter anchor factory', async () => {
                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory.address);

                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    anchorFactory.address
                );

                const factory2 = await Factories[contractName].deploy();
                expect(await factory.converterType()).to.be.equal(await factory2.converterType());

                await expect(converterFactory.unregisterTypedConverterAnchorFactory(factory2.address)).to.revertedWith(
                    'ERR_NOT_REGISTERED'
                );

                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    anchorFactory.address
                );
            });

            it('should revert if a non-owner attempts to unregister a registered typed converter anchor factory', async () => {
                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory.address);

                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    anchorFactory.address
                );

                await expect(
                    converterFactory.connect(nonOwner).unregisterTypedConverterAnchorFactory(anchorFactory.address)
                ).to.revertedWith('ERR_ACCESS_DENIED');

                expect(await converterFactory.anchorFactories(await anchorFactory.converterType())).to.eql(
                    anchorFactory.address
                );
            });

            it('should allow the owner to unregister a registered typed converter factory', async () => {
                await converterFactory.registerTypedConverterFactory(factory.address);
                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    factory.address
                );

                await converterFactory.unregisterTypedConverterFactory(factory.address);

                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    Constants.ZERO_ADDRESS
                );
            });

            it('should revert if the owner attempts to unregister an unregistered typed converter factory', async () => {
                await converterFactory.registerTypedConverterFactory(factory.address);

                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    factory.address
                );

                const factory2 = await Factories[contractName].deploy();
                expect(await factory.converterType()).to.be.equal(await factory2.converterType());

                await expect(converterFactory.unregisterTypedConverterFactory(factory2.address)).to.revertedWith(
                    'ERR_NOT_REGISTERED'
                );

                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    factory.address
                );
            });

            it('should revert if a non-owner attempts to unregister a registered typed converter factory', async () => {
                await converterFactory.registerTypedConverterFactory(factory.address);

                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    factory.address
                );

                await expect(
                    converterFactory.connect(nonOwner).unregisterTypedConverterFactory(factory.address)
                ).to.revertedWith('ERR_ACCESS_DENIED');

                expect(await converterFactory.converterFactories(await factory.converterType())).to.eql(
                    factory.address
                );
            });

            it('should create an anchor using an existing factory', async () => {
                await converterFactory.registerTypedConverterAnchorFactory(anchorFactory.address);

                const name = 'Anchor1';
                await converterFactory.createAnchor(await anchorFactory.converterType(), name, 'ANCHOR1', 2);

                const anchorAddress = await converterFactory.createdAnchor();
                const anchor = await Contracts.DSToken.attach(anchorAddress);

                expect(await anchor.name()).to.not.be.eql(name);
                expect(await anchor.name()).to.be.eql(await anchorFactory.name());
                expect(await anchor.owner()).to.be.eql(converterFactory.address);
                expect(await anchor.newOwner()).to.be.eql(owner.address);
            });

            it('should create an anchor using custom settings', async () => {
                const name = 'Anchor1';
                await converterFactory.createAnchor(11, name, 'ANCHOR1', 2);

                const anchorAddress = await converterFactory.createdAnchor();
                const anchor = await Contracts.DSToken.attach(anchorAddress);

                expect(await anchor.name()).to.be.eql(name);
                expect(await anchor.name()).not.to.be.eql(await anchorFactory.name());
                expect(await anchor.owner()).to.be.eql(converterFactory.address);
                expect(await anchor.newOwner()).to.be.eql(owner.address);
            });

            it('should create converter', async () => {
                await converterFactory.registerTypedConverterFactory(factory.address);

                const anchor = await Contracts.DSToken.deploy('Token1', 'TKN1', 2);

                const converterType = await factory.converterType();

                const res = await converterFactory.createConverter(
                    converterType,
                    anchor.address,
                    contractRegistry.address,
                    MAX_CONVERSION_FEE
                );
                const converterAddress = await converterFactory.createdConverter();
                const converter = await Contracts.StandardPoolConverter.attach(converterAddress);

                expect(await converter.anchor()).to.be.eql(anchor.address);
                expect(await converter.registry()).to.be.eql(contractRegistry.address);
                expect(await converter.maxConversionFee()).to.be.equal(MAX_CONVERSION_FEE);
                expect(await converter.owner()).to.be.eql(converterFactory.address);
                expect(await converter.newOwner()).to.be.eql(owner.address);

                expect(res)
                    .to.emit(converterFactory, 'NewConverter')
                    .withArgs(converterType, converter.address, owner.address);
            });
        });
    }
});
