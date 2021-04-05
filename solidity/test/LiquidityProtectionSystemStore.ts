import { ethers } from 'hardhat';
import { expect } from 'chai';

import Constants from './helpers/Constants';

import Contracts from './helpers/Contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { LiquidityProtectionSystemStore } from '../../typechain';

let liquidityProtectionSystemStore: LiquidityProtectionSystemStore;

let accounts: SignerWithAddress[];
let owner: SignerWithAddress;
let token: SignerWithAddress;
let anchor: SignerWithAddress;

describe('LiquidityProtectionSystemStore', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        owner = accounts[1];
        token = accounts[2];
        anchor = accounts[3];
    });

    beforeEach(async () => {
        liquidityProtectionSystemStore = await Contracts.LiquidityProtectionSystemStore.deploy();
        await liquidityProtectionSystemStore.grantRole(Constants.roles.ROLE_OWNER, owner.address);
    });

    it('should revert when a non owner attempts to increase system balance', async () => {
        await expect(liquidityProtectionSystemStore.incSystemBalance(token.address, 1)).to.be.revertedWith(
            'ERR_ACCESS_DENIED'
        );
        expect(await liquidityProtectionSystemStore.systemBalance(token.address)).to.be.equal('0');
    });

    it('should revert when a non owner attempts to decrease system balance', async () => {
        await liquidityProtectionSystemStore.connect(owner).incSystemBalance(token.address, 1);
        await expect(liquidityProtectionSystemStore.decSystemBalance(token.address, 1)).to.be.revertedWith(
            'ERR_ACCESS_DENIED'
        );
        expect(await liquidityProtectionSystemStore.systemBalance(token.address)).to.be.equal('1');
    });

    it('should succeed when an owner attempts to increase system balance', async () => {
        expect(await liquidityProtectionSystemStore.connect(owner).incSystemBalance(token.address, 1))
            .to.emit(liquidityProtectionSystemStore, 'SystemBalanceUpdated')
            .withArgs(token.address, '0', '1');
        expect(await liquidityProtectionSystemStore.systemBalance(token.address)).to.be.equal('1');
    });

    it('should succeed when an owner attempts to decrease system balance', async () => {
        await liquidityProtectionSystemStore.connect(owner).incSystemBalance(token.address, 1);
        expect(await liquidityProtectionSystemStore.systemBalance(token.address)).to.be.equal('1');
        expect(await liquidityProtectionSystemStore.connect(owner).decSystemBalance(token.address, 1))
            .to.emit(liquidityProtectionSystemStore, 'SystemBalanceUpdated')
            .withArgs(token.address, '1', '0');
        expect(await liquidityProtectionSystemStore.systemBalance(token.address)).to.be.equal('0');
    });

    it('should revert when a non owner attempts to increase network tokens minted', async () => {
        await expect(liquidityProtectionSystemStore.incNetworkTokensMinted(anchor.address, 1)).to.be.revertedWith(
            'ERR_ACCESS_DENIED'
        );
        expect(await liquidityProtectionSystemStore.networkTokensMinted(anchor.address)).to.be.equal('0');
    });

    it('should revert when a non owner attempts to decrease network tokens minted', async () => {
        await liquidityProtectionSystemStore.connect(owner).incNetworkTokensMinted(anchor.address, 1);
        await expect(liquidityProtectionSystemStore.decNetworkTokensMinted(anchor.address, 1)).to.be.revertedWith(
            'ERR_ACCESS_DENIED'
        );
        expect(await liquidityProtectionSystemStore.networkTokensMinted(anchor.address)).to.be.equal('1');
    });

    it('should succeed when an owner attempts to increase network tokens minted', async () => {
        expect(await liquidityProtectionSystemStore.connect(owner).incNetworkTokensMinted(anchor.address, 1))
            .to.emit(liquidityProtectionSystemStore, 'NetworkTokensMintedUpdated')
            .withArgs(anchor.address, '0', '1');
        expect(await liquidityProtectionSystemStore.networkTokensMinted(anchor.address)).to.be.equal('1');
    });

    it('should succeed when an owner attempts to decrease network tokens minted', async () => {
        await liquidityProtectionSystemStore.connect(owner).incNetworkTokensMinted(anchor.address, 1);
        expect(await liquidityProtectionSystemStore.networkTokensMinted(anchor.address)).to.be.equal('1');
        expect(await liquidityProtectionSystemStore.connect(owner).decNetworkTokensMinted(anchor.address, 1))
            .to.emit(liquidityProtectionSystemStore, 'NetworkTokensMintedUpdated')
            .withArgs(anchor.address, '1', '0');
        expect(await liquidityProtectionSystemStore.networkTokensMinted(anchor.address)).to.be.equal('0');
    });
});
