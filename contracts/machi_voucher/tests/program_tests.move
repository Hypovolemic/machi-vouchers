#[test_only]
module machi_voucher::program_tests;

use machi_voucher::any_voucher::{Self, ANY_VOUCHER};
use machi_voucher::djpy::{Self, DJPY};
use machi_voucher::local_voucher::{Self, LOCAL_VOUCHER};
use machi_voucher::program::{Self, IssuerCap, Program, PurchaseRight, BonusTicket};
use std::string::utf8;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::test_scenario::{Self as ts, Scenario};
use sui::token::{Self, Token, TokenPolicy};

const ISSUER: address = @0xC0;
const FUNDER: address = @0xC1;
const RESIDENT: address = @0xA0;
const OTHER: address = @0xA1;
const RAMEN: address = @0x51;
const BAKERY: address = @0x52;
const TEA: address = @0x53;
const FLOWERS: address = @0x54;
const BOOKS: address = @0x55;
const MARKET: address = @0x5C;

const BASE: u64 = 1_000_000;
const DAY: u64 = 86_400_000;
// Suginami-style set: ¥10,000 buys ¥12,000, half small-shop only; 10 sets, 2 bonuses of ¥500.
const REQUIRED: u64 = 10 * 2_000 + 2 * 500;

fun setup(): (Scenario, Clock) {
    let mut sc = ts::begin(ISSUER);
    any_voucher::init_for_testing(sc.ctx());
    local_voucher::init_for_testing(sc.ctx());
    djpy::init_for_testing(sc.ctx());
    program::init_for_testing(sc.ctx());
    let mut clock = clock::create_for_testing(sc.ctx());
    clock.set_for_testing(BASE);

    sc.next_tx(ISSUER);
    let cap = sc.take_from_sender<IssuerCap>();
    let any = sc.take_from_sender<TreasuryCap<ANY_VOUCHER>>();
    let local = sc.take_from_sender<TreasuryCap<LOCAL_VOUCHER>>();
    program::launch(
        &cap, any, local, FUNDER, 10_000, 2_000, 5_000, 10, 5, 500, 2,
        BASE + DAY, BASE + 2 * DAY, &clock, sc.ctx(),
    );
    sc.return_to_sender(cap);

    sc.next_tx(ISSUER);
    let cap = sc.take_from_sender<IssuerCap>();
    let mut p = sc.take_shared<Program>();
    program::register_shop(&cap, &mut p, RAMEN, utf8(b"Ramen Taro"), 0);
    program::register_shop(&cap, &mut p, BAKERY, utf8(b"Komugi Bakery"), 0);
    program::register_shop(&cap, &mut p, TEA, utf8(b"Midori Tea House"), 0);
    program::register_shop(&cap, &mut p, FLOWERS, utf8(b"Hana Florist"), 0);
    program::register_shop(&cap, &mut p, BOOKS, utf8(b"Machi Books"), 0);
    program::register_shop(&cap, &mut p, MARKET, utf8(b"Everyday Market"), 1);
    sc.return_to_sender(cap);
    ts::return_shared(p);
    (sc, clock)
}

fun fund(sc: &mut Scenario, amount: u64) {
    sc.next_tx(FUNDER);
    let mut p = sc.take_shared<Program>();
    let money = coin::mint_for_testing<DJPY>(amount, sc.ctx());
    program::fund_subsidy(&mut p, money, sc.ctx());
    ts::return_shared(p);
}

fun grant(sc: &mut Scenario, resident: address) {
    sc.next_tx(ISSUER);
    let cap = sc.take_from_sender<IssuerCap>();
    let p = sc.take_shared<Program>();
    program::grant_right(&cap, &p, resident, 1, sc.ctx());
    sc.return_to_sender(cap);
    ts::return_shared(p);
}

