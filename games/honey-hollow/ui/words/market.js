// @ts-check
/**
 * Every sentence the market says: the stall and its customers, the eight
 * regulars in their own voices, the grocer's crate, the Honey Show and the
 * Winter Fair. The screens are ui/scenes/stall*.js.
 *
 * Plain objects and small functions. The screens hand in names and numbers
 * from the core; nothing here knows a rule.
 */

import { coins, jars, plural, capital, number, stars } from "../words.js";

// ───────────────────────── names of things ─────────────────────────

/** A trait as a customer says it ("something dark"). */
export const TRAIT_WORDS = {
  light: "light",
  amber: "amber",
  dark: "dark",
  mild: "mild",
  floral: "floral",
  fruity: "fruity",
  herbal: "herbal",
  strong: "strong",
};

/** What a customer asks for when they want a made thing: by good id, then by family. */
const ASK_FOR = {
  "good:candle": "a beeswax candle",
  "good:lavender-candle": "a lavender candle",
  "good:soap-lavender": "lavender soap",
  "good:soap-mint": "mint soap",
  "good:soap-thyme": "thyme soap",
  "good:balm": "honey lip balm",
  "good:wraps": "wax wraps",
  "good:basket": "a gift basket",
  "family:candle": "a candle",
  "family:soap": "a bar of soap",
  "family:balm": "lip balm",
  "family:wraps": "wax wraps",
  "family:basket": "a gift basket",
};

/** One and many of each made thing, by family: "2 bars of mint soap". */
const COUNT_OF = {
  candle: (n, name) => `${number(n)} ${name}${n === 1 ? "" : "s"}`,
  soap: (n, name) => `${plural(n, "bar")} of ${name}`,
  balm: (n, name) => `${plural(n, "tin")} of ${name}`,
  wraps: (n, name) => `${plural(n, "set")} of ${name}`,
  basket: (n, name) => `${number(n)} ${name}${n === 1 ? "" : "s"}`,
};

/**
 * "2 jars of lavender honey", "1 beeswax candle", "3 bars of mint soap".
 * @param {{ kind: string, name: string, family?: string | null }} info the core's productInfo
 * @param {number} n
 */
export function howMany(info, n) {
  const name = String(info?.name ?? "").toLowerCase();
  if (info?.kind === "honey") return `${jars(n)} of ${name}`;
  const count = COUNT_OF[info?.family ?? ""];
  return count ? count(n, name) : `${name} ×${number(n)}`;
}

/** The trait words under a jar on the shelf: "light · floral". */
export const traitLine = (traits) => (traits ?? []).map((t) => TRAIT_WORDS[t] ?? t).join(" · ");

// ───────────────────────── the stall ─────────────────────────

