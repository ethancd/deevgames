# Unclaimed Achievements Visibility

## Goal

Help players aim for achievements by showing what's available and their progress toward each.

## Current Behavior

- Earned achievements show name, description, emoji, and unlocked knowledge
- Unearned achievements show as "❓ Unknown - Not yet unlocked..."
- 114 total achievements
- All achievements are within-run (progress resets each run, but earned achievements persist on Hero)

## New Behavior

### Achievement Display (Unearned)

- **Show:** Name and description
- **Hide:** Emoji (revealed on earn as a reward moment)
- **Add:** Progress bar with contextual label

### Progress Tracking

All achievement types will show progress:

| Achievement Type | Progress Display |
|-----------------|------------------|
| BEST_FRIENDS | "3/5 ❤️ with [Villager]" |
| FAST_FRIENDS | "3/5 ❤️ with [Villager] (by [Day])" |
| STEADFAST_FRIENDS | "5/7 days talked to [Villager]" |
| HIGH_SCORE | "1,200/2,000 pts" |
| GROSS_INCOME | "500/1,000 ⚜️ earned" |
| FAST_CASH | "500/1,000 ⚜️ (by [Day])" |
| BALANCED_INCOME | "min 200/500 ⚜️ across sources" |
| FARMING_INTAKE | "300/500 ⚜️ from farming" |
| FISHING_INTAKE | "300/500 ⚜️ from fishing" |
| MINING_INTAKE | "300/500 ⚜️ from mining" |
| FORAGING_INTAKE | "300/500 ⚜️ from foraging" |
| DISCOVER_MYTHEGG | "0/1 [Mythegg] found" |
| FAST_MYTHEGG | "0/1 [Mythegg] (by [Day])" |
| MULTIPLE_MYTHEGGS | "2/3 mytheggs found" |
| ALL_VILLAGERS_HEARTS | "4/6 villagers at 3+ ❤️" |
| MULTIPLE_BEST_FRIENDS | "2/3 best friends" |
| BESTEST_FRIENDS | "2/6 best friend achievements" |
| FASTEST_FRIENDS | "2/6 fast friend achievements" |
| STEADFASTEST_FRIENDS | "2/6 steadfast friend achievements" |

### Achievement Sort Order

Fixed order, not by progress. Grouped by type, then alphabetically by villager name within type:

1. HIGH_SCORE achievements
2. GROSS_INCOME / FAST_CASH / BALANCED_INCOME
3. FARMING_INTAKE / FISHING_INTAKE / MINING_INTAKE / FORAGING_INTAKE
4. BEST_FRIENDS (alphabetically by villager)
5. FAST_FRIENDS (alphabetically by villager)
6. STEADFAST_FRIENDS (alphabetically by villager)
7. MULTIPLE_BEST_FRIENDS
8. ALL_VILLAGERS_HEARTS
9. BESTEST_FRIENDS / FASTEST_FRIENDS / STEADFASTEST_FRIENDS
10. DISCOVER_MYTHEGG (alphabetically by mythegg)
11. FAST_MYTHEGG (alphabetically by mythegg)
12. MULTIPLE_MYTHEGGS

Earned achievements appear first (in the same fixed order), followed by unearned.

## Backend Changes

### Achievement Model

Add method to calculate progress:

```python
def get_progress(self, session) -> dict:
    """
    Returns progress toward this achievement.

    Returns:
        {
            'current': int,      # current progress value
            'target': int,       # target value to earn achievement
            'label': str,        # human-readable progress string
            'percent': float,    # 0.0 to 1.0
        }
    """
```

### Serialization

Update `Achievement.serialize()` to accept optional `session` parameter:

```python
def serialize(self, session=None, is_earned=False):
    data = {
        'name': self.name,
        'description': self.description,
        'id': self.id,
        'isEarned': is_earned,
    }

    if is_earned:
        data['emoji'] = self.emoji
        data['unlockedKnowledge'] = self.unlocked_knowledge_names
    else:
        data['progress'] = self.get_progress(session)

    return data
```

### View Helper

Update achievements endpoint to pass all achievements (earned and unearned) with appropriate serialization:

```python
def get_all_achievements_with_progress(session):
    earned = set(session.hero.achievements.all())
    all_achievements = Achievement.objects.all().order_by('achievement_type', 'villager__name')

    return [
        a.serialize(session=session, is_earned=(a in earned))
        for a in all_achievements
    ]
```

## Frontend Changes

### Types

```typescript
interface AchievementProgress {
    current: number;
    target: number;
    label: string;
    percent: number;
}

interface AchievementProps {
    id: number;
    name: string;
    description: string;
    isEarned: boolean;
    emoji?: string;
    unlockedKnowledge?: string[];
    progress?: AchievementProgress;
}
```

### Components

Rename `EmptyAchievement` to `UnclaimedAchievement`:

```tsx
function UnclaimedAchievement({ name, description, progress }: AchievementProps): JSX.Element {
    return (
        <li className="achievement unclaimed">
            <div className='row'>
                <div className="icon">❓</div>
                <div className='column'>
                    <span className="title">{name}</span>
                    <span className="description">{description}</span>
                    {progress && (
                        <div className="progress-container">
                            <div
                                className="progress-bar"
                                style={{ width: `${progress.percent * 100}%` }}
                            />
                            <span className="progress-label">{progress.label}</span>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}
```

### Styling

```scss
.achievement {
    &.unclaimed {
        opacity: 0.8;

        .progress-container {
            position: relative;
            height: 16px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            margin-top: 4px;
            overflow: hidden;
        }

        .progress-bar {
            position: absolute;
            height: 100%;
            background: linear-gradient(90deg, #4a9eff, #a855f7);
            border-radius: 8px;
            transition: width 0.3s ease;
        }

        .progress-label {
            position: relative;
            z-index: 1;
            font-size: 11px;
            padding: 0 8px;
            line-height: 16px;
        }
    }
}
```

## Data Flow

1. Frontend requests achievements via existing endpoint
2. Backend returns ALL achievements (not just earned)
3. Each achievement includes `isEarned` flag
4. Unearned achievements include `progress` object
5. Frontend renders earned achievements with emoji/knowledge, unearned with progress bar
6. On achievement earn, re-fetch updates `isEarned` to true and adds emoji/knowledge
