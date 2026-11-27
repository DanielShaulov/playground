// The bee book. One fact per trigger key (the keys are listed in
// docs/honey-hollow/rules.md under "The bee book"). Every fact is true and
// carries the sources it was checked against; a test refuses a fact without
// one. This file is data only.
//
// topic: "colony" | "honey" | "flowers" | "seasons" | "wax" | "keeping"

/** @typedef {{ id: string, trigger: string, topic: string, title: string, text: string, sources: { title: string, url: string }[] }} Fact */

// Sources cited by more than one fact.
const UA_MANUAL = {
  title: "University of Arkansas Extension: Beekeeping in Arkansas (MP577)",
  url: "https://www.uaex.uada.edu/publications/pdf/MP577.pdf",
};
const MAAREC_COLONY = {
  title:
    "Mid-Atlantic Apiculture Research and Extension Consortium: The Colony and Its Organization",
  url: "https://canr.udel.edu/maarec/honey-bee-biology/the-colony-and-its-organization/",
};
const MAAREC_SEASONS = {
  title:
    "Mid-Atlantic Apiculture Research and Extension Consortium: Seasonal Cycles of Activities in Colonies",
  url: "https://canr.udel.edu/maarec/honey-bee-biology/seasonal-cycles-of-activities-in-colonies/",
};
const SUSSEX_BEEKEEPING = {
  title: "University of Sussex, Laboratory of Apiculture and Social Insects: Beekeeping (pamphlet)",
  url: "https://www.sussex.ac.uk/lasi/documents/pamphlet1-beekeeping-a4-1page-june2011.pdf",
};
const HONEY_BOARD_TRIVIA = {
  title: "National Honey Board: Honey Trivia",
  url: "https://honey.com/newsroom/presskit/honey-trivia",
};
const NCSU_HONEY = {
  title: "NC State University News: How Do Bees Make Honey?",
  url: "https://news.ncsu.edu/2013/06/how-do-bees-make-honey/",
};
const FAO_HONEY = {
  title: "FAO: Value-added products from beekeeping, chapter 2, Honey",
  url: "https://www.fao.org/4/w0076e/w0076e04.htm",
};
const FAO_WAX = {
  title: "FAO: Value-added products from beekeeping, chapter 4, Wax",
  url: "https://www.fao.org/4/w0076e/w0076e12.htm",
};
const BRITANNICA_BEESWAX = {
  title: "Encyclopaedia Britannica: Beeswax",
  url: "https://www.britannica.com/topic/beeswax",
};
const BRITANNICA_WINTER = {
  title: "Encyclopaedia Britannica: Where Do Honeybees Go in the Winter?",
  url: "https://www.britannica.com/story/where-do-honeybees-go-in-the-winter",
};
const BRITANNICA_THYME = {
  title: "Encyclopaedia Britannica: Thyme",
  url: "https://www.britannica.com/plant/thyme",
};
const SBA_JUDGING = {
  title: "Scottish Beekeepers' Association: Honey Judging Guidelines",
  url: "https://scottishbeekeepers.org.uk/wp-content/uploads/2023/12/HoneyJudging-Guidelines2014-A4.pdf",
};
const NBU_WINTER = {
  title: "National Bee Unit: Preparing honey bee colonies for winter (fact sheet)",
  url: "https://www.nationalbeeunit.com/assets/PDFs/3_Resources_for_beekeepers/Fact_Sheets/Fact_19_Preparing_your_hives_for_winter.pdf",
};
const PENN_STATE_LAWN = {
  title: "Penn State Extension: Using Common Weeds to Create a Flowering Lawn for Pollinators",
  url: "https://extension.psu.edu/using-common-weeds-to-create-a-flowering-lawn-for-pollinators",
};