export const STALL = {
  /** Lettered on the little board that hangs from the counter. */
  sign: "Honey",
  /** The fair's name, in the day chip on Winter Fair day. */
  fairDay: "Winter Fair",
  coinsAlt: "coins",
  /** The name over a stranger's wish. */
  visitor: "A visitor",
  /** The small count in the top bar: who is still in the queue behind this one. */
  waiting: (n) => (n > 0 ? `${number(n)} waiting` : "the last one"),
  /** After a regular's name: their hearts, and how many the next gift takes. */
  hearts: (n, next) => (next ? `${number(n)} of ${number(next)}` : number(n)),
  heartsAlt: "hearts",

  shelf: "Your shelf",
  /** Beside "Your shelf" when something on it is what they wished for. */
  legend: "what they wished for",
  /** Beside "Your shelf" when nothing on it is. */
  noMatch: "nothing here is their wish",
  /** On a shelf tile: how many you have. */
  count: (n) => `×${number(n)}`,
  each: "each",
  /** Read out for a shelf tile. */
  tileLabel: (name, starsN, n, price, wish) =>
    `${name}${starsN ? ` ${stars(starsN)}` : ""}, ${number(n)} on your shelf, ${coins(price)} each${wish ? ", what they wished for" : ""}`,

  /** The line over the buttons before anything is picked. */
  pickHint: "Choose something from your shelf, or let them go.",
  /** The line over the buttons once something is picked: what, then how they would take it. */
  /** What is picked, and (when you have fewer than they want) how many they hoped for. */
  picked: (what, wanted) =>
    wanted ? `${capital(what)} (they wanted ${number(wanted)}).` : `${capital(what)}.`,
  /** `who`: a regular's short name, or nothing for a stranger. */
  wouldDelight: (who) => `Exactly what ${who ?? "they"} wished for.`,
  wouldDo: (who) => `Not ${who ? `${who}’s` : "their"} wish, so it sells for less.`,

  offer: "Offer",
  nothing: "Nothing today",

  /** After a sale, over the one button. */
  sold: (what, n) => `Sold for ${coins(n)}.`,
  renown: (n) => `+${number(n)} renown`,
  heartFrom: (who) => `A heart from ${who}.`,
  passed: "They go on their way. No harm done.",
  next: "Next customer",
  toCrate: "To the grocer",
  carryOn: "Carry on",

  /** A toast when renown climbs a tier at the stall. */
  tierUp: (name) => `Word gets round. You are now “${name}”.`,

  /** Nothing to sell, before anyone was served. */
  bare: {
    title: "Nothing to sell tonight",
    text: "No jars and nothing made yet, and that is all right. Your customers will come again tomorrow.",
  },
  /** Everything went. */
  soldOut: {
    title: "Sold out",
    text: "Everything has gone. An empty shelf to fill again tomorrow.",
  },
  close: "Close the stall",

  /** Opened when it is not evening. */
  closed: {
    title: "The stall opens in the evening",
    text: "Come back when the bees are home and the light is going.",
    back: "Back to the meadow",
  },

  /** A regular's gift, shown as a small moment. */
  gift: {
    title: (who) => `A gift from ${who}`,
    hearts: (n) => `${number(n)} hearts, and a friend for good.`,
    thanks: "Thank you",
    coins: (n) => coins(n),
    seeds: (n, flower) =>
      `${number(n)} ${String(flower).toLowerCase()} ${n === 1 ? "seed" : "seeds"}`,
    spare: (n) => (n === 1 ? "A spare hive" : `${number(n)} spare hives`),
    remedy: (n) => plural(n, "thyme remedy", "thyme remedies"),
    syrup: (n) => plural(n, "portion") + " of sugar syrup",
    wardrobe: (name) => `${name}, for your wardrobe`,
    fact: "And a new page in your bee book.",
  },
};

// ───────────────────────── what customers say ─────────────────────────

/** Added to a wish when they want more than one. Barley says his own number. */
const QTY = {
  2: " I would like 2, if you can spare them.",
  3: " I would like 3, if you have them.",
};

/** A stranger's wish, by its kind. `what` is the thing by name; `trait` the trait word. */
const WISH = {
  any: [
    () => "Surprise me. Whatever you think is good.",
    () => "I’ll take whatever you would choose yourself.",
    () => "Anything from your hives will do nicely.",
  ],
  honey: [
    (what) => `${capital(what)}, please.`,
    (what) => `Have you any ${what}?`,
    (what) => `I came all this way for your ${what}.`,
  ],
  thing: [
    (what) => `I’m after ${what}.`,
    (what) => `Have you ${what} today?`,
    (what) => `${capital(what)}, if you have made any.`,
  ],
  trait: [
    (trait) => `Something ${trait}, please.`,
    (trait) => `Have you any ${trait} honey?`,
    (trait) => `I like my honey ${trait}. What do you have?`,
  ],
  finest: [
    () => "The best jar you have, please.",
    () => "Your finest honey. It is for a special table.",
    () => "Only the very best today.",
  ],
  gift: [
    () => "A present for my sister. Something you have made.",
    () => "I need a little gift. What have you made?",
    () => "Something from your workshop, for a friend.",
  ],
};

/** At the Winter Fair everybody is shopping for somebody else. */
const FAIR_WISH = {
  gift: [
    "A present to wrap tonight. Something you made yourself.",
    "I have a whole list of people to buy for. What have you made?",
    "Something small and lovely, to give away.",
  ],
  "kind:family:candle": [
    "Candles, please. The nights are so long now.",
    "A candle for the window, to light folk home.",
    "Have you candles? It is not winter without one.",
  ],
  finest: [
    "Your finest jar, for the midwinter table.",
    "The best honey you have. It is a gift for someone dear.",
    "Only the best today. It is the Fair, after all.",
  ],
};

