# Message Center Redesign

## Goal

Transform the message system from a static log into a dynamic toast notification system. Messages appear as floating notifications over the game location and fade away, creating a more immersive and less intrusive experience.

## Current Behavior

- Messages accumulate in a fixed 3rem tall log at the bottom of the center column
- Log scrolls automatically to show newest messages
- Messages persist until session reset (game over)
- Positioned below the location display

## New Behavior

### Toast Notifications

Messages appear as floating toasts overlaying the bottom of the location image:

```
┌─────────────────────────────────────┐
│                                     │
│         [Location Image]            │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ You harvested a Parsnip!    │    │  ← stacked toasts
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ +❤️ You and Trix have...    │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
         [📜 History]                     ← history button
```

### Animation Timeline

```
0s          3s          6s
|-----------|-----------|
 visible     fading out   removed
 opacity:1   opacity:1→0
```

1. **Appear:** Fade in instantly (opacity 0 → 1 over ~200ms)
2. **Display:** Fully visible for 3 seconds
3. **Fade:** Gradually fade out over 3 seconds (opacity 1 → 0)
4. **Remove:** Element removed from DOM after fade completes

### Stacking

When multiple messages arrive in quick succession:
- New messages appear at the bottom of the stack
- Each message has its own independent timer
- Stack grows upward from the bottom of the location
- Older messages fade out while newer ones remain visible

```
t=0s:  [Message A appears]

t=1s:  [Message A]
       [Message B appears]

t=3s:  [Message A starts fading]
       [Message B]

t=4s:  [Message A still fading]
       [Message B starts fading]
       [Message C appears]

t=6s:  [Message A removed]
       [Message B still fading]
       [Message C]
```

### Message History

A button below the location opens a modal showing all messages from the current session:

**Button:** `[📜]` or `[📜 History]` - small, unobtrusive, bottom-right of location area

**Modal:**
```
┌─────────────────────────────────────┐
│  Message History              [✕]   │
├─────────────────────────────────────┤
│  🎉 Achievement Unlocked: Best...   │  ← newest at top
│  ─────────────────────────────────  │
│  +❤️ You and Vir have developed...  │
│  ─────────────────────────────────  │
│  You gave Vir a Parsnip.            │
│  ─────────────────────────────────  │
│  You talked to Vir.                 │
│  ─────────────────────────────────  │
│  You traveled to Old Town.          │
│  ─────────────────────────────────  │
│  You woke up on Monday morning...   │  ← oldest at bottom
│                                     │
│  (scrollable, newest at top)        │
└─────────────────────────────────────┘
```

## Data Model

No changes to the Message model. Messages continue to be stored in the database and persist for the session.

The frontend tracks additional state for toast display:

```typescript
interface ToastMessage {
    id: number;
    text: string;
    isError: boolean;
    createdAt: number;      // timestamp when toast was created
    state: 'visible' | 'fading' | 'removed';
}
```

## Frontend Implementation

### Types

```typescript
interface ToastMessage {
    id: number;
    text: string;
    isError: boolean;
    createdAt: number;
    state: 'visible' | 'fading' | 'removed';
}

interface MessageHistoryProps {
    messages: MessageProps[];
    isOpen: boolean;
    onClose: () => void;
}
```

### Toast Container Component

```tsx
function ToastContainer({ messages }: { messages: MessageProps[] }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const seenMessageIds = useRef<Set<number>>(new Set());

    // Track new messages and create toasts
    useEffect(() => {
        messages.forEach(msg => {
            if (!seenMessageIds.current.has(msg.id)) {
                seenMessageIds.current.add(msg.id);
                setToasts(prev => [...prev, {
                    ...msg,
                    createdAt: Date.now(),
                    state: 'visible'
                }]);
            }
        });
    }, [messages]);

    // Timer to transition toast states
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setToasts(prev => prev
                .map(toast => {
                    const age = now - toast.createdAt;
                    if (age > 6000) {
                        return { ...toast, state: 'removed' as const };
                    } else if (age > 3000) {
                        return { ...toast, state: 'fading' as const };
                    }
                    return toast;
                })
                .filter(toast => toast.state !== 'removed')
            );
        }, 100);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast key={toast.id} {...toast} />
            ))}
        </div>
    );
}
```

