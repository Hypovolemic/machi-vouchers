/// A premium-voucher program run by a chamber of commerce and funded by a city.
///
/// Vouchers are Closed-Loop Tokens: their policy allows only `spend`, and only with a `ShopRule`
/// approval that `pay_local` / `pay_any` add after checking the shop. There is no rule for
/// `transfer`, `to_coin` or `from_coin`, so vouchers can't be sent to anyone or turned into coins.
/// A payment spends the voucher and pays the shop from the program vault in the same transaction.
module machi_voucher::program;

use machi_voucher::any_voucher::ANY_VOUCHER;
use machi_voucher::djpy::DJPY;
use machi_voucher::local_voucher::LOCAL_VOUCHER;
use std::string::String;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;
use sui::table::{Self, Table};
use sui::token::{Self, Token, TokenPolicy};

// Shop tiers.
const SMALL: u8 = 0;
const CHAIN: u8 = 1;

const BPS: u64 = 10_000;
const DAY_MS: u64 = 86_400_000;
/// Stamps follow the calendar day in Japan (UTC+9).
const JST_OFFSET_MS: u64 = 9 * 3_600_000;

const EProgramEnded: u64 = 1;
const ESaleClosed: u64 = 2;
const ESoldOut: u64 = 3;
const EWrongPayment: u64 = 4;
const ENotFunded: u64 = 5;
const EShopNotRegistered: u64 = 6;
const EShopSuspended: u64 = 7;
const ESmallShopOnly: u64 = 8;
const ENotStaff: u64 = 9;
const ESelfStamp: u64 = 10;
const EAlreadyStampedToday: u64 = 11;
const ENotEnded: u64 = 12;
const EWrongProgram: u64 = 13;
const EBadConfig: u64 = 14;
const EZeroAmount: u64 = 15;

/// Held by the chamber (the issuer). One per published package.
public struct IssuerCap has key, store { id: UID }

/// The approval our pay functions add to a voucher `spend` request.
public struct ShopRule has drop {}

public struct Shop has store, drop { name: String, tier: u8, active: bool }

public struct StampCard has store, drop { count: u64, rally_shops: vector<address> }

public struct StampKey has copy, drop, store { resident: address, shop: address }

public struct Program has key {
    id: UID,
    funder: address,
    price: u64,
    premium_bps: u64,
    local_share_bps: u64,
    max_sets: u64,
    sets_sold: u64,
    rally_target: u64,
    rally_bonus: u64,
    bonuses_left: u64,
    sale_end_ms: u64,
    use_end_ms: u64,
    required_funding: u64,
    funded: u64,
    closed: bool,
    vault: Balance<DJPY>,
    shops: Table<address, Shop>,
    /// Staff address -> the shop they stamp for. A shop's own address is its first staff member.
    staff: Table<address, address>,
    cards: Table<address, StampCard>,
    /// Last JST day index a resident was stamped at a shop.
    last_stamp: Table<StampKey, u64>,
    any_cap: TreasuryCap<ANY_VOUCHER>,
    local_cap: TreasuryCap<LOCAL_VOUCHER>,
}

/// A single-use right to buy `sets` voucher sets (the town's purchase-ticket postcard).
public struct PurchaseRight has key { id: UID, program: ID, sets: u64 }

/// Sent to a resident who completes the stamp rally; claimed into small-shop vouchers.
public struct BonusTicket has key { id: UID, program: ID, amount: u64 }

public struct ProgramLaunched has copy, drop { program: ID, funder: address, required_funding: u64 }
public struct Funded has copy, drop { program: ID, funder: address, amount: u64 }
public struct ShopRegistered has copy, drop { program: ID, shop: address, tier: u8 }
public struct ShopStatusChanged has copy, drop { program: ID, shop: address, active: bool }
public struct Purchased has copy, drop { program: ID, resident: address, sets: u64, amount: u64 }
public struct Paid has copy, drop {
    program: ID,
    resident: address,
    shop: address,
    amount: u64,
    local: bool,
}
public struct Stamped has copy, drop {
    program: ID,
    resident: address,
    shop: address,
    by: address,
    count: u64,
    distinct: u64,
}
public struct BonusIssued has copy, drop { program: ID, resident: address, amount: u64 }
public struct BonusClaimed has copy, drop { program: ID, resident: address, amount: u64 }
public struct ProgramClosed has copy, drop { program: ID, returned: u64, funder: address }

