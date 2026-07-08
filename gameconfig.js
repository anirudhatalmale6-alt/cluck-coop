// Central game economy config. Tune these numbers to balance the game.

// How long a chicken takes to lay one egg. Client spec: hatch every 3 hours.
const LAY_INTERVAL_MS = 3 * 60 * 60 * 1000;

// Max eggs a single chicken can hold before it stops laying (so an offline player
// who is away for a day isn't punished, but there's still a reason to come back).
const MAX_EGGS_PER_CHICKEN = 8;

// New players start fresh: NO free chicken (per client). They buy one right after
// registering. Buying is FREE for now (demo) — see DEMO_FREE_CHICKENS below.
const STARTING_COINS = 0;
const STARTING_CHICKEN = null;

// DEMO: chickens are free to buy for now. Flip to false to charge the real price.
const DEMO_FREE_CHICKENS = true;

// Chicken breeds (client spec). Each lays one egg per LAY_INTERVAL that is
// "worth" eggValue coins at the market.
//   price    = coins to buy one (charged only when DEMO_FREE_CHICKENS is false)
//   eggValue = coins earned when that egg is sold at the market
const BREEDS = {
  normal: { id: 'normal', name: 'Normal Chicken', emoji: '🐔', price: 500,  eggType: 'normal', eggEmoji: '🥚', eggValue: 30  },
  brown:  { id: 'brown',  name: 'Brown Chicken',  emoji: '🐓', price: 800,  eggType: 'brown',  eggEmoji: '🟤', eggValue: 50  },
  golden: { id: 'golden', name: 'Golden Chicken', emoji: '🐤', price: 1000, eggType: 'golden', eggEmoji: '🟡', eggValue: 100 },
};

// Old builds shipped extra breeds. Map any legacy breed/egg to a safe current one
// so existing players' chickens keep working after this update.
const LEGACY_BREED_ALIAS = {
  basic: 'normal', white: 'normal',
  silver: 'brown',
  diamond: 'golden',
};

// Resolve a breed key (new or legacy) to a breed object; never returns undefined.
function resolveBreed(key) {
  if (BREEDS[key]) return BREEDS[key];
  const alias = LEGACY_BREED_ALIAS[key];
  if (alias && BREEDS[alias]) return BREEDS[alias];
  return BREEDS.normal;
}

// Coin packs (in-app purchase). DEMO: these just credit coins instantly.
const COIN_PACKS = [
  { id: 'pack_small',  coins: 1000,  price: 0.99,  bonus: 0    },
  { id: 'pack_medium', coins: 6000,  price: 4.99,  bonus: 1000 },
  { id: 'pack_large',  coins: 15000, price: 9.99,  bonus: 3500 },
  { id: 'pack_mega',   coins: 90000, price: 49.99, bonus: 30000 },
];

// Farm starts with this many chicken slots; each extra slot costs more.
const BASE_SLOTS = 6;
const MAX_SLOTS = 40;
const slotPrice = (currentSlots) => Math.round(500 * Math.pow(1.35, currentSlots - BASE_SLOTS));

// Referral rewards.
// Coin bonus when a new player signs up with someone's code:
const REFERRAL_BONUS_NEW = 300;       // the new player
const REFERRAL_BONUS_REFERRER = 500;  // the referrer
// Milestone reward (client spec): for every N referred friends who actually BUY a
// chicken, the referrer earns 1 free chicken.
const REFERRALS_PER_FREE_CHICKEN = 10;
const FREE_CHICKEN_BREED = 'normal';

module.exports = {
  LAY_INTERVAL_MS,
  MAX_EGGS_PER_CHICKEN,
  STARTING_COINS,
  STARTING_CHICKEN,
  DEMO_FREE_CHICKENS,
  BREEDS,
  resolveBreed,
  COIN_PACKS,
  BASE_SLOTS,
  MAX_SLOTS,
  slotPrice,
  REFERRAL_BONUS_NEW,
  REFERRAL_BONUS_REFERRER,
  REFERRALS_PER_FREE_CHICKEN,
  FREE_CHICKEN_BREED,
};