fun buy(sc: &mut Scenario, clock: &Clock, resident: address, paid: u64) {
    sc.next_tx(resident);
    let mut p = sc.take_shared<Program>();
    let right = sc.take_from_sender<PurchaseRight>();
    let money = coin::mint_for_testing<DJPY>(paid, sc.ctx());
    program::buy(&mut p, right, money, clock, sc.ctx());
    ts::return_shared(p);
}

/// A funded program where RESIDENT holds one set: ¥6,000 small-shop + ¥6,000 any-shop.
fun ready(): (Scenario, Clock) {
    let (mut sc, clock) = setup();
    fund(&mut sc, REQUIRED);
    grant(&mut sc, RESIDENT);
    buy(&mut sc, &clock, RESIDENT, 10_000);
    (sc, clock)
}

fun pay_local(sc: &mut Scenario, clock: &Clock, shop: address, amount: u64) {
    sc.next_tx(RESIDENT);
    let mut p = sc.take_shared<Program>();
    let mut policy = sc.take_shared<TokenPolicy<LOCAL_VOUCHER>>();
    let mut vouchers = sc.take_from_sender<Token<LOCAL_VOUCHER>>();
    let part = vouchers.split(amount, sc.ctx());
    program::pay_local(&mut p, &mut policy, part, shop, clock, sc.ctx());
    sc.return_to_sender(vouchers);
    ts::return_shared(policy);
    ts::return_shared(p);
}

fun pay_any(sc: &mut Scenario, clock: &Clock, shop: address, amount: u64) {
    sc.next_tx(RESIDENT);
    let mut p = sc.take_shared<Program>();
    let mut policy = sc.take_shared<TokenPolicy<ANY_VOUCHER>>();
    let mut vouchers = sc.take_from_sender<Token<ANY_VOUCHER>>();
    let part = vouchers.split(amount, sc.ctx());
    program::pay_any(&mut p, &mut policy, part, shop, clock, sc.ctx());
    sc.return_to_sender(vouchers);
    ts::return_shared(policy);
    ts::return_shared(p);
}

fun staff_stamp(sc: &mut Scenario, clock: &Clock, staff: address, resident: address) {
    sc.next_tx(staff);
    let mut p = sc.take_shared<Program>();
    program::add_stamp(&mut p, resident, clock, sc.ctx());
    ts::return_shared(p);
}

fun finish(sc: Scenario, clock: Clock) {
    clock.destroy_for_testing();
    sc.end();
}

// U1
#[test, expected_failure(abort_code = program::ENotFunded)]
fun refuses_buy_before_funding() {
    let (mut sc, clock) = setup();
    fund(&mut sc, REQUIRED - 1);
    grant(&mut sc, RESIDENT);
    buy(&mut sc, &clock, RESIDENT, 10_000);
    finish(sc, clock);
}

// U2
#[test]
fun buy_mints_the_split_and_fills_the_vault() {
    let (mut sc, clock) = ready();
    sc.next_tx(RESIDENT);
    let local = sc.take_from_sender<Token<LOCAL_VOUCHER>>();
    let any = sc.take_from_sender<Token<ANY_VOUCHER>>();
    assert!(local.value() == 6_000);
    assert!(any.value() == 6_000);
    sc.return_to_sender(local);
    sc.return_to_sender(any);
    let p = sc.take_shared<Program>();
    assert!(program::vault_value(&p) == REQUIRED + 10_000);
    ts::return_shared(p);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = program::EWrongPayment)]
fun refuses_wrong_price() {
    let (mut sc, clock) = setup();
    fund(&mut sc, REQUIRED);
    grant(&mut sc, RESIDENT);
    buy(&mut sc, &clock, RESIDENT, 9_999);
    finish(sc, clock);
}

// U3
#[test, expected_failure(abort_code = program::ESaleClosed)]
fun refuses_buy_after_sale_end() {
    let (mut sc, mut clock) = setup();
    fund(&mut sc, REQUIRED);
    grant(&mut sc, RESIDENT);
    clock.increment_for_testing(DAY + 1);
    buy(&mut sc, &clock, RESIDENT, 10_000);
    finish(sc, clock);
}