### Individual Toast Component

```tsx
function Toast({ text, isError, createdAt, state }: ToastMessage) {
    const age = Date.now() - createdAt;

    // Calculate opacity during fade phase (3s-6s)
    let opacity = 1;
    if (state === 'fading') {
        const fadeProgress = (age - 3000) / 3000; // 0 to 1
        opacity = 1 - fadeProgress;
    }

    return (
        <div
            className={`toast ${isError ? 'error' : ''}`}
            style={{ opacity }}
        >
            {text}
        </div>
    );
}
```

### Message History Modal

```tsx
function MessageHistory({ messages, isOpen, onClose }: MessageHistoryProps) {
    if (!isOpen) return null;

    // Reverse to show newest at top
    const reversedMessages = [...messages].reverse();

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="message-history-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Message History</h3>
                    <button className="close-button" onClick={onClose}>✕</button>
                </div>
                <div className="modal-content">
                    {reversedMessages.map(msg => (
                        <div
                            key={msg.id}
                            className={`history-message ${msg.isError ? 'error' : ''}`}
                        >
                            {msg.text}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

### History Button

```tsx
function HistoryButton({ onClick }: { onClick: () => void }) {
    return (
        <button className="history-button" onClick={onClick} title="Message History">
            📜
        </button>
    );
}
```

## CSS/Styling

### Toast Container

```scss
.toast-container {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 100;
    pointer-events: none;  // Allow clicks to pass through to location
    max-width: 90%;
}
```

### Individual Toast

```scss
.toast {
    background: rgba(252, 245, 239, 0.95);  // Parchment with slight transparency
    border: 2px solid darkgreen;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 1.25rem;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    pointer-events: auto;

    // Fade in animation
    animation: toast-appear 200ms ease-out;

    &.error {
        border-color: #cd7a00;
        color: #cd7a00;
    }
}

@keyframes toast-appear {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### History Button

```scss
.history-button {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    background: rgba(252, 245, 239, 0.8);
    border: 1px solid darkgreen;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    z-index: 50;

    &:hover {
        background: rgba(252, 245, 239, 1);
    }
}
```

### History Modal

```scss
.message-history-modal {
    background: #fcf5ef;
    border: 3px solid darkgreen;
    border-radius: 12px;
    max-width: 500px;
    max-height: 70vh;
    width: 90%;

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border-bottom: 2px solid darkgreen;

        h3 {
            margin: 0;
        }

        .close-button {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
        }
    }

    .modal-content {
        padding: 1rem;
        overflow-y: auto;
        max-height: calc(70vh - 4rem);
    }

    .history-message {
        padding: 0.5rem 0;
        border-bottom: 1px solid rgba(0, 100, 0, 0.2);

        &:last-child {
            border-bottom: none;
        }

        &.error {
            color: #cd7a00;
        }
    }
}
```

## Integration Changes

### Location Component

The location component needs to be updated to include the toast container:

```tsx
function Location({ imageUrl, name, ... }) {
    return (
        <div className="location-container">
            <img src={imageUrl} alt={name} className="location-image" />

            {/* Toast notifications overlay */}
            <ToastContainer messages={messages} />

            {/* History button */}
            <HistoryButton onClick={() => setShowHistory(true)} />
        </div>
    );
}
```

### Remove Old Message Log

Remove the `#message-log` element from the app layout. The List component currently rendering messages at the bottom of the center column should be removed.

### App State

Add state for history modal:

```tsx
const [showMessageHistory, setShowMessageHistory] = useState(false);
```

## Migration Steps

1. Create `ToastContainer` and `Toast` components
2. Create `MessageHistory` modal component
3. Create `HistoryButton` component
4. Add CSS for all new components
5. Update location container to include toast overlay and history button
6. Remove old `#message-log` element and styling
7. Add `showMessageHistory` state to App
8. Wire up history button to open modal

## Edge Cases

- **Session reset:** Clear `seenMessageIds` ref when session changes
- **Many messages:** If more than ~5 toasts stack, older ones will naturally fade out; no explicit limit needed
- **Long messages:** Text wraps within toast; consider `max-width` and `word-break`
- **Rapid messages:** Each gets its own timer; fast actions will create a cascade of toasts that fade in sequence