fun init(ctx: &mut TxContext) {
    transfer::transfer(IssuerCap { id: object::new(ctx) }, ctx.sender());
}

/// Creates the program and both voucher policies. The voucher TreasuryCaps move into the
/// program, so from here on vouchers are only minted by `buy` and `claim_bonus`.
/// The policy caps go to the issuer on purpose: only the chamber may ever change voucher rules.
#[allow(lint(self_transfer))]
public fun launch(
    _issuer: &IssuerCap,
    any_cap: TreasuryCap<ANY_VOUCHER>,
    local_cap: TreasuryCap<LOCAL_VOUCHER>,
    funder: address,
    price: u64,
    premium_bps: u64,
    local_share_bps: u64,
    max_sets: u64,
    rally_target: u64,
    rally_bonus: u64,
    max_bonuses: u64,
    sale_end_ms: u64,
    use_end_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(price > 0 && max_sets > 0 && rally_target > 0, EBadConfig);
    assert!(local_share_bps <= BPS, EBadConfig);
    assert!(sale_end_ms > clock.timestamp_ms() && use_end_ms >= sale_end_ms, EBadConfig);

    let (mut any_policy, any_policy_cap) = token::new_policy(&any_cap, ctx);
    token::add_rule_for_action<ANY_VOUCHER, ShopRule>(
        &mut any_policy,
        &any_policy_cap,
        token::spend_action(),
        ctx,
    );
    let (mut local_policy, local_policy_cap) = token::new_policy(&local_cap, ctx);
    token::add_rule_for_action<LOCAL_VOUCHER, ShopRule>(
        &mut local_policy,
        &local_policy_cap,
        token::spend_action(),
        ctx,
    );
    token::share_policy(any_policy);
    token::share_policy(local_policy);
    transfer::public_transfer(any_policy_cap, ctx.sender());
    transfer::public_transfer(local_policy_cap, ctx.sender());

    // Premium per set, rounded up so the reserve can never fall short.
    let premium_per_set = (price * premium_bps + BPS - 1) / BPS;
    let required = max_sets * premium_per_set + max_bonuses * rally_bonus;
    let program = Program {
        id: object::new(ctx),
        funder,
        price,
        premium_bps,
        local_share_bps,
        max_sets,
        sets_sold: 0,
        rally_target,
        rally_bonus,
        bonuses_left: max_bonuses,
        sale_end_ms,
        use_end_ms,
        required_funding: required,
        funded: 0,
        closed: false,
        vault: balance::zero(),
        shops: table::new(ctx),
        staff: table::new(ctx),
        cards: table::new(ctx),
        last_stamp: table::new(ctx),
        any_cap,
        local_cap,
    };
    event::emit(ProgramLaunched {
        program: object::id(&program),
        funder,
        required_funding: required,
    });
    transfer::share_object(program);
}

/// The city deposits the premium and bonus reserve. Sales open once it is fully funded.
public fun fund_subsidy(p: &mut Program, payment: Coin<DJPY>, ctx: &TxContext) {
    assert!(!p.closed, EProgramEnded);
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    p.funded = p.funded + amount;
    p.vault.join(payment.into_balance());
    event::emit(Funded { program: object::id(p), funder: ctx.sender(), amount });
}

public fun register_shop(
    _issuer: &IssuerCap,
    p: &mut Program,
    owner: address,
    name: String,
    tier: u8,
) {
    assert!(tier == SMALL || tier == CHAIN, EBadConfig);
    if (p.shops.contains(owner)) { p.shops.remove(owner); };
    p.shops.add(owner, Shop { name, tier, active: true });
    if (!p.staff.contains(owner)) { p.staff.add(owner, owner); };
    event::emit(ShopRegistered { program: object::id(p), shop: owner, tier });
}