// U4: the shop receives exactly the voucher value, in the same transaction, and a stamp.
#[test]
fun small_shop_payment_pays_the_shop_and_stamps() {
    let (mut sc, clock) = ready();
    pay_local(&mut sc, &clock, RAMEN, 1_200);
    sc.next_tx(RAMEN);
    let takings = sc.take_from_sender<Coin<DJPY>>();
    assert!(takings.value() == 1_200);
    sc.return_to_sender(takings);
    let p = sc.take_shared<Program>();
    assert!(program::rally_progress(&p, RESIDENT) == 1);
    assert!(program::vault_value(&p) == REQUIRED + 10_000 - 1_200);
    ts::return_shared(p);
    finish(sc, clock);
}

// U5
#[test, expected_failure(abort_code = program::ESmallShopOnly)]
fun refuses_small_shop_vouchers_at_a_chain() {
    let (mut sc, clock) = ready();
    pay_local(&mut sc, &clock, MARKET, 800);
    finish(sc, clock);
}

// U6: any-shop vouchers work at a chain, but chains don't count toward the rally.
#[test]
fun any_shop_vouchers_work_at_a_chain() {
    let (mut sc, clock) = ready();
    pay_any(&mut sc, &clock, MARKET, 800);
    sc.next_tx(MARKET);
    let takings = sc.take_from_sender<Coin<DJPY>>();
    assert!(takings.value() == 800);
    sc.return_to_sender(takings);
    let p = sc.take_shared<Program>();
    assert!(program::rally_progress(&p, RESIDENT) == 0);
    ts::return_shared(p);
    finish(sc, clock);
}

// U7
#[test, expected_failure(abort_code = program::EShopNotRegistered)]
fun refuses_unregistered_shop() {
    let (mut sc, clock) = ready();
    pay_any(&mut sc, &clock, @0xBAD, 100);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = program::EShopSuspended)]
fun refuses_suspended_shop() {
    let (mut sc, clock) = ready();
    sc.next_tx(ISSUER);
    let cap = sc.take_from_sender<IssuerCap>();
    let mut p = sc.take_shared<Program>();
    program::suspend_shop(&cap, &mut p, RAMEN, false);
    sc.return_to_sender(cap);
    ts::return_shared(p);
    pay_local(&mut sc, &clock, RAMEN, 100);
    finish(sc, clock);
}

// U8
#[test, expected_failure(abort_code = program::EProgramEnded)]
fun refuses_payment_after_the_use_period() {
    let (mut sc, mut clock) = ready();
    clock.increment_for_testing(2 * DAY + 1);
    pay_local(&mut sc, &clock, RAMEN, 100);
    finish(sc, clock);
}

// U9: the policy has no transfer rule, so sending vouchers to someone else aborts.
#[test, expected_failure(abort_code = sui::token::EUnknownAction, location = sui::token)]
fun vouchers_cannot_be_sent_to_someone_else() {
    let (mut sc, clock) = ready();
    sc.next_tx(RESIDENT);
    let policy = sc.take_shared<TokenPolicy<LOCAL_VOUCHER>>();
    let mut vouchers = sc.take_from_sender<Token<LOCAL_VOUCHER>>();
    let part = vouchers.split(100, sc.ctx());
    let request = token::transfer(part, OTHER, sc.ctx());
    token::confirm_request(&policy, request, sc.ctx());
    sc.return_to_sender(vouchers);
    ts::return_shared(policy);
    finish(sc, clock);
}

// U10
#[test, expected_failure(abort_code = program::ENotStaff)]
fun refuses_stamp_from_non_staff() {
    let (mut sc, clock) = ready();
    staff_stamp(&mut sc, &clock, OTHER, RESIDENT);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = program::ESelfStamp)]
fun refuses_self_stamp() {
    let (mut sc, clock) = ready();
    staff_stamp(&mut sc, &clock, BAKERY, BAKERY);
    finish(sc, clock);
}

