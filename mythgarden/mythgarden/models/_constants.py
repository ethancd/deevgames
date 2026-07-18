NORTH = 'NORTH'
EAST = 'EAST'
SOUTH = 'SOUTH'
WEST = 'WEST'

DIRECTIONS = [
    (NORTH, 'North'),
    (EAST, 'East'),
    (SOUTH, 'South'),
    (WEST, 'West'),
]

MAX_ITEMS = 6

MINUTES_IN_A_DAY = 24 * 60
MINUTES_IN_A_HALF_DAY = 12 * 60
MINUTES_IN_A_QUARTER_DAY = 6 * 60
DAWN = MINUTES_IN_A_QUARTER_DAY
OVERSLEPT_TIME = 10 * 60
SUNSET = 18 * 60

SUNDAY = 'SUN'
MONDAY = 'MON'
TUESDAY = 'TUE'
WEDNESDAY = 'WED'
THURSDAY = 'THU'
FRIDAY = 'FRI'
SATURDAY = 'SAT'

DAYS_OF_WEEK = [
    (MONDAY, 'Monday'),
    (TUESDAY, 'Tuesday'),
    (WEDNESDAY, 'Wednesday'),
    (THURSDAY, 'Thursday'),
    (FRIDAY, 'Friday'),
    (SATURDAY, 'Saturday'),
    (SUNDAY, 'Sunday'),
]

FIRST_DAY = DAYS_OF_WEEK[0][0]

DAY_TO_INDEX = {
    MONDAY: 0,
    TUESDAY: 1,
    WEDNESDAY: 2,
    THURSDAY: 3,
    FRIDAY: 4,
    SATURDAY: 5,
    SUNDAY: 6,
}

KOIN_SIGN = '⚜️'

SEED = 'SEED'
SPROUT = 'SPROUT'
CROP = 'CROP'
SOIL = 'SOIL'
MYTHEGG = 'MYTHEGG'
GIFT = 'GIFT'
FISH = 'FISH'
MINERAL = 'MINERAL'
FOSSIL = 'FOSSIL'
TECH = 'TECH'
MAGIC = 'MAGIC'
HERB = 'HERB'
FLOWER = 'FLOWER'
BERRY = 'BERRY'

ITEM_EMOJIS = {
    SEED: '🌰',
    SPROUT: '🌱',
    CROP: '🌾',
    SOIL: '🟫',
    MYTHEGG: '🥚',
    GIFT: '🎁',
    FISH: '🐟',
    MINERAL: '💎',
    FOSSIL: '🦴',
    TECH: '⚙️',
    MAGIC: '✨',
    HERB: '🌿',
    FLOWER: '🌸',
    BERRY: '🍓',
}

ITEM_TYPES = [
    (SEED, 'Seed'),
    (SPROUT, 'Sprout'),
    (CROP, 'Crop'),
    (SOIL, 'Soil'),
    (MYTHEGG, 'Mythegg'),
    (GIFT, 'Gift'),
    (FISH, 'Fish'),
    (MINERAL, 'Mineral'),
    (FOSSIL, 'Fossil'),
    (TECH, 'Tech'),
    (MAGIC, 'Magic'),
    (HERB, 'Herb'),
    (FLOWER, 'Flower'),
    (BERRY, 'Berry'),
]

COMMON = 'COMMON'
UNCOMMON = 'UNCOMMON'
RARE = 'RARE'
EPIC = 'EPIC'
MYTHIC = 'MYTHIC'

RARITIES = [
    COMMON,
    UNCOMMON,
    RARE,
    EPIC,
    MYTHIC
]

RARITY_TO_INDEX = {
    COMMON: 0,
    UNCOMMON: 1,
    RARE: 2,
    EPIC: 3,
    MYTHIC: 4
}

RARITY_CHOICES = [
    (COMMON, 'common'),
    (UNCOMMON, 'uncommon'),
    (RARE, 'rare'),
    (EPIC, 'epic'),
    (MYTHIC, 'mythic')
]

RARITY_WEIGHTS = {
    COMMON: 0.65,
    UNCOMMON: 0.2,
    RARE: 0.1,
    EPIC: 0.05,
    MYTHIC: 0
}

CROP_PROFIT_MULTIPLIER = 10

LOVE = 'LOVE'
LIKE = 'LIKE'
NEUTRAL = 'NEUTRAL'
DISLIKE = 'DISLIKE'
HATE = 'HATE'

VALENCES = [
    (LOVE, 'love'),
    (LIKE, 'like'),
    (NEUTRAL, 'neutral'),
    (DISLIKE, 'dislike'),
    (HATE, 'hate'),
]

MINOR = 'MINOR'
MEDIUM = 'MEDIUM'
MAJOR = 'MAJOR'
GRAND = 'GRAND'
SUPREME = 'SUPREME'

MERCH_SLOT_TYPES = [
    (MINOR, 'minor'),
    (MEDIUM, 'medium'),
    (MAJOR, 'major'),
    (GRAND, 'grand'),
    (SUPREME, 'supreme'),
]