/** @type {Fact[]} */
export const FACTS = [
  // ---- The first days ----
  {
    id: "flowers-per-trip",
    trigger: "first-day",
    topic: "colony",
    title: "Fifty flowers and more",
    text: "On a single trip from the hive, a forager visits between 50 and 100 flowers. She can fly at about 15 miles an hour.",
    sources: [HONEY_BOARD_TRIVIA],
  },
  {
    id: "twelfth-of-a-teaspoon",
    trigger: "first-harvest",
    topic: "honey",
    title: "A twelfth of a teaspoon",
    text: "An average worker bee makes about one twelfth of a teaspoon of honey in her whole life. Every teaspoon you take is the life's work of a dozen bees.",
    sources: [HONEY_BOARD_TRIVIA],
  },
  {
    id: "flower-constancy",
    trigger: "first-pure",
    topic: "flowers",
    title: "Faithful to one flower",
    text: "A forager is faithful. Once she starts on one kind of flower she keeps to it for the whole trip, and often for days. It suits the flowers too, since each needs pollen from its own kind.",
    sources: [
      {
        title:
          "Pacific Northwest Extension: Evaluating Honey Bee Colonies for Pollination (PNW 623)",
        url: "https://pollinators.msu.edu/_assets/files/resources/growers/Sitting%20colonies.pdf",
      },
    ],
  },
  {
    id: "honey-colour-and-taste",
    trigger: "first-blend",
    topic: "honey",
    title: "Why honeys differ",
    text: "A honey's colour and taste come from the flowers behind it. Honey runs from almost colourless to dark brown and, as a general rule, the paler it is the milder it tastes.",
    sources: [
      {
        title: "National Honey Board: Honey Color and Flavor",
        url: "https://honey.com/newsroom/presskit/honey-color-and-flavor",
      },
      FAO_HONEY,
    ],
  },
  {
    id: "ripening-nectar",
    trigger: "first-three-star",
    topic: "honey",
    title: "Fanned into honey",
    text: "Nectar can be as much as 80 per cent water. The bees in the hive fan their wings over it until only about 18 per cent is left, then seal each full cell with a lid of wax. Dried that far, it keeps.",
    sources: [
      {
        title: "Mississippi State University Extension: How Is Honey Made?",
        url: "https://extension.msstate.edu/blogs/extension-for-real-life/how-honey-made",
      },
      NCSU_HONEY,
    ],
  },
  {
    id: "honey-keeps",
    trigger: "first-sale",
    topic: "honey",
    title: "Honey keeps and keeps",
    text: "Sealed in its jar, honey can stay good for decades, even centuries. It holds so little water that microbes cannot grow in it. Old honey may darken or turn grainy, but it is still safe to eat.",
    sources: [
      { title: "National Honey Board: Frequently Asked Questions", url: "https://honey.com/faq" },
      NCSU_HONEY,
      {
        title: "Mississippi State University Extension: Does Honey Go Bad?",
        url: "https://extension.msstate.edu/blogs/extension-for-real-life/does-honey-go-bad",
      },
    ],
  },
  {
    id: "fair-weather-fliers",
    trigger: "first-rain",
    topic: "seasons",
    title: "Fair-weather fliers",
    text: "Honey bees are fair-weather fliers. Rain, or wind much above 15 miles an hour, can stop them foraging, and they barely fly below about 13°C. A wet day is spent indoors, living on the stores.",
    sources: [
      {
        title:
          "University of Maine Cooperative Extension: Background, Honeybee Flight Activity Index",
        url: "https://extension.umaine.edu/ipm/background-honeybee-flight-activity-index/",
      },
    ],
  },
  {
    id: "three-feet-or-three-miles",
    trigger: "first-move",
    topic: "keeping",
    title: "Three feet or three miles",
    text: "Foragers learn the landmarks around home. Shift a hive across the garden and many will fly back to the empty spot. Hence the keeper's rule: move a hive less than three feet, or more than three miles.",
    sources: [UA_MANUAL],
  },

  // ---- Wax and the workshop ----
  {
    id: "wax-glands",
    trigger: "first-wax",
    topic: "wax",
    title: "Where wax comes from",
    text: "Bees make beeswax themselves. A young worker has eight wax glands under her abdomen, which give out tiny flakes of wax. She chews each flake soft, then presses it into place as part of the comb.",
    sources: [FAO_WAX, BRITANNICA_BEESWAX],
  },
  {
    id: "price-of-wax",
    trigger: "first-candle",
    topic: "wax",
    title: "What wax costs the bees",
    text: "Wax costs the bees dearly. They are thought to eat six to ten pounds of honey for every pound of wax they make, so a pound of candles began as six pounds of honey or more.",
    sources: [BRITANNICA_BEESWAX, UA_MANUAL],
  },
  {
    id: "tidy-hive",
    trigger: "first-soap",
    topic: "colony",
    title: "A spotless house",
    text: "Bees keep a clean house. Young workers clean and polish the cells of the comb, and the whole hive is tidied all the time, with rubbish and dead bees carried out of the door.",
    sources: [MAAREC_COLONY, UA_MANUAL],
  },
  {
    id: "cold-cream",
    trigger: "first-balm",
    topic: "wax",
    title: "Beeswax on the skin",
    text: "Beeswax has been used in creams and ointments for a very long time. Cold cream, a blend of beeswax, oil and rose water, is often credited to the ancient Greek physician Galen.",
    sources: [
      {
        title: "JSTOR Daily: The Coldest Cream",
        url: "https://daily.jstor.org/the-coldest-cream/",
      },
      FAO_WAX,
    ],
  },
  {
    id: "mint-family",
    trigger: "first-bunch",
    topic: "flowers",
    title: "Cousins in the herb bed",
    text: "Lavender, thyme and mint are cousins. All belong to the mint family, with more than 7,000 kinds of plant, often square-stemmed and scented in the leaf, and many are grown for the pollinators they bring.",
    sources: [
      {
        title: "Royal Horticultural Society: An easy guide to the Lamiaceae plant family",
        url: "https://www.rhs.org.uk/plants/plant-families/lamiaceae-plant-family",
      },
    ],
  },

  // ---- Living hives ----
  {
    id: "royal-jelly",
    trigger: "first-queen-cells",
    topic: "colony",
    title: "How a queen is made",
    text: "A queen begins as the same kind of egg as a worker. Every grub gets royal jelly for three days, but a future queen is fed it all the way through, in a large hanging cell. She emerges about 16 days after the egg was laid.",
    sources: [
      {
        title: "Encyclopaedia Britannica: Royal jelly",
        url: "https://www.britannica.com/science/royal-jelly",
      },
      {
        title: "Penn State Extension: An Introduction to Queen Honey Bee Development",
        url: "https://extension.psu.edu/an-introduction-to-queen-honey-bee-development",
      },
      MAAREC_COLONY,
    ],
  },
  {
    id: "swarming",
    trigger: "first-swarm",
    topic: "colony",
    title: "One colony becomes two",
    text: "Swarming is how a colony has young. The old queen leaves with about half the workers to find a new home. The bees that stay behind raise a new queen of their own.",
    sources: [
      {
        title:
          "University of California Statewide IPM Program: Removing Honey Bee Swarms and Established Hives",
        url: "https://ipm.ucanr.edu/home-and-landscape/removing-honey-bee-swarms-and-established-hives/",
      },
      {
        title: "N.C. Cooperative Extension: Why Bees Swarm",
        url: "https://caldwell.ces.ncsu.edu/news/why-bees-swarm/",
      },
    ],
  },
  {
    id: "swarm-scouts",
    trigger: "first-catch",
    topic: "colony",
    title: "House-hunting by dance",
    text: "A hanging swarm is choosing a home. Scouts fly off to inspect hollows, then dance on the cluster for the ones they like, longest for the best. When enough scouts gather at one site, the swarm takes off for it.",
    sources: [
      {
        title: "Cornell Chronicle: How 10,000 bees decide where to go when they fly the coop",
        url: "https://news.cornell.edu/stories/2006/04/honeybee-decision-making-ability-rivals-any-department-committee",
      },
    ],
  },
  {
    id: "making-a-split",
    trigger: "first-split",
    topic: "keeping",
    title: "Making a split",
    text: "A split is a swarm on the keeper's terms. Bees, brood and food go into a second hive, and the half without a queen raises a new one from a queen cell or a very young grub. No bees are lost over the hedge.",
    sources: [UA_MANUAL, MAAREC_COLONY],
  },
  {
    id: "varroa",
    trigger: "first-mites",
    topic: "keeping",
    title: "The Varroa mite",
    text: "Varroa mites first lived on Asian honey bees, which groom them off. European honey bees have little of that defence. The reddish-brown mite, about 1.5 mm across, feeds on a bee's fat body, an organ rather like our liver.",
    sources: [
      {
        title: "Virginia Cooperative Extension: Varroa Mite Biology and Feeding Damage (ENTO-331)",
        url: "https://www.pubs.ext.vt.edu/ENTO/ENTO-331/ENTO-331.html",
      },
      {
        title:
          "USDA Agricultural Research Service: ARS Microscopy Research Helps Unravel the Workings of a Major Honey Bee Pest",
        url: "https://www.ars.usda.gov/news-events/news/research-news/2019/ars-microscopy-research-helps-unravel-the-workings-of-a-major-honey-bee-pest/",
      },
    ],
  },
  {
    id: "thymol",
    trigger: "first-remedy",
    topic: "keeping",
    title: "Thyme against mites",
    text: "The thyme remedy is real. The scented oil in thyme is mostly thymol, one of the most effective plant oils against Varroa. Keepers place it in the hive, where it works as a vapour, so the temperature has to be right.",
    sources: [
      BRITANNICA_THYME,
      UA_MANUAL,
      {
        title: "Virginia Cooperative Extension: Varroa Mite Management Methods (ENTO-333)",
        url: "https://ext.vt.edu/content/dam/pubs_ext_vt_edu/ENTO/ento-333/ENTO-333.pdf",
      },
    ],
  },
  {
    id: "guard-bees",
    trigger: "first-wasps",
    topic: "colony",
    title: "Guards at the door",
    text: "A hive usually has five to ten guard bees at its entrance, checking each arrival with their antennae. They know the smell of their own colony and turn away whatever lacks it. A narrow doorway is easier to hold.",
    sources: [
      {
        title:
          "University of Sussex, Laboratory of Apiculture and Social Insects: Nestmate recognition",
        url: "https://www.sussex.ac.uk/lasi/research/recognition",
      },
      UA_MANUAL,
    ],
  },
  {
    id: "sugar-syrup",
    trigger: "first-feed",
    topic: "keeping",
    title: "Sugar syrup",
    text: "No food suits bees better than their own honey, but a keeper can tide a hungry hive over with sugar syrup. It is mixed thin in spring, like a flow of nectar, and thick in autumn, so there is less water to fan off.",
    sources: [UA_MANUAL],
  },
  {
    id: "winter-stores",
    trigger: "first-hungry",
    topic: "seasons",
    title: "Enough for winter",
    text: "As a general rule, a colony in Britain should go into winter with about 20 kg of honey. Keepers check by hefting: lifting one side of the hive to feel its weight. Many colonies are lost each year to hunger.",
    sources: [
      NBU_WINTER,
      {
        title: "British Beekeepers Association: September in the Apiary",
        url: "https://www.bbka.org.uk/Blog/september-in-the-apiary",
      },
    ],
  },
  {
    id: "bee-space",
    trigger: "first-upgrade",
    topic: "keeping",
    title: "The bee space",
    text: "In a straw skep the combs are stuck fast. In 1851 the Reverend Lorenzo Langstroth built a hive around the 'bee space', a gap of 6 to 9 mm that bees leave open as a corridor. Every comb now lifts out in its frame.",
    sources: [
      {
        title: "Smithsonian Magazine: The Secret to the Modern Beehive Is a One-Centimeter Air Gap",
        url: "https://www.smithsonianmag.com/arts-culture/the-secret-to-the-modern-beehive-is-a-one-centimeter-air-gap-4427011/",
      },
      UA_MANUAL,
      SUSSEX_BEEKEEPING,
    ],
  },
  {
    id: "waggle-dance",
    trigger: "second-hive",
    topic: "colony",
    title: "The waggle dance",
    text: "Back from good flowers, a forager dances on the dark comb. Her waggle run points the way, straight up meaning towards the sun, and the dance tells the distance too. Karl von Frisch decoded it and shared a Nobel Prize in 1973.",
    sources: [
      {
        title: "The Nobel Prize in Physiology or Medicine 1973: Press release",
        url: "https://www.nobelprize.org/prizes/medicine/1973/press-release/",
      },
    ],
  },
  {
    id: "colony-size",
    trigger: "strength-max",
    topic: "colony",
    title: "One enormous family",
    text: "A colony grows from about 5,000 bees in early spring to some 50,000 by summer. To manage it the queen can lay well over a thousand eggs a day. The workers are all her daughters, so a full hive is one enormous family.",
    sources: [SUSSEX_BEEKEEPING, MAAREC_COLONY],
  },

  // ---- The turning year ----
  {
    id: "cooling-the-hive",
    trigger: "season-summer",
    topic: "seasons",
    title: "Keeping cool",
    text: "However hot the day, the nursery at the heart of the hive is held at about 35°C. Workers line up facing the same way and fan their wings, driving stale warm air out and drawing fresh air in.",
    sources: [
      {
        title: "University of Arkansas Extension: How to provide water for bees",
        url: "https://www.uaex.uada.edu/farm-ranch/special-programs/beekeeping/uabeeblog/posts/water_for_bees.aspx",
      },
      {
        title:
          "Journal of the Royal Society Interface (2023): How honeybees respond to heat stress from the individual to colony level",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10581772/",
      },
    ],
  },
  {
    id: "drones-evicted",
    trigger: "season-autumn",
    topic: "seasons",
    title: "Out go the drones",
    text: "Drones, the male bees, do no work in the hive and eat three times as much as a worker. When nectar runs short in autumn the workers drag them out and will not let them back, saving the honey for winter.",
    sources: [MAAREC_SEASONS, MAAREC_COLONY],
  },
  {
    id: "winter-cluster",
    trigger: "season-winter",
    topic: "seasons",
    title: "The winter cluster",
    text: "Below about 13°C the bees gather in a tight ball around their queen. Those in the middle shiver their wing muscles to make heat, then swap places with the bees on the cold outside, who rest and feed.",
    sources: [UA_MANUAL, BRITANNICA_WINTER],
  },
  {
    id: "winter-bees",
    trigger: "second-spring",
    topic: "seasons",
    title: "Six weeks or six months",
    text: "The bees flying on the first spring days are old hands. A summer worker lives about six weeks, but those raised in autumn live four to six months, long enough to see the colony through winter and raise the new brood.",
    sources: [MAAREC_COLONY, BRITANNICA_WINTER],
  },

  // ---- New ground ----
  {
    id: "water-carriers",
    trigger: "plot-pond",
    topic: "colony",
    title: "The water carriers",
    text: "Some foragers fetch water, not nectar. The hive uses it to cool the comb and to thin stored honey into food for grubs. A water carrier can tell when there is enough: the bees at the door start refusing her load.",
    sources: [
      {
        title:
          "Behavioral Ecology and Sociobiology (1997): The control of water collection in honey bee colonies",
        url: "https://link.springer.com/doi/10.1007/s002650050402",
      },
      MAAREC_SEASONS,
      {
        title: "Science News: To douse hot hives, honeybee colonies launch water squadrons",
        url: "https://www.sciencenews.org/article/douse-hot-hives-honeybee-colonies-launch-water-squadrons",
      },
    ],
  },
  {
    id: "apples-need-partners",
    trigger: "plot-orchard",
    topic: "flowers",
    title: "Apples need a partner",
    text: "Many fruit trees, apples among them, cannot set fruit with their own pollen. They need pollen from a different variety in flower at the same time, and it takes bees and other insects to carry it across.",
    sources: [
      {
        title: "Royal Horticultural Society: Fruit pollination",
        url: "https://www.rhs.org.uk/advice/beginners-guide/fruit-basics/fruit-pollination",
      },
    ],
  },
  {
    id: "going-to-the-heather",
    trigger: "plot-hill",
    topic: "keeping",
    title: "Going to the heather",
    text: "Hives can travel. Some British beekeepers move theirs up to the heather moors in August for the late flow of nectar, just as others take hives into apple orchards in April for the blossom.",
    sources: [SUSSEX_BEEKEEPING, NBU_WINTER],
  },
  {
    id: "honey-judging",
    trigger: "first-ribbon",
    topic: "honey",
    title: "The honey judge's kit",
    text: "A honey judge comes equipped: tinted grading glasses to check the colour, a torch to shine up through the jar, glass rods for tasting, and an apple to freshen the palate between spoonfuls.",
    sources: [SBA_JUDGING],
  },

  // ---- The eleven honeys ----
  {
    id: "dandelion-florets",
    trigger: "honey-dandelion",
    topic: "flowers",
    title: "Not one flower",
    text: "A dandelion is not one flower but a crowd. Each yellow head is a bunch of tiny flowers packed tight, and every strap-like 'petal' is a flower of its own. Daisies and sunflowers belong to the same family.",
    sources: [
      {
        title: "Encyclopaedia Britannica: Dandelion",
        url: "https://www.britannica.com/plant/dandelion",
      },
      {
        title: "Encyclopaedia Britannica: Asteraceae",
        url: "https://www.britannica.com/plant/Asteraceae",
      },
      PENN_STATE_LAWN,
    ],
  },
  {
    id: "ten-pips",
    trigger: "honey-apple",
    topic: "flowers",
    title: "Ten pips",
    text: "A well-pollinated apple holds ten pips. When too few bees visit the blossom, fewer seeds form and the apple grows small and lopsided. Cut one across and count.",
    sources: [
      {
        title:
          "University of Kentucky: Scouting Guide for Problems of Fruit, Poor Pollination in Apple",
        url: "https://fruitscout.mgcafe.uky.edu/poor-pollination-apple",
      },
    ],
  },
  {
    id: "clover-tongues",
    trigger: "honey-clover",
    topic: "flowers",
    title: "The right clover",
    text: "Not every clover suits a honey bee. Red clover keeps its nectar down long tubes that a bumblebee's tongue reaches with ease. Honey bees find it hard going and turn to white clover, where the reward is easier to reach.",
    sources: [
      {
        title:
          "Sustainable Agriculture Research and Education: Managing Alternative Pollinators, Diverse Bees, Diverse Flowers",
        url: "https://www.sare.org/publications/managing-alternative-pollinators/chapter-four-pollination-botany/diverse-bees-diverse-flowers/",
      },
      PENN_STATE_LAWN,
    ],
  },
  {
    id: "borage-favourite",
    trigger: "honey-borage",
    topic: "flowers",
    title: "A honey bee favourite",
    text: "Borage is a honey bee's flower. In counts of the insects visiting garden plants, researchers found it especially attractive to honey bees. It grows fast from seed and sows itself for the year after.",
    sources: [
      {
        title:
          "University of Sussex, Laboratory of Apiculture and Social Insects: Bee and Insect Friendly Plants",
        url: "https://www.sussex.ac.uk/lasi/documents/gardenflower-a4infosheets-feb2017.pdf",
      },
      {
        title:
          "University of Sussex, Laboratory of Apiculture and Social Insects: How to Determine Good Garden Plants for Bees",
        url: "https://www.sussex.ac.uk/lasi/documents/pamphlet-determiningbestbeeplants-a4-1page-2012.pdf",
      },
    ],
  },
  {
    id: "lavender-sips",
    trigger: "honey-lavender",
    topic: "flowers",
    title: "A teaspoon of lavender",
    text: "Lavender is so popular with bees that each flower holds only the tiniest sip. Researchers at the University of Sussex estimate a bee would need a week and 300,000 flower visits to collect one teaspoon of its nectar.",
    sources: [
      {
        title: "University of Sussex: Research shows bumblebees on lavender have it licked",
        url: "https://archive.sussex.ac.uk/broadcast/read/19067",
      },
    ],
  },
  {
    id: "thyme-honey-fame",
    trigger: "honey-thyme",
    topic: "honey",
    title: "Famous since antiquity",
    text: "Bees are fond of thyme, and people have long prized the honey. Thyme honey from Sicily has been famous for hundreds of years, and in ancient Greece Mount Hymettus, near Athens, was known for its honey and its thyme.",
    sources: [
      BRITANNICA_THYME,
      {
        title: "University of St Andrews, Mountains of Greece project: Hymettos",
        url: "https://mountainsofgreece.wp.st-andrews.ac.uk/2025/11/01/hymettos/",
      },
      {
        title: "Encyclopaedia Britannica: Mount Hymettus",
        url: "https://www.britannica.com/place/Mount-Hymettus",
      },
    ],
  },
  {
    id: "water-mint",
    trigger: "honey-mint",
    topic: "flowers",
    title: "Peppermint's wild parent",
    text: "Water mint grows wild in ditches and wet ground. It is one parent of peppermint, which is a cross between water mint and spearmint, and the Royal Horticultural Society lists it among its Plants for Pollinators.",
    sources: [
      {
        title: "Encyclopaedia Britannica: Water mint",
        url: "https://www.britannica.com/plant/water-mint",
      },
      {
        title: "Encyclopaedia Britannica: Peppermint",
        url: "https://www.britannica.com/plant/peppermint",
      },
      {
        title: "Royal Horticultural Society: Mentha aquatica, water mint",
        url: "https://www.rhs.org.uk/plants/75995/mentha-aquatica/details",
      },
    ],
  },
  {
    id: "sunflowers-face-east",
    trigger: "honey-sunflower",
    topic: "flowers",
    title: "Facing the sunrise",
    text: "Growing sunflowers follow the sun across the sky, but once mature they stop and face east. East-facing heads warm up faster in the morning, and in one study they drew five times as many pollinating insects.",
    sources: [
      {
        title: "University of California, Davis: Sunflowers Move by the Clock",
        url: "https://www.ucdavis.edu/news/sunflowers-move-clock",
      },
    ],
  },
  {
    id: "buckwheat-mornings",
    trigger: "honey-buckwheat",
    topic: "flowers",
    title: "A morning flower",
    text: "Buckwheat is no wheat at all, but a relative of rhubarb. It normally gives nectar only in the morning, and bees working it are said to be short-tempered by afternoon. The honey is dark and strong.",
    sources: [
      {
        title:
          "Alternative Field Crops Manual (University of Wisconsin and University of Minnesota Extension): Buckwheat",
        url: "https://hort.purdue.edu/newcrop/afcm/buckwheat.html",
      },
      {
        title: "Encyclopaedia Britannica: Polygonaceae",
        url: "https://www.britannica.com/plant/Polygonaceae",
      },
    ],
  },
  {
    id: "heather-jelly",
    trigger: "honey-heather",
    topic: "honey",
    title: "Honey like jelly",
    text: "Heather honey is a jelly until you stir it. Left standing it will not pour, yet a quick stir turns it runny. At a honey show the judge tilts the jar, and the best heather honey barely moves.",
    sources: [FAO_HONEY, SBA_JUDGING],
  },
  {
    id: "ivy-autumn",
    trigger: "honey-ivy",
    topic: "flowers",
    title: "The last feast",
    text: "Ivy flowers late, in autumn, and bees make the most of it. In a Sussex study, an average of 89 per cent of the pollen honey bees brought home in autumn came from ivy. The flowers are small and green and easy to miss.",
    sources: [
      {
        title:
          "Garbuzov and Ratnieks (2014), abstract at FAO AGRIS: Ivy, an underappreciated key resource to flower-visiting insects in autumn",
        url: "https://agris.fao.org/search/en/records/65df8cd8b766d82b180250dd",
      },
      {
        title:
          "University of Sussex, Laboratory of Apiculture and Social Insects: Ivy, Autumn Food for Honey Bees and Flower-Visiting Insects",
        url: "https://www.sussex.ac.uk/lasi/documents/pamphlet-ivy-a5-2pages-2018.pdf",
      },
    ],
  },

  // ---- Renown ----
  {
    id: "wing-beats",
    trigger: "renown-1",
    topic: "colony",
    title: "230 beats a second",
    text: "A honey bee's wings beat about 230 times a second, in short, quick strokes. That is faster than a fruit fly, an insect eighty times smaller. To lift a heavy load she makes wider strokes, not faster ones.",
    sources: [
      {
        title: "Caltech: Deciphering the Mystery of Bee Flight",
        url: "https://www.caltech.edu/about/news/deciphering-mystery-bee-flight-1075",
      },
      {
        title:
          "PNAS (2005): Short-amplitude high-frequency wing strokes determine the aerodynamics of honeybee flight",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1312389/",
      },
    ],
  },
  {
    id: "bees-learn-faces",
    trigger: "renown-2",
    topic: "colony",
    title: "Bees can learn a face",
    text: "Honey bees can learn to tell human faces apart. In one experiment, bees given a drop of sugar water at one photograph learned to pick that face over a similar one more than 80 per cent of the time.",
    sources: [
      {
        title:
          "Journal of Experimental Biology (2005): Honeybee (Apis mellifera) vision can discriminate between and recognise images of human faces",
        url: "https://journals.biologists.com/jeb/article/208/24/4709/15923/Honeybee-Apis-mellifera-vision-can-discriminate",
      },
      {
        title: "Journal of Experimental Biology, Inside JEB: Bee brains recognise human faces",
        url: "https://journals.biologists.com/jeb/article/208/24/i/15874/BEE-BRAINS-RECOGNISE-HUMAN-FACES",
      },
    ],
  },
  {
    id: "drones-no-father",
    trigger: "renown-3",
    topic: "colony",
    title: "No father, one grandfather",
    text: "A drone has no father. Male bees grow from eggs that were never fertilised, so a drone has only a mother, the queen. She had a father of her own, though, which gives every drone a grandfather.",
    sources: [
      {
        title: "Penn State Extension: Honey Bee Genetics Basics",
        url: "https://extension.psu.edu/honey-bee-genetics-basics",
      },
      MAAREC_COLONY,
    ],
  },
  {
    id: "honeycomb-hexagons",
    trigger: "renown-4",
    topic: "wax",
    title: "Why six sides",
    text: "Around 36 BC the Roman writer Varro noted the idea that six-sided cells enclose the most space. In 1999 the mathematician Thomas Hales proved it: no way of dividing a flat surface into equal cells needs less wall.",
    sources: [
      {
        title: "Thomas C. Hales: The Honeycomb Conjecture (arXiv, 1999)",
        url: "https://arxiv.org/pdf/math/9906042",
      },
    ],
  },

  // ---- Gifts from the regulars ----
  {
    id: "smoke",
    trigger: "gift-fenwick-1",
    topic: "keeping",
    title: "A puff of smoke",
    text: "Before lifting the lid, a keeper puffs a little smoke in at the door. It calms the bees and they sting less. Part of the reason seems to be that smoke masks the alarm scent they use to rouse one another.",
    sources: [UA_MANUAL, SUSSEX_BEEKEEPING],
  },
  {
    id: "queen-marking",
    trigger: "gift-fenwick-2",
    topic: "keeping",
    title: "A dot on the queen",
    text: "Keepers dab paint on the queen so they can spot her and tell her age. The colour follows the last digit of the year she was raised: white for 1 or 6, yellow for 2 or 7, red for 3 or 8, green for 4 or 9, blue for 5 or 0.",
    sources: [UA_MANUAL],
  },
  {
    id: "queen-piping",
    trigger: "gift-fenwick-3",
    topic: "colony",
    title: "Tooting and quacking",
    text: "Queens sing. After a swarm has left, the first new queen to emerge presses herself to the comb and 'toots'. Rivals still shut in their cells answer with a 'quack', and the workers keep them in so the queens do not fight.",
    sources: [
      {
        title:
          "Scientific Reports (2020): The prediction of swarming in honeybee colonies using vibrational spectra",
        url: "https://www.nature.com/articles/s41598-020-66115-5",
      },
      {
        title:
          "Nottingham Trent University: Queen bees 'toot' to instruct colony to keep them safe",
        url: "https://www.ntu.ac.uk/about-us/news/news-articles/2020/06/queen-bees-toot-to-instruct-colony-to-keep-them-safe",
      },
    ],
  },
  {
    id: "honey-holds-water",
    trigger: "gift-hattie-2",
    topic: "honey",
    title: "Why honey cake keeps",
    text: "Honey pulls in water and holds on to it. That is why cakes and bread baked with honey dry out more slowly and stay soft for longer. It is also why the lid goes back on the jar: in damp air, honey takes up moisture.",
    sources: [FAO_HONEY],
  },
  {
    id: "five-eyes",
    trigger: "gift-posy-2",
    topic: "colony",
    title: "Five eyes",
    text: "A honey bee has five eyes. Two large ones, each made of many tiny light detectors, sit at the sides of her head. Three small simple eyes, called ocelli, sit on top.",
    sources: [
      {
        title: "Encyclopaedia Britannica: Honeybee",
        url: "https://www.britannica.com/animal/honeybee",
      },
      {
        title: "Arizona State University, Ask A Biologist: Honey bee anatomy",
        url: "https://askabiologist.asu.edu/honey-bee-anatomy",
      },
    ],
  },
  {
    id: "propolis",
    trigger: "gift-linden-2",
    topic: "colony",
    title: "Bee glue",
    text: "Bees collect sticky resin from plants and bring it home as propolis, or bee glue. They seal small gaps with it and line the nest, where it works as a germ-fighting coat for the whole colony.",
    sources: [
      {
        title: "Insects (2017): Propolis Counteracts Some Threats to Honey Bee Health",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5492060/",
      },
      UA_MANUAL,
    ],
  },
  {
    id: "caffeine-nectar",
    trigger: "gift-marguerite-2",
    topic: "flowers",
    title: "Nectar with caffeine",
    text: "Coffee and citrus flowers put a trace of caffeine in their nectar. In tests, honey bees given a caffeinated reward were three times as likely to remember the flower's scent, which makes for a more loyal visitor.",
    sources: [
      {
        title: "Science (2013): Caffeine in floral nectar enhances a pollinator's memory of reward",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4521368/",
      },
    ],
  },
  {
    id: "surfing-bees",
    trigger: "gift-tobias-2",
    topic: "colony",
    title: "Surfing bees",
    text: "A honey bee that lands on a pond cannot take off, because the water grips her wings. So she surfs. Beating her wet wings makes ripples behind her that push her forward, at up to three body lengths a second.",
    sources: [
      {
        title: "PNAS (2019): Honeybees use their wings for water surface locomotion",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6900504/",
      },
      {
        title: 'Caltech Magazine: Bees "Surf" Atop Water',
        url: "https://magazine.caltech.edu/post/bees-surf",
      },
    ],
  },
  {
    id: "bee-colours",
    trigger: "gift-wren-2",
    topic: "flowers",
    title: "Colours we cannot see",
    text: "Bees see colour differently from us. They cannot see red, but they can see ultraviolet, which we cannot. Many flowers carry ultraviolet patterns, invisible to us, that guide a bee straight to the nectar.",
    sources: [
      {
        title: "NC State University News: What Colors Do Bees See? And How Do We Know?",
        url: "https://news.ncsu.edu/2024/07/wms-what-bees-see/",
      },
      {
        title: "USDA Forest Service: Bee Pollination",
        url: "https://www.fs.usda.gov/wildflowers/pollinators/animals/bees.shtml",
      },
    ],
  },
  {
    id: "crops-need-pollinators",
    trigger: "gift-barley-2",
    topic: "flowers",
    title: "Three crops in four",
    text: "Around the world, three out of four of the crops grown for their fruit or seeds depend, at least in part, on bees and other pollinators. Apples, almonds, raspberries and pumpkins are among them.",
    sources: [
      {
        title: "FAO: Why we need bees for a nutritious future",
        url: "https://www.fao.org/newsroom/story/Why-we-need-bees-for-a-nutritious-future/en",
      },
      SUSSEX_BEEKEEPING,
      {
        title: "University of Minnesota Extension: Fruits and vegetables that require pollination",
        url: "https://extension.umn.edu/agriculture/specialty-crops/pollination/requirements",
      },
    ],
  },
];
