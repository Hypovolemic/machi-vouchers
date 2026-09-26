/// Small-shop vouchers (中小店舗券): spendable only at registered small and independent shops.
module machi_voucher::local_voucher;

use sui::coin;

public struct LOCAL_VOUCHER has drop {}

#[allow(deprecated_usage)]
fun init(otw: LOCAL_VOUCHER, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        otw,
        0,
        b"MVLOCAL",
        b"Machi small-shop voucher",
        b"Premium voucher for small and independent shops only (demo)",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(cap, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(LOCAL_VOUCHER {}, ctx);
}