// U11
#[test, expected_failure(abort_code = program::EAlreadyStampedToday)]
fun refuses_second_stamp_same_shop_same_day() {
    let (mut sc, clock) = ready();
    staff_stamp(&mut sc, &clock, BAKERY, RESIDENT);
    staff_stamp(&mut sc, &clock, BAKERY, RESIDENT);
    finish(sc, clock);
}

#[test]
fun same_shop_stamps_again_the_next_day_without_double_counting() {
    let (mut sc, mut clock) = ready();
    staff_stamp(&mut sc, &clock, BAKERY, RESIDENT);
    clock.increment_for_testing(DAY);
    staff_stamp(&mut sc, &clock, BAKERY, RESIDENT);
    sc.next_tx(RESIDENT);
    let p = sc.take_shared<Program>();
    assert!(program::rally_progress(&p, RESIDENT) == 1);
    ts::return_shared(p);
    finish(sc, clock);
}

#[test]
fun a_second_payment_the_same_day_settles_without_a_second_stamp() {
    let (mut sc, clock) = ready();
    pay_local(&mut sc, &clock, RAMEN, 500);
    pay_local(&mut sc, &clock, RAMEN, 500);
    sc.next_tx(RESIDENT);
    let p = sc.take_shared<Program>();
    assert!(program::rally_progress(&p, RESIDENT) == 1);
    assert!(program::vault_value(&p) == REQUIRED + 10_000 - 1_000);
    ts::return_shared(p);
    finish(sc, clock);
}

// U12: five different small shops send a bonus ticket; claiming it mints small-shop vouchers.
#[test]
fun fifth_small_shop_earns_a_claimable_bonus() {
    let (mut sc, clock) = ready();
    pay_local(&mut sc, &clock, RAMEN, 100);
    pay_local(&mut sc, &clock, TEA, 100);
    pay_local(&mut sc, &clock, FLOWERS, 100);
    staff_stamp(&mut sc, &clock, BOOKS, RESIDENT);
    staff_stamp(&mut sc, &clock, BAKERY, RESIDENT);

    sc.next_tx(RESIDENT);
    let mut p = sc.take_shared<Program>();
    assert!(program::rally_progress(&p, RESIDENT) == 0); // a new round starts
    let ticket = sc.take_from_sender<BonusTicket>();
    program::claim_bonus(&mut p, ticket, &clock, sc.ctx());
    ts::return_shared(p);

    sc.next_tx(RESIDENT);
    let bonus = sc.take_from_sender<Token<LOCAL_VOUCHER>>();
    assert!(bonus.value() == 500);
    sc.return_to_sender(bonus);
    finish(sc, clock);
}

// U14
#[test, expected_failure(abort_code = program::ENotEnded)]
fun refuses_close_before_the_end() {
    let (mut sc, clock) = ready();
    sc.next_tx(ISSUER);
    let cap = sc.take_from_sender<IssuerCap>();
    let mut p = sc.take_shared<Program>();
    program::close(&cap, &mut p, &clock, sc.ctx());
    sc.return_to_sender(cap);
    ts::return_shared(p);
    finish(sc, clock);
}

#[test]
fun close_returns_the_rest_of_the_vault_to_the_funder() {
    let (mut sc, mut clock) = ready();
    pay_local(&mut sc, &clock, RAMEN, 1_200);
    clock.increment_for_testing(2 * DAY + 1);
    sc.next_tx(ISSUER);
    let cap = sc.take_from_sender<IssuerCap>();
    let mut p = sc.take_shared<Program>();
    program::close(&cap, &mut p, &clock, sc.ctx());
    assert!(program::vault_value(&p) == 0);
    sc.return_to_sender(cap);
    ts::return_shared(p);
    sc.next_tx(FUNDER);
    let refund = sc.take_from_sender<Coin<DJPY>>();
    assert!(refund.value() == REQUIRED + 10_000 - 1_200);
    sc.return_to_sender(refund);
    finish(sc, clock);
}