public fun suspend_shop(_issuer: &IssuerCap, p: &mut Program, owner: address, active: bool) {
    assert!(p.shops.contains(owner), EShopNotRegistered);
    p.shops.borrow_mut(owner).active = active;
    event::emit(ShopStatusChanged { program: object::id(p), shop: owner, active });
}

public fun grant_right(
    _issuer: &IssuerCap,
    p: &Program,
    resident: address,
    sets: u64,
    ctx: &mut TxContext,
) {
    assert!(!p.closed, EProgramEnded);
    assert!(sets > 0 && sets <= p.max_sets, EBadConfig);
    transfer::transfer(PurchaseRight { id: object::new(ctx), program: object::id(p), sets }, resident);
}

/// Pays the set price in dJPY and receives small-shop and any-shop vouchers.
public fun buy(
    p: &mut Program,
    right: PurchaseRight,
    payment: Coin<DJPY>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let PurchaseRight { id, program, sets } = right;
    id.delete();
    assert!(program == object::id(p), EWrongProgram);
    assert!(!p.closed && clock.timestamp_ms() <= p.sale_end_ms, ESaleClosed);
    assert!(p.funded >= p.required_funding, ENotFunded);
    assert!(p.sets_sold + sets <= p.max_sets, ESoldOut);
    assert!(payment.value() == p.price * sets, EWrongPayment);
    p.vault.join(payment.into_balance());
    p.sets_sold = p.sets_sold + sets;

    let face = p.price * sets * (BPS + p.premium_bps) / BPS;
    let local_amount = face * p.local_share_bps / BPS;
    token::keep(token::mint(&mut p.local_cap, local_amount, ctx), ctx);
    token::keep(token::mint(&mut p.any_cap, face - local_amount, ctx), ctx);
    event::emit(Purchased { program, resident: ctx.sender(), sets, amount: face });
}

/// Small-shop vouchers: only at an active, registered small shop, within the use period.
public fun pay_local(
    p: &mut Program,
    policy: &mut TokenPolicy<LOCAL_VOUCHER>,
    voucher: Token<LOCAL_VOUCHER>,
    shop: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    check_shop(p, shop, clock, true);
    let amount = voucher.value();
    assert!(amount > 0, EZeroAmount);
    let mut request = token::spend(voucher, ctx);
    token::add_approval(ShopRule {}, &mut request, ctx);
    let (_, _, _, _) = token::confirm_request_mut(policy, request, ctx);
    payout(p, shop, amount, true, clock, ctx);
}

/// Any-shop vouchers: at any active, registered shop, within the use period.
public fun pay_any(
    p: &mut Program,
    policy: &mut TokenPolicy<ANY_VOUCHER>,
    voucher: Token<ANY_VOUCHER>,
    shop: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    check_shop(p, shop, clock, false);
    let amount = voucher.value();
    assert!(amount > 0, EZeroAmount);
    let mut request = token::spend(voucher, ctx);
    token::add_approval(ShopRule {}, &mut request, ctx);
    let (_, _, _, _) = token::confirm_request_mut(policy, request, ctx);
    payout(p, shop, amount, false, clock, ctx);
}

/// Staff "+1": the sender must be staff of an active shop and can't stamp themselves.
public fun add_stamp(p: &mut Program, resident: address, clock: &Clock, ctx: &mut TxContext) {
    assert!(!p.closed && clock.timestamp_ms() <= p.use_end_ms, EProgramEnded);
    let staff = ctx.sender();
    assert!(p.staff.contains(staff), ENotStaff);
    let shop = *p.staff.borrow(staff);
    assert!(p.shops.borrow(shop).active, EShopSuspended);
    assert!(resident != staff && resident != shop, ESelfStamp);
    assert!(!stamped_today(p, resident, shop, clock), EAlreadyStampedToday);
    stamp(p, resident, shop, staff, clock, ctx);
}

