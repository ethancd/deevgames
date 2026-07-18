# Settings Menu

## Goal

Consolidate hero customization and add difficulty settings in a unified hamburger menu. Allow players to opt into additional complexity for score bonuses.

## Design Philosophy

The game defaults to a simpler, more accessible experience:
- Villagers stay in fixed locations (except Trix, who always roams)
- Buildings are always open
- Crops use classic 2-day growth cycle
- Shop inventory is fixed/predictable

Players can enable dynamic/complex features for a **score multiplier bonus**, rewarding those who take on the challenge.

## UI Design

### Menu Trigger

Hamburger button (☰) in the top-right corner of the screen.

### Menu Structure

```
┌─────────────────────────────────────────┐
│  [Hero]   [Settings]                    │  ← tabs
├─────────────────────────────────────────┤
│                                         │
│  (tab content)                          │
│                                         │
└─────────────────────────────────────────┘
```

### Hero Tab

Existing functionality moved into the menu:

- **Name input:** Editable hero name (max 16 chars)
- **Portrait gallery:** Grid of selectable farmer portraits

### Settings Tab

```
Challenge Options                    Score Bonus
───────────────────────────────────────────────

☐ Villagers move around                   +50%
  Villagers travel between locations
  on a schedule. (Trix always roams!)

☐ Building hours                          +25%
  Shops and buildings have opening
  and closing times.

☐ Advanced crops                          +25%
  Crops have variable growth times
  and watering requirements.

☐ Dynamic shop inventory                  +25%
  Shop stock changes throughout
  the week.

───────────────────────────────────────────────
Score Multiplier: 100%
```

### Pending Changes

When a setting is toggled but hasn't taken effect yet:

```
☑ Villagers move around                   +50%
  Villagers travel between locations
  on a schedule. (Trix always roams!)
  ⓘ This change will be applied when you start your next run
```

The info text appears below any setting where draft ≠ active.

### Score Multiplier Display

Shows cumulative bonus. Examples:

- No options enabled: `Score Multiplier: 100%`
- Villagers moving only: `Score Multiplier: 150%`
- All options enabled: `Score Multiplier: 225%` (100 + 50 + 25 + 25 + 25)

The display should show the **active** multiplier (current run), with a note if the draft differs:
```
Score Multiplier: 100%
(Next run: 150%)
```

## Data Model

### New Model: GameSettings

```python
class GameSettings(models.Model):
    hero = models.OneToOneField('Hero', on_delete=models.CASCADE, related_name='settings')

    # Active settings (current run uses these)
    villagers_move = models.BooleanField(default=False)
    building_hours = models.BooleanField(default=False)
    advanced_crops = models.BooleanField(default=False)
    dynamic_shop = models.BooleanField(default=False)

    # Draft settings (applied on next run)
    draft_villagers_move = models.BooleanField(default=False)
    draft_building_hours = models.BooleanField(default=False)
    draft_advanced_crops = models.BooleanField(default=False)
    draft_dynamic_shop = models.BooleanField(default=False)

    SCORE_BONUSES = {
        'villagers_move': 0.50,
        'building_hours': 0.25,
        'advanced_crops': 0.25,
        'dynamic_shop': 0.25,
    }

    @property
    def score_multiplier(self) -> float:
        """Calculate active score multiplier."""
        multiplier = 1.0
        for setting, bonus in self.SCORE_BONUSES.items():
            if getattr(self, setting):
                multiplier += bonus
        return multiplier

    @property
    def draft_score_multiplier(self) -> float:
        """Calculate draft score multiplier."""
        multiplier = 1.0
        for setting, bonus in self.SCORE_BONUSES.items():
            if getattr(self, f'draft_{setting}'):
                multiplier += bonus
        return multiplier

    def apply_draft(self):
        """Copy draft settings to active settings. Called at run start."""
        self.villagers_move = self.draft_villagers_move
        self.building_hours = self.draft_building_hours
        self.advanced_crops = self.draft_advanced_crops
        self.dynamic_shop = self.draft_dynamic_shop
        self.save()

    def serialize(self):
        return {
            'villagers_move': self.villagers_move,
            'building_hours': self.building_hours,
            'advanced_crops': self.advanced_crops,
            'dynamic_shop': self.dynamic_shop,
            'draft_villagers_move': self.draft_villagers_move,
            'draft_building_hours': self.draft_building_hours,
            'draft_advanced_crops': self.draft_advanced_crops,
            'draft_dynamic_shop': self.draft_dynamic_shop,
            'score_multiplier': self.score_multiplier,
            'draft_score_multiplier': self.draft_score_multiplier,
        }
```

### Hero Model Update

Ensure GameSettings is created with Hero:

```python
@receiver(post_save, sender=Hero)
def create_game_settings(sender, instance, created, **kwargs):
    if created:
        GameSettings.objects.create(hero=instance)
```

## Game Logic Integration

### Villager Movement

In `event_operator.py`, check settings before processing `VillagerAppearsEvent`:

```python
def process_villager_appears_event(self, event, session):
    settings = session.hero.settings

    # Trix always moves regardless of settings
    if not settings.villagers_move and event.villager.name != 'Trix':
        return  # Skip event, villager stays put

    # Existing logic...
```

### Building Hours

In `action_validator.py` or wherever building access is checked:

```python
def is_building_accessible(self, building, clock, session):
    settings = session.hero.settings

    if not settings.building_hours:
        return True  # Always open

    return building.is_open(clock.time)
```

