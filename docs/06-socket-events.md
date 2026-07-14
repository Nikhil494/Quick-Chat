# Quick Chat — Socket.IO Event Contract (companion to OpenAPI)

REST is covered by [`05-openapi.yaml`](./05-openapi.yaml).  
Real-time transport uses **Socket.IO** on the same server origin.

**Client connect:** `io(<REACT_APP_API_URL>)`  
**Rooms:** each user joins a room named with their `userId` via `join-room`.

---

## Client → Server

| Event | Payload (typical) | Server effect |
|-------|-------------------|---------------|
| `join-room` | `userId: string` | `socket.join(userId)` |
| `send-message` | Message object including `members: [id0, id1]` | Emit `receive-message` + `set-message-count` to both member rooms |
| `clear-unread-messages` | `{ chatId, members: [id0, id1], ... }` | Emit `message-count-cleared` to both members |
| `user-typing` | `{ members: [id0, id1], ... }` | Emit `started-typing` to both members |
| `user-login` | `userId: string` | Add to in-memory `onlineUser[]`; emit `online-users` **to this socket** |
| `user-offline` | `userId: string` | Remove from list; broadcast `online-users-updated` to **all** |

---

## Server → Client

| Event | When | Suggested client handling |
|-------|------|---------------------------|
| `receive-message` | After peer/self `send-message` | Append to open chat; refresh chat previews |
| `set-message-count` | Alongside new message | Update unread badges |
| `message-count-cleared` | After clear-unread | Zero badge for that chat |
| `started-typing` | Peer typing | Show typing indicator briefly |
| `online-users` | Reply to `user-login` | Replace local online list |
| `online-users-updated` | Someone went offline (broadcast) | Replace local online list |

---

## Example `send-message` payload shape

```json
{
  "_id": "optional-temp-or-saved-id",
  "chatId": "64f...",
  "sender": "64f...",
  "text": "Hello",
  "image": null,
  "members": ["64f...userA", "64f...userB"]
}
```

`members` is required for room targeting even though it is not a Mongoose Message field.
