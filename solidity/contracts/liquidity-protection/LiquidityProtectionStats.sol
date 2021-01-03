// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.6.12;
import "./interfaces/ILiquidityProtectionStats.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../utility/Utils.sol";
import "../utility/SafeMath.sol";
import "../token/interfaces/IDSToken.sol";
import "../token/interfaces/IERC20Token.sol";

/**
 * @dev This contract aggregates the statistics of the liquidity protection mechanism.
 */
contract LiquidityProtectionStats is ILiquidityProtectionStats, AccessControl, Utils {
    using SafeMath for uint256;

    bytes32 public constant ROLE_OWNER = keccak256("ROLE_OWNER");
    bytes32 public constant ROLE_SEEDER = keccak256("ROLE_SEEDER");

    mapping(IDSToken => uint256) public totalPoolAmount;
    mapping(IDSToken => mapping(IERC20Token => uint256)) public totalReserveAmount;
    mapping(IDSToken => mapping(IERC20Token => mapping(address => uint256))) public totalProviderAmount;

    // allows execution by the owner only
    modifier ownerOnly {
        require(hasRole(ROLE_OWNER, msg.sender), "ERR_ACCESS_DENIED");
        _;
    }

    // allows execution by the seeder only
    modifier seederOnly {
        require(hasRole(ROLE_SEEDER, msg.sender), "ERR_ACCESS_DENIED");
        _;
    }

    constructor() public {
        // set up administrative roles.
        _setRoleAdmin(ROLE_OWNER, ROLE_OWNER);
        _setRoleAdmin(ROLE_SEEDER, ROLE_OWNER);

        // allow the deployer to initially govern the contract.
        _setupRole(ROLE_OWNER, msg.sender);
    }

    /**
     * @dev increases the total amounts
     *
     * @param _provider         liquidity provider address
     * @param _poolToken        pool token address
     * @param _reserveToken     reserve token address
     * @param _poolAmount       pool token amount
     * @param _reserveAmount    reserve token amount
     */
    function increaseTotalAmounts(
        address _provider,
        IDSToken _poolToken,
        IERC20Token _reserveToken,
        uint256 _poolAmount,
        uint256 _reserveAmount
    ) external override ownerOnly {
        totalPoolAmount[_poolToken] = totalPoolAmount[_poolToken].add(_poolAmount);
        totalReserveAmount[_poolToken][_reserveToken] = totalReserveAmount[_poolToken][_reserveToken].add(_reserveAmount);
        totalProviderAmount[_poolToken][_reserveToken][_provider] = totalProviderAmount[_poolToken][_reserveToken][_provider].add(_reserveAmount);
    }

    /**
     * @dev decreases the total amounts
     *
     * @param _provider         liquidity provider address
     * @param _poolToken        pool token address
     * @param _reserveToken     reserve token address
     * @param _poolAmount       pool token amount
     * @param _reserveAmount    reserve token amount
     */
    function decreaseTotalAmounts(
        address _provider,
        IDSToken _poolToken,
        IERC20Token _reserveToken,
        uint256 _poolAmount,
        uint256 _reserveAmount
    ) external override ownerOnly {
        totalPoolAmount[_poolToken] = totalPoolAmount[_poolToken].sub(_poolAmount);
        totalReserveAmount[_poolToken][_reserveToken] = totalReserveAmount[_poolToken][_reserveToken].sub(_reserveAmount);
        totalProviderAmount[_poolToken][_reserveToken][_provider] = totalProviderAmount[_poolToken][_reserveToken][_provider].sub(_reserveAmount);
    }

    /**
     * @dev resets the total amounts
     *
     * @param _provider         liquidity provider address
     * @param _poolToken        pool token address
     * @param _reserveToken     reserve token address
     */
    function resetTotalAmounts(
        address _provider,
        IDSToken _poolToken,
        IERC20Token _reserveToken
    ) external override ownerOnly {
        totalPoolAmount[_poolToken] = 0;
        totalReserveAmount[_poolToken][_reserveToken] = 0;
        totalProviderAmount[_poolToken][_reserveToken][_provider] = 0;
    }

    function seed(
        address[] memory _tokens,
        address[] memory _reserve0s,
        address[] memory _reserve1s,
        address[] memory _providers,
        uint256[] memory _poolAmounts,
        uint256[] memory _reserve0Amounts,
        uint256[] memory _reserve1Amounts,
        uint256[] memory _provider0Amounts,
        uint256[] memory _provider1Amounts
    ) external seederOnly {
        uint256 length = _tokens.length;
        require(length == _reserve0s.length);
        require(length == _reserve1s.length);
        require(length == _providers.length);
        require(length == _poolAmounts.length);
        require(length == _reserve0Amounts.length);
        require(length == _reserve1Amounts.length);
        require(length == _provider0Amounts.length);
        require(length == _provider1Amounts.length);
        for (uint256 i = 0; i < length; i++) {
            totalPoolAmount[IDSToken(_tokens[i])] = _poolAmounts[i];
            totalReserveAmount[IDSToken(_tokens[i])][IERC20Token(_reserve0s[i])] = _reserve0Amounts[i];
            totalReserveAmount[IDSToken(_tokens[i])][IERC20Token(_reserve1s[i])] = _reserve1Amounts[i];
            totalProviderAmount[IDSToken(_tokens[i])][IERC20Token(_reserve0s[i])][_providers[i]] = _provider0Amounts[i];
            totalProviderAmount[IDSToken(_tokens[i])][IERC20Token(_reserve1s[i])][_providers[i]] = _provider1Amounts[i];
        }
    }
}
