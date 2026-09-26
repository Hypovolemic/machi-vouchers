/// dJPY: a clearly labelled demo yen for Sui testnet. Never real money.
module machi_voucher::djpy;

use sui::coin;

public struct DJPY has drop {}

#[allow(deprecated_usage)]
fun init(otw: DJPY, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        otw,
        0,
        b"DJPY",
        b"Demo Japanese yen",
        b"Testnet demo settlement token for Machi Vouchers. Not real money.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(cap, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(DJPY {}, ctx);
}