BASIC_MERCH_TYPE_TO_RARITY_MAPPING = {
    MINOR: COMMON,
    MEDIUM: UNCOMMON,
    MAJOR: RARE,
    GRAND: EPIC,
    SUPREME: None
}

PREMIUM_MERCH_TYPE_TO_RARITY_MAPPING = {
    MINOR: None,
    MEDIUM: COMMON,
    MAJOR: UNCOMMON,
    GRAND: RARE,
    SUPREME: EPIC
}

BASIC_ITEM_TYPES = [
    FISH,
    FOSSIL,
    HERB,
    BERRY,
]

PREMIUM_ITEM_TYPES = [
    FLOWER,
    MINERAL,
    TECH,
    MAGIC
]

FARM = 'FARM'
TOWN = 'TOWN'
MOUNTAIN = 'MOUNTAIN'
FOREST = 'FOREST'
BEACH = 'BEACH'
SHOP = 'SHOP'
HOME = 'HOME'

WILD_TYPES = ['MOUNTAIN', 'FOREST', 'BEACH']

PLACE_TYPES = [
    (FARM, 'Farm'),
    (MOUNTAIN, 'Mountain'),
    (FOREST, 'Forest'),
    (BEACH, 'Beach'),
    (TOWN, 'Town'),
    (SHOP, 'Shop'),
    (HOME, 'Home'),
]

MINING_ITEM_TYPES = [MINERAL, FOSSIL, TECH, MAGIC]
FISHING_ITEM_TYPES = [FISH]
FORAGING_ITEM_TYPES = [HERB, FLOWER, BERRY]

ITEM_POOL_TYPE_MAP = {
    MOUNTAIN: MINING_ITEM_TYPES,
    BEACH: FISHING_ITEM_TYPES,
    FOREST: FORAGING_ITEM_TYPES,
}

ITEM_ENTITY = 'item'
VILLAGER_ENTITY = 'villager'
PLACE_ENTITY = 'place'
GIFT_ENTITY = 'gift'

MONEY_TYPE = 'money'
TIME_TYPE = 'time'

IMAGE_PREFIX = 'mythgarden/images'

PLACE_IMAGE_DIR = 'places'
FARMER_PORTRAIT_DIR = 'portraits/farmer'
VILLAGER_PORTRAIT_DIR = 'portraits/villager'

DEFAULT_PORTRAIT = 'default.png'

ACTIVITY_ICON_PATHS = {
    'BASKET': 'basket-placeholder.png',
    'FISHING_ROD': 'fishing-rod-placeholder.png',
    'PICKAXE': 'pickaxe-placeholder.png',
    'BED': 'bed-placeholder.png',
    'DOOR': 'door-placeholder.png'
}

FISHING_DESCRIPTION = 'Go fishing'
MINING_DESCRIPTION = 'Dig for something interesting'
FORAGING_DESCRIPTION = 'Forage for plants'
EXIT_DESCRIPTION = 'Exit'

WELCOME_MESSAGE = 'Welcome to Mythgarden! You have one week to grow crops, make friends, and find treasures. Ooh and you can pick an avatar and change your name if you want! Good luck and have fun!'

TALK_MINUTES_PER_FRIENDLINESS = 10

BOOST_DENOMINATOR = 30  # means that every level of boost reduces action time by 1/30th, aka from 90->87, 60->58, 30->29, 5->4
MAX_BOOST_LEVEL = BOOST_DENOMINATOR - 5  # max boost will reduce all action times by 25/30ths, aka from 90->15, 60->10, 30->5, 5->0

LUCK_DENOMINATOR = 200  # means that every level of luck will be worth 0.5%, ie every week will give 3.5% luck
MAX_LUCK_LEVEL = 130  # max luck level will reduce common item rate to 0

KYS_MESSAGE = 'Whether out of despair, boredom, tactical necessity, or a whimsical fit of pique, you hurl yourself off a nearby cliff to your death. A few moments later, you brush the dirt off your dauntless shoulders and enter the time loop to begin the week again.'

ALL_VILLAGERS_HEARTS = 'ALL_VILLAGERS_HEARTS'
BALANCED_INCOME = 'BALANCED_INCOME'
BESTEST_FRIENDS = 'BESTEST_FRIENDS'
BEST_FRIENDS = 'BEST_FRIENDS'
DISCOVER_MYTHEGG = 'DISCOVER_MYTHEGG'
FARMING_INTAKE = 'FARMING_INTAKE'
FASTEST_FRIENDS = 'FASTEST_FRIENDS'
FAST_CASH = 'FAST_CASH'
FAST_FRIENDS = 'FAST_FRIENDS'
FAST_MYTHEGG = 'FAST_MYTHEGG'
FISHING_INTAKE = 'FISHING_INTAKE'
FORAGING_INTAKE = 'FORAGING_INTAKE'
GROSS_INCOME = 'GROSS_INCOME'
HIGH_SCORE = 'HIGH_SCORE'
MINING_INTAKE = 'MINING_INTAKE'
MULTIPLE_BEST_FRIENDS = 'MULTIPLE_BEST_FRIENDS'
MULTIPLE_MYTHEGGS = 'MULTIPLE_MYTHEGGS'
STEADFASTEST_FRIENDS = 'STEADFASTEST_FRIENDS'
STEADFAST_FRIENDS = 'STEADFAST_FRIENDS'