/** What a stranger says once it is settled. */
const REPLY = {
  delighted: [
    "Oh, lovely. Exactly what I wanted.",
    "Perfect. Thank you.",
    "That is the very thing.",
    "Wonderful. I shall be back.",
  ],
  fine: [
    "Not what I had in mind, but I’ll take it.",
    "That will do nicely enough, thank you.",
    "Well, it does look good. Go on, then.",
  ],
  passed: ["Never mind. Another day.", "No matter. Good evening to you.", "I’ll look in again."],
};

/**
 * The eight regulars: how the stall names them in a sentence (`short`), what
 * they say for each thing they love (keyed as the wish: "trait:dark",
 * "kind:honey:mint", "finest"), their thanks when delighted, what they say
 * when it is not their wish, when they leave with nothing, and the three
 * lines that come with their gifts (at 3, 7 and 12 hearts).
 *
 * `saysQty`: their lines already say how many, so nothing is added.
 */
export const REGULAR_WORDS = {
  hattie: {
    short: "Hattie",
    wish: {
      "trait:dark": [
        "Something dark for the rye loaves, love.",
        "The darkest you have. It is gingerbread week.",
        "Dark honey, please. The pale ones vanish in my oven.",
      ],
      "trait:strong": [
        "Something strong. It has to stand up to rye.",
        "A honey with some backbone, please.",
        "Strong as you like. My dough can take it.",
      ],
    },
    delighted: [
      "That will stand up to the rye. Bless you.",
      "Lovely. Call by for a warm bun tomorrow.",
      "The very thing. The oven is waiting.",
    ],
    fine: ["Not what I’m after, but it will sweeten the buns.", "It will do for the iced fingers."],
    passed: ["No matter. I’ll make do with treacle today.", "Another day, then. Mind how you go."],
    gifts: [
      "Buckwheat seed from my brother’s mill. It makes the darkest honey I know, and I would dearly like some.",
      "The shop has never been busier since I started baking with your honey. Take this. You have earned it.",
      "My honey loaf won at the county fair. Half the prize is yours by rights.",
    ],
  },
  fenwick: {
    short: "Mr Fenwick",
    wish: {
      finest: [
        "Your best jar, if you please. I shall know it when I see it.",
        "Hold the finest one up to the light for me.",
        "Only pure honey for me. I kept bees here for 50 years.",
      ],
    },
    delighted: [
      "Now that is a proper jar. Well kept.",
      "Clear as a bell. Your bees are in good hands.",
      "I could not have done better myself, and I tried for 50 years.",
    ],
    fine: [
      "Hm. Honest honey, but not your best. I’ll take it.",
      "A fair jar. Keep each hive to a single flower and you will do better yet.",
    ],
    passed: ["No hurry. Good honey takes its time.", "Next time, perhaps. Bees won’t be rushed."],
    gifts: [
      "My last skep, dry and sound. I would sooner it held bees than cobwebs. Keep it by for a swarm.",
      "This cap saw 50 summers of beekeeping. It ought to see a few more.",
      "My own thyme remedy, the old recipe. Look after your bees as you have looked after this meadow.",
    ],
  },
  posy: {
    short: "Posy",
    wish: {
      "trait:mild": [
        "Have you got a gentle honey? The strong ones make my nose wrinkle.",
        "Mild honey, please. It is for my porridge.",
        "Something soft and sweet. I counted my pennies twice.",
      ],
      "kind:family:candle": [
        "A candle, please. I’m on chapter 9 and it gets dark so early.",
        "A candle to read by after bedtime. Don’t tell.",
        "Do you have a candle? Mine burnt right down.",
      ],
    },
    delighted: [
      "Thank you. I’ll make it last a whole week.",
      "It’s perfect. I’m going to tell everyone at school.",
      "Thank you ever so much.",
    ],
    fine: [
      "Oh. It’s not the one I wanted, but I like it anyway.",
      "I’ll try it. Maybe I’ll like this one too.",
    ],
    passed: ["That’s all right. I’ll save up some more.", "I’ll come back. I’m good at waiting."],
    gifts: [
      "I saved these from the tallest sunflower in our garden. It was taller than my dad.",
      "I made you a flower crown. It took all afternoon and only fell apart twice.",
      "I sold my drawings of your bees at the fête. This is your share, because they were your bees.",
    ],
  },
  linden: {
    short: "Dr Linden",
    wish: {
      "trait:herbal": [
        "Something herbal, please. Strictly for the surgery, you understand.",
        "A herbal honey, if you have one. I prescribe it more than I admit.",
        "Herbal, please. Half the village has a cough.",
      ],
      "kind:good:balm": [
        "A tin of your lip balm. The wind on my rounds is merciless.",
        "Lip balm, please. Doctor’s orders, and I am the doctor.",
        "Your honey lip balm, if there is any. Winter rounds are hard on the lips.",
      ],
    },
    delighted: [
      "Exactly what the doctor ordered.",
      "Splendid. A spoonful of this cheers any patient.",
      "Thank you. Better than anything in my bag.",
    ],
    fine: [
      "Not what I would prescribe, but it will do no harm.",
      "I’ll take it. A little sweetness never hurt a patient.",
    ],
    passed: ["Never mind. I’ll call again after my rounds.", "Another day. Keep well."],
    gifts: [
      "Thyme remedy from my own cupboard. Bees need a doctor now and then too.",
      "Borage, from the physic garden. The old herbals say it gladdens the heart, and bees quite agree.",
      "The whole village came through the winter in good spirits. I put it down to your honey.",
    ],
  },
  marguerite: {
    short: "Marguerite",
    wish: {
      "trait:floral": [
        "Something floral, dear. It must taste like a garden, I always say.",
        "A flowery honey for the scones. Nothing less will do.",
        "Floral, please. My regulars notice these things, and so do I.",
      ],
      "trait:fruity": [
        "Something fruity for the afternoon teas, dear.",
        "A fruity honey, please. It goes beautifully with my lemon cake, as I tell everyone.",
        "Have you a fruity one? The tea room is full on Thursdays.",
      ],
    },
    delighted: [
      "Oh, how pretty. The scones will be the talk of the village.",
      "Perfect, dear. I shall put it in the good dish.",
      "Lovely. I’ll tell everyone where it came from, at length.",
    ],
    fine: [
      "Well. Not what I had in mind, but I daresay it will spread.",
      "It will do for the kitchen, dear.",
    ],
    passed: [
      "Nothing today? Then I shall have to talk about the weather.",
      "Another time, dear. Do drop in for tea.",
    ],
    gifts: [
      "Lavender from the tea room’s window boxes. Plant it where the bees can find it, dear.",
      "A ribbon bow, from my hat box. One should look one’s best at market, I always say.",
      "A magazine wrote up my honey scones. 3 whole paragraphs. You must have your share.",
    ],
  },
  tobias: {
    short: "Tobias",
    wish: {
      "kind:honey:mint": [
        "Water mint honey, if you have any. It tastes the way the pond bank smells.",
        "Mint honey, please. I’ll have it on bread by the water.",
        "Any of the mint? It is the one I think about all day.",
      ],
      "trait:amber": [
        "Something amber. The colour of the pond at evening.",
        "An amber one, please. I like to look at it as much as eat it.",
        "Amber honey, if you would. Slow and golden, like a good afternoon.",
      ],
    },
    delighted: [
      "That’s the one. I’ll think of you at the water.",
      "Grand. Worth more than anything I caught today.",
      "Right as rain. A quiet sort of honey, that.",
    ],
    fine: [
      "Not the one I was after, but I’m not a fussy man.",
      "It will do. The fish won’t know the difference.",
    ],
    passed: [
      "No bother. I’m used to going home empty-handed.",
      "Another evening. The pond will still be there.",
    ],
    gifts: [
      "Water mint, from the far bank where nobody goes. It wants wet feet, mind.",
      "I sold a pike to the inn. It felt wrong not to share the luck.",
      "Sugar syrup. Winter is long for a hive, and I can see yours from the bank. This will help.",
    ],
  },
  wren: {
    short: "Wren",
    wish: {
      "kind:family:soap": [
        "A bar of soap, please. Look at these hands. Cobalt blue, mostly.",
        "Soap, if you have it. Turpentine does nothing for the skin.",
        "Your soap, please. The last bar smelled like a whole hillside.",
      ],
      "trait:light": [
        "Something light. Hold it up, let me see the colour.",
        "A pale honey, please. Like early light on a wall.",
        "The lightest you have. I’m painting it before I eat it.",
      ],
    },
    delighted: [
      "Look at that colour. Thank you.",
      "Perfect. I might paint it first.",
      "Lovely. You make beautiful things, you know.",
    ],
    fine: [
      "Not the shade I wanted, but there is something in it.",
      "I’ll take it. Every colour is useful to somebody.",
    ],
    passed: [
      "That’s all right. I’ll look at the jars a while.",
      "Another day. The light is going anyway.",
    ],
    gifts: [
      "I sold a little painting of your stall. It seemed only fair to split it.",
      "My spare beret. Every keeper needs a hat for thinking in.",
      "The gallery in town took 6 of my bee paintings. All 6. This is yours.",
    ],
  },
  barley: {
    short: "Farmer Barley",
    saysQty: true,
    wish: {
      "trait:mild": [
        "Something mild, 3 jars of it. There are 7 at my table and none of them fussy.",
        "Mild honey, 3 jars. Nothing fancy, mind.",
        "Your plain mild ones, 3 of them. It goes on the porridge by the ladle.",
      ],
    },
    delighted: [
      "That will see us through the week. Good on you.",
      "Grand. The children will have it gone by Friday.",
      "Proper honey, that. Thank you kindly.",
    ],
    fine: [
      "Not what I asked for, but it will all get eaten.",
      "It will do. Mine would eat the jar if you let them.",
    ],
    passed: [
      "No harm done. I’ll try again come market day.",
      "Right you are. Plenty of other days.",
    ],
    gifts: [
      "Clover seed off my own fields. Your bees work them often enough, so it is only fair.",
      "Sugar syrup for the lean weeks. Farmers look after their stock, and yours is smaller than most.",
      "Ivy, for the hedge. Plain honey, but the bees will bless you for it come winter.",
    ],
  },
};