/// Turns a rally bonus ticket into small-shop vouchers, backed by the reserve in the vault.
public fun claim_bonus(p: &mut Program, ticket: BonusTicket, clock: &Clock, ctx: &mut TxContext) {
    let BonusTicket { id, program, amount } = ticket;
    id.delete();
    assert!(program == object::id(p), EWrongProgram);
    assert!(!p.closed && clock.timestamp_ms() <= p.use_end_ms, EProgramEnded);
    token::keep(token::mint(&mut p.local_cap, amount, ctx), ctx);
    event::emit(BonusClaimed { program, resident: ctx.sender(), amount });
}

/// After the use period, returns everything left in the vault to the funder, once.
public fun close(_issuer: &IssuerCap, p: &mut Program, clock: &Clock, ctx: &mut TxContext) {
    assert!(clock.timestamp_ms() > p.use_end_ms, ENotEnded);
    assert!(!p.closed, EProgramEnded);
    p.closed = true;
    let returned = p.vault.value();
    let rest = p.vault.split(returned);
    transfer::public_transfer(coin::from_balance(rest, ctx), p.funder);
    event::emit(ProgramClosed { program: object::id(p), returned, funder: p.funder });
}

// === Internal ===

fun check_shop(p: &Program, shop: address, clock: &Clock, local: bool) {
    assert!(!p.closed && clock.timestamp_ms() <= p.use_end_ms, EProgramEnded);
    assert!(p.shops.contains(shop), EShopNotRegistered);
    let s = p.shops.borrow(shop);
    assert!(s.active, EShopSuspended);
    if (local) { assert!(s.tier == SMALL, ESmallShopOnly); };
}

fun jst_day(clock: &Clock): u64 { (clock.timestamp_ms() + JST_OFFSET_MS) / DAY_MS }

fun stamped_today(p: &Program, resident: address, shop: address, clock: &Clock): bool {
    let key = StampKey { resident, shop };
    p.last_stamp.contains(key) && *p.last_stamp.borrow(key) == jst_day(clock)
}

/// Moves exactly `amount` dJPY from the vault to the shop, then stamps the card once per day.
fun payout(
    p: &mut Program,
    shop: address,
    amount: u64,
    local: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let resident = ctx.sender();
    let paid = p.vault.split(amount);
    transfer::public_transfer(coin::from_balance(paid, ctx), shop);
    event::emit(Paid { program: object::id(p), resident, shop, amount, local });
    if (resident != shop && !stamped_today(p, resident, shop, clock)) {
        stamp(p, resident, shop, resident, clock, ctx);
    };
}

/// Records the day's stamp. The rally counts distinct small shops; reaching the target sends a
/// bonus ticket (while the bonus budget lasts) and starts a new round.
fun stamp(
    p: &mut Program,
    resident: address,
    shop: address,
    by: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let program = object::id(p);
    let day = jst_day(clock);
    let key = StampKey { resident, shop };
    if (p.last_stamp.contains(key)) {
        *p.last_stamp.borrow_mut(key) = day;
    } else {
        p.last_stamp.add(key, day);
    };

    let small = p.shops.borrow(shop).tier == SMALL;
    let target = p.rally_target;
    if (!p.cards.contains(resident)) {
        p.cards.add(resident, StampCard { count: 0, rally_shops: vector[] });
    };
    // Finish with the card before touching other program fields.
    let card = p.cards.borrow_mut(resident);
    card.count = card.count + 1;
    if (small && !card.rally_shops.contains(&shop)) { card.rally_shops.push_back(shop); };
    let count = card.count;
    let distinct = card.rally_shops.length();
    let complete = distinct >= target;
    if (complete) { card.rally_shops = vector[]; };
    event::emit(Stamped { program, resident, shop, by, count, distinct });

    if (complete && p.bonuses_left > 0) {
        p.bonuses_left = p.bonuses_left - 1;
        let amount = p.rally_bonus;
        transfer::transfer(BonusTicket { id: object::new(ctx), program, amount }, resident);
        event::emit(BonusIssued { program, resident, amount });
    };
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

#[test_only]
public fun vault_value(p: &Program): u64 { p.vault.value() }

#[test_only]
public fun rally_progress(p: &Program, resident: address): u64 {
    if (p.cards.contains(resident)) p.cards.borrow(resident).rally_shops.length() else 0
}