ACHIEVEMENT_TYPES = [
    (ALL_VILLAGERS_HEARTS, 'All villagers hearts'),
    (BALANCED_INCOME, 'Balanced income'),
    (BESTEST_FRIENDS, 'Bestest friends'),
    (BEST_FRIENDS, 'Best friends'),
    (DISCOVER_MYTHEGG, 'Discover mythegg'),
    (FARMING_INTAKE, 'Farming intake'),
    (FASTEST_FRIENDS, 'Fastest friends'),
    (FAST_CASH, 'Fast cash'),
    (FAST_FRIENDS, 'Fast friends'),
    (FAST_MYTHEGG, 'Fast mythegg'),
    (FISHING_INTAKE, 'Fishing intake'),
    (FORAGING_INTAKE, 'Foraging intake'),
    (GROSS_INCOME, 'Gross income'),
    (HIGH_SCORE, 'High score'),
    (MINING_INTAKE, 'Mining intake'),
    (MULTIPLE_BEST_FRIENDS, 'Multiple best friends'),
    (MULTIPLE_MYTHEGGS, 'Multiple mytheggs'),
    (STEADFASTEST_FRIENDS, 'Steadfastest friends'),
    (STEADFAST_FRIENDS, 'Steadfast friends'),
]

EARN_MONEY = 'EARN_MONEY'
FIND_MYTHEGG = 'FIND_MYTHEGG'
GAIN_ACHIEVEMENT = 'GAIN_ACHIEVEMENT'
GAIN_HEARTS = 'GAIN_HEARTS'
GATHER = 'GATHER'
HARVEST = 'HARVEST'
SCORE_POINTS = 'SCORE_POINTS'
TALK_TO_VILLAGERS = 'TALK_TO_VILLAGERS'

ACHIEVEMENT_TRIGGER_TYPES = [
    (EARN_MONEY, 'Earn money'),
    (FIND_MYTHEGG, 'Find mythegg'),
    (GAIN_ACHIEVEMENT, 'Gain achievement'),
    (GAIN_HEARTS, 'Gain hearts'),
    (GATHER, 'Gather'),
    (HARVEST, 'Harvest'),
    (SCORE_POINTS, 'Score points'),
    (TALK_TO_VILLAGERS, 'Talk to villagers'),
]

ACHIEVEMENT_EMOJIS = {
    SCORE_POINTS: '💯',
    GAIN_HEARTS: '❤️',
    TALK_TO_VILLAGERS: '💬',
    GAIN_ACHIEVEMENT: '🏆',
    EARN_MONEY: '⚜️',
    HARVEST: '🌾',
    GATHER: {
        FISHING_INTAKE: '🎣',
        MINING_INTAKE: '⛏',
        FORAGING_INTAKE: '🌲',
    },
    FIND_MYTHEGG: '🥚'
}
SPOOPY = 'SPOOPY'
VERDANT = 'VERDANT'
CORAL = 'CORAL'
SPARKLY = 'SPARKLY'
GOLDEN = 'GOLDEN'
RAINBOW = 'RAINBOW'

MYTHLING_TYPES = [
    (SPOOPY, 'spoopy'),
    (VERDANT, 'verdant'),
    (CORAL, 'coral'),
    (SPARKLY, 'sparkly'),
    (GOLDEN, 'golden'),
    (RAINBOW, 'rainbow'),
]

MYTHLING_TYPE_TO_DRAW_VARIABLE = {
    SPOOPY: 'mining_attempts',
    VERDANT: 'foraging_attempts',
    CORAL: 'fishing_attempts',
    SPARKLY: 'depth_weighted_hearts_earned',
    GOLDEN: 'farming_koin_earned',
    RAINBOW: 'mytheggs_found'
}

MYTHEGG = 'MYTHEGG'
MYTHLING = 'MYTHLING'
MYTHIMAL = 'MYTHIMAL'

MYTHLING_GROWTH_STAGES = [
    (MYTHEGG, 'mythegg'),
    (MYTHLING, 'mythling'),
    (MYTHIMAL, 'mythimal'),
]

MYTHLING_PORTRAIT_DIR = 'portraits/villager'

SPOOPY_LUCK_BONUS = 40  # in luck_levels, so equals out to 20%
CORAL_PRICE_MULTIPLIER = 2
SPARKLY_FRIENDLINESS = 7
RAINBOW_BONUS_TIME = 3 * 60  # so 3am
GOLD_CROP_PREFIX = 'Golden'
GOLD_CROP_PROFIT_MULTIPLIER = 20