const pickBy = (lines, n) =>
  lines[(((Math.floor(Number(n)) || 0) % lines.length) + lines.length) % lines.length];

/**
 * What a customer says as they step up.
 * @param {{ id: number, who?: string | null, type: string, value?: string, qty: number,
 *   name?: string, fair?: boolean }} c
 *   `name`: the core's name for a wished honey or good ("Lavender honey")
 */
export function wishLine(c) {
  const key = c.value ? `${c.type}:${c.value}` : c.type;
  const mine = c.who ? REGULAR_WORDS[c.who] : null;
  const own = mine?.wish?.[key];
  let line;
  let saidQty = false;
  if (own) {
    line = pickBy(own, c.id);
    saidQty = !!mine.saysQty;
  } else if (c.fair && FAIR_WISH[key]) line = pickBy(FAIR_WISH[key], c.id);
  else if (c.type === "trait")
    line = pickBy(WISH.trait, c.id)(TRAIT_WORDS[c.value ?? ""] ?? c.value);
  else if (c.type === "kind") {
    const honey = String(c.value).startsWith("honey:");
    const what = honey
      ? String(c.name ?? "honey").toLowerCase()
      : (ASK_FOR[c.value ?? ""] ?? String(c.name ?? "something you made").toLowerCase());
    line = pickBy(honey ? WISH.honey : WISH.thing, c.id)(what);
  } else line = pickBy(WISH[c.type] ?? WISH.any, c.id)();
  return line + (saidQty ? "" : (QTY[c.qty] ?? ""));
}

