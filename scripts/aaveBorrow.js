const { getNamedAccounts, ethers, network } = require("hardhat")
const { getWeth, AMOUNT } = require("./getWeth")
const { networkConfig } = require("../helper-hardhat-config")

async function main() {
    await getWeth()
    const { deployer } = await getNamedAccounts()
    // Lending Pool Provider Address (Mainnet): 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    const lendingPool = await getLendingPool(deployer)
    console.log(`Lending Pool Address: ${lendingPool.address}`)

    // Deposit
    const wethTokenAddress = networkConfig[network.config.chainId].wethToken
    // Approve
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("Depositing...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited")

    let { availableBorrowsETH } = await getBorrowUserData(lendingPool, deployer)
    // USD conversion rate
    const daiPrice = await getDaiPrice()
    const amountDaiToBorrow =
        availableBorrowsETH.toString() * 0.5 * (1 / daiPrice.toNumber())
    const amountDaiToBorrowWei = ethers.utils.parseEther(
        amountDaiToBorrow.toString()
    )
    console.log(`DAI Borrow Available: ${amountDaiToBorrowWei}`)

    // Borrow
    const daiTokenAddress = networkConfig[network.config.chainId].daiToken
    await borrowDai(
        daiTokenAddress,
        lendingPool,
        amountDaiToBorrowWei,
        deployer
    )
    await getBorrowUserData(lendingPool, deployer)

    // Repay
    await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
    await getBorrowUserData(lendingPool, deployer)
}

async function repay(amount, daiAddress, lendingPool, account) {
    await approveErc20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("Repaid!")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrow, account) {
    const tx = await lendingPool.borrow(
        daiAddress,
        amountDaiToBorrow,
        1,
        0,
        account
    )
    await tx.wait(1)
    console.log("Borrow successful!")
}

async function getDaiPrice() {
    // DAI/ETH Feed: 0x773616e4d11a78f511299002da57a0a94577f1f4
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        networkConfig[network.config.chainId].daiEthPriceFeed
    )
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`ETH/DAI price: ${price.toString()}`)
    return price
}

async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(`ETH Deposited: ${totalCollateralETH}`)
    console.log(`ETH Borrowed: ${totalDebtETH}`)
    console.log(`Borrow Available: ${availableBorrowsETH}`)
    return { availableBorrowsETH, totalDebtETH }
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[network.config.chainId].lendingPoolAddressesProvider,
        account
    )
    const lendingPoolAddress =
        await lendingPoolAddressesProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt(
        "ILendingPool",
        lendingPoolAddress,
        account
    )
    return lendingPool
}

async function approveErc20(
    erc20Address,
    spenderAddress,
    amountToSpend,
    account
) {
    const erc20Token = await ethers.getContractAt(
        "IERC20",
        erc20Address,
        account
    )
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

main().then(() =>
    process.exit(0).catch((error) => {
        console.error(error)
        process.exit(1)
    })
)
