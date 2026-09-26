/// Any-shop vouchers (共通券): spendable at every registered shop, including chains.
module machi_voucher::any_voucher;

use sui::coin;

public struct ANY_VOUCHER has drop {}

#[allow(deprecated_usage)]
fun init(otw: ANY_VOUCHER, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        otw,
        0,
        b"MVANY",
        b"Machi any-shop voucher",
        b"Premium voucher for any registered shop (demo)",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(cap, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ANY_VOUCHER {}, ctx);
}