/**
 * What a customer says once it is settled.
 * @param {{ id: number, who?: string | null, mood: "delighted" | "fine" | "passed" }} c
 */
export function replyLine(c) {
  const mine = c.who ? REGULAR_WORDS[c.who] : null;
  return pickBy(mine?.[c.mood] ?? REPLY[c.mood] ?? REPLY.passed, c.id);
}

// ───────────────────────── the grocer's crate ─────────────────────────

export const GROCER = {
  name: "The grocer",
  crate: "The grocer’s crate",
  /** The grocer's first words, with the stall shut and something left on the shelf. */
  hello: [
    "I’ll buy whatever is left, for a little less. Or keep it. Honey keeps for years.",
    "Anything left over? A grocer’s price, mind. Keeping it for tomorrow is a good plan too.",
  ],
  /** After a sale to the crate. */
  thanks: [
    "Much obliged. It will be on my shelves by morning.",
    "A fair trade. Thank you kindly.",
    "That will sell before noon. Thank you.",
  ],
  /** Under a product's name: how many you have, what the grocer pays for one, what the stall asks. */
  have: (n) => `×${number(n)}`,
  /** After the grocer's price for one; the stall's price follows, struck through. */
  pays: "each",
  stallAlt: (n) => `The stall’s price is ${coins(n)}.`,
  fewer: "1 fewer",
  more: "1 more",
  /** The buttons. */
  sellAll: "Sell all",
  sell: (n) => `Sell ${number(n)}`,
  sellNone: "Sell",
  close: "Close the stall",
  confirmAll: (n, total) => ({
    title: "Sell everything?",
    text: `The grocer takes all ${number(n)} of your things for ${coins(total)}. Tomorrow’s customers would pay more.`,
    yes: "Sell it all",
    no: "Keep it",
  }),
};