### Advanced Crops

In `action_executor.py` for crop growth:

```python
def execute_water_action(self, action, session):
    settings = session.hero.settings

    if settings.advanced_crops:
        # Use growth_days and effort_time from Item model
        # Variable growth based on item properties
    else:
        # Classic mode: simple SEED → SPROUT → CROP
        # 1 day per stage, 2 days total
```

### Dynamic Shop Inventory

In `event_operator.py` for `PopulateShopEvent`:

```python
def process_populate_shop_event(self, event, session):
    settings = session.hero.settings

    if not settings.dynamic_shop:
        return  # Skip event, shop keeps initial inventory

    # Existing randomized restocking logic...
```

### Score Calculation

At end of run:

```python
def calculate_final_score(session):
    base_score = session.hero_state.score
    multiplier = session.hero.settings.score_multiplier
    return int(base_score * multiplier)
```

### Run Start

When starting a new run, apply draft settings:

```python
def start_new_run(session):
    session.hero.settings.apply_draft()
    # ... rest of run initialization
```

## API Endpoints

### GET /settings

Returns current settings state:

```json
{
    "villagers_move": false,
    "building_hours": false,
    "advanced_crops": false,
    "dynamic_shop": false,
    "draft_villagers_move": true,
    "draft_building_hours": false,
    "draft_advanced_crops": false,
    "draft_dynamic_shop": false,
    "score_multiplier": 1.0,
    "draft_score_multiplier": 1.5
}
```

### POST /settings

Updates draft settings:

```json
{
    "draft_villagers_move": true,
    "draft_building_hours": true
}
```

## Frontend Implementation

### Types

```typescript
interface GameSettings {
    villagers_move: boolean;
    building_hours: boolean;
    advanced_crops: boolean;
    dynamic_shop: boolean;
    draft_villagers_move: boolean;
    draft_building_hours: boolean;
    draft_advanced_crops: boolean;
    draft_dynamic_shop: boolean;
    score_multiplier: number;
    draft_score_multiplier: number;
}

interface SettingOption {
    key: string;
    label: string;
    description: string;
    bonus: number;
}

const SETTING_OPTIONS: SettingOption[] = [
    {
        key: 'villagers_move',
        label: 'Villagers move around',
        description: 'Villagers travel between locations on a schedule. (Trix always roams!)',
        bonus: 50,
    },
    {
        key: 'building_hours',
        label: 'Building hours',
        description: 'Shops and buildings have opening and closing times.',
        bonus: 25,
    },
    {
        key: 'advanced_crops',
        label: 'Advanced crops',
        description: 'Crops have variable growth times and watering requirements.',
        bonus: 25,
    },
    {
        key: 'dynamic_shop',
        label: 'Dynamic shop inventory',
        description: 'Shop stock changes throughout the week.',
        bonus: 25,
    },
];
```

### Components

```tsx
function SettingsMenu({ isOpen, onClose }: SettingsMenuProps) {
    const [activeTab, setActiveTab] = useState<'hero' | 'settings'>('hero');

    if (!isOpen) return null;

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="tabs">
                    <button
                        className={activeTab === 'hero' ? 'active' : ''}
                        onClick={() => setActiveTab('hero')}
                    >
                        Hero
                    </button>
                    <button
                        className={activeTab === 'settings' ? 'active' : ''}
                        onClick={() => setActiveTab('settings')}
                    >
                        Settings
                    </button>
                </div>

                <div className="tab-content">
                    {activeTab === 'hero' ? <HeroTab /> : <SettingsTab />}
                </div>
            </div>
        </div>
    );
}

function SettingsTab() {
    const [settings, setSettings] = useState<GameSettings>(/* from context/props */);

    const toggleSetting = async (key: string) => {
        const draftKey = `draft_${key}`;
        const newValue = !settings[draftKey];
        await postSettings({ [draftKey]: newValue });
        // Update local state...
    };

    return (
        <div className="settings-tab">
            <h3>Challenge Options</h3>

            {SETTING_OPTIONS.map(option => {
                const isActive = settings[option.key];
                const isDraft = settings[`draft_${option.key}`];
                const hasPendingChange = isActive !== isDraft;

                return (
                    <div key={option.key} className="setting-row">
                        <label>
                            <input
                                type="checkbox"
                                checked={isDraft}
                                onChange={() => toggleSetting(option.key)}
                            />
                            <span className="setting-label">{option.label}</span>
                            <span className="setting-bonus">+{option.bonus}%</span>
                        </label>
                        <p className="setting-description">{option.description}</p>
                        {hasPendingChange && (
                            <p className="pending-notice">
                                This change will be applied when you start your next run
                            </p>
                        )}
                    </div>
                );
            })}

            <div className="score-multiplier">
                <span>Score Multiplier: {Math.round(settings.score_multiplier * 100)}%</span>
                {settings.score_multiplier !== settings.draft_score_multiplier && (
                    <span className="draft-multiplier">
                        (Next run: {Math.round(settings.draft_score_multiplier * 100)}%)
                    </span>
                )}
            </div>
        </div>
    );
}
```

## Migration Path

1. Create `GameSettings` model and migration
2. Create `GameSettings` instance for all existing Heroes (with all options `False`)
3. Update game logic to check settings before:
   - Processing villager movement events
   - Checking building hours
   - Processing crop growth
   - Processing shop restock events
4. Update score calculation to apply multiplier
5. Add hamburger button and settings modal to frontend
6. Move existing hero name/portrait UI into Hero tab
