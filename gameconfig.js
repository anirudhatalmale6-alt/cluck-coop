// Central game economy config. Tune these numbers to balance the game.

// How long a chicken takes to lay one egg. 6 hours = 3 eggs/day.
const LAY_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Max eggs a single chicken can hold before it stops laying (encourages return visits,
// but generous enough that a player losing a day isn't punished hard).
const MAX_EGGS_PER_CHICKEN = 8;

// New players start with this many coins and one free basic hen.
const STARTING_COINS = 150;
const STARTING_CHICKEN = 'basic';

// Chicken breeds. Each breed lays its own egg type.
// price   = coins to buy one
// eggType = which egg it produces
// eggValue = coins earned when that egg is sold at the NPC market
const BREEDS = {
  basic:   { id: 'basic',   name: 'White Hen',   emoji: '🐔', price: 100,    eggType: 'white',   eggEmoji: '🥚', eggValue: 25 },
  brown:   { id: 'brown',   name: 'Brown Hen',   emoji: '🐓', price: 600,    eggType: 'brown',   eggEmoji: '🟤', eggValue: 130 },
  silver:  { id: 'silver',  name: 'Silver Hen',  emoji: '🦤', price: 3000,   eggType: 'silver',  eggEmoji: '⚪', eggValue: 650 },
  golden:  { id: 'golden',  name: 'Golden Hen',  emoji: '🐤', price: 15000,  eggType: 'golden',  eggEmoji: '🟡', eggValue: 3400 },
  diamond: { id: 'diamond', name: 'Diamond Hen', emoji: '🦚', price: 75000,  eggType: 'diamond', eggEmoji: '💎', eggValue: 18000 },
};

// Coin packs sold for real money (in-app purchase). This is the legit monetization.
// price is in USD. In the demo these just credit coins instantly (no real payment yet).
const COIN_PACKS = [
  { id: 'pack_small',  coins: 1000,    price: 0.99,  bonus: 0 },
  { id: 'pack_medium', coins: 6000,    price: 4.99,  bonus: 1000 },
  { id: 'pack_large',  coins: 15000,   price: 9.99,  bonus: 3500 },
  { id: 'pack_mega',   coins: 90000,   price: 49.99, bonus: 30000 },
];

// Farm starts with this many chicken slots; each extra slot costs more.
const BASE_SLOTS = 6;
const MAX_SLOTS = 40;
const slotPrice = (currentSlots) => Math.round(500 * Math.pow(1.35, currentSlots - BASE_SLOTS));

// Referral rewards. When a new player signs up with someone's code:
//  - the new player gets REFERRAL_BONUS_NEW extra coins
//  - the referrer gets REFERRAL_BONUS_REFERRER coins added to their farm
const REFERRAL_BONUS_NEW = 300;
const REFERRAL_BONUS_REFERRER = 500;

module.exports = {
  LAY_INTERVAL_MS,
  MAX_EGGS_PER_CHICKEN,
  STARTING_COINS,
  STARTING_CHICKEN,
  BREEDS,
  COIN_PACKS,
  BASE_SLOTS,
  MAX_SLOTS,
  slotPrice,
  REFERRAL_BONUS_NEW,
  REFERRAL_BONUS_REFERRER,
};