// ───────────────────────── the Honey Show ─────────────────────────

export const MEDAL_WORDS = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

export const SHOW = {
  title: "The Honey Show",
  /** Under the banner on the entry bench. */
  intro: (max) =>
    `Tonight the village judges honey. Put up to ${number(max)} pure honeys on the show bench, 1 jar of each kind. The judges keep the jars.`,
  /** Nothing pure on the shelf. */
  none: "The show takes only pure honey, and your shelf has none this year. There is always next autumn.",
  benchEmpty: "Tap a jar to put it on the show bench.",
  bench: (n) => `${jars(n)} on the show bench.`,
  full: (max) => `The show bench holds ${jars(max)}.`,
  /** On a jar: the ribbon its stars would win. */
  wouldWin: (medal) => `${MEDAL_WORDS[medal] ?? capital(medal)} ribbon`,
  prize: (n, renown) => `${coins(n)} · +${number(renown)} renown`,
  enter: (n) => (n ? `Enter ${jars(n)}` : "Enter the show"),
  skip: "Not this year",
  /** Asked once before leaving the show with jars that could be entered. */
  confirmSkip: {
    title: "Skip the show this year?",
    text: "The Honey Show comes once a year. Your pure honey would win ribbons, coins and renown.",
    yes: "Skip it",
    no: "Stay",
  },
  /** A second jar of a kind already on the show bench takes the first one’s place. */
  swapped: (honey) => `1 jar of each kind: this ${honey} takes the other one’s place.`,
  on: "On to the stall",
  /** While the judges taste. */
  judging: "The judges are tasting.",
  tapToSkip: "Tap anywhere to skip",
  judge: "The judge",
  tasting: ["Hm. Let me see.", "And now this one.", "And the last. Hold it to the light."],
  verdict: {
    bronze: (honey) => `Bronze for the ${honey}. A good honest jar.`,
    silver: (honey) => `Silver for the ${honey}. Very fine indeed.`,
    gold: (honey) => `Gold for the ${honey}. I have not tasted better.`,
  },
  results: "Your ribbons",
  total: (n, renown) => `${coins(n)} in prize money, and ${number(renown)} renown.`,
  ribbonAlt: (medal) => `${MEDAL_WORDS[medal] ?? medal} ribbon`,
};

// ───────────────────────── the Winter Fair ─────────────────────────

export const FAIR = {
  title: "The Winter Fair",
  /** How much more the Fair pays, said in words. */
  pays: (mult) => (mult === 1.5 ? "half as much again" : `${Math.round((mult - 1) * 100)}% more`),
  intro: (n, mult) =>
    `Lanterns are lit and the whole village is out. Tonight ${number(n)} customers want gifts, candles or your finest honey, and all pay ${FAIR.pays(mult)}.`,
  open: "Open the stall",
  /** The count in the picture on Fair night: who is still queueing. */
  waiting: (n) => (n > 0 ? `${number(n)} by the lanterns` : "the last one"),
  /** Over the shelf on Fair night. */
  shelf: "Your shelf, at Fair prices",
  /** The grocer, when the Fair's queue has gone: what the stall took tonight. */
  grocer: (n) =>
    n > 0
      ? `The lanterns are burning low. ${capital(coins(n))} at your stall tonight. I will buy what is left, for a little less.`
      : "The lanterns are burning low. I will buy what is left, for a little less.",
};

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** "three" for 3; digits past nine. */
export function numberWord(n) {
  return NUMBER_WORDS[n] ?? number(n);
}
