# Quick Chat — Backend Low Level Design (LLD)

| Field | Value |
|-------|--------|
| **Document** | Backend LLD |
| **Code root** | `server/` |
| **Runtime** | Node.js · Express · Socket.IO · Mongoose |

---

## 1. Module map

```text
server/
├── server.js              # Bootstrap: dotenv → DB → HTTP listen
├── app.js                 # Express app + Socket.IO wiring + route mount
├── config.env             # PORT_NUMBER, CONN_STRING, SECRET_KEY
├── config/dbConfig.js     # mongoose.connect + connection events
├── cloudinary.js          # Cloudinary SDK config
├── middlewares/
│   └── authMiddleware.js  # JWT verify → req.body.userId
├── models/
│   ├── user.js
│   ├── chat.js
│   └── message.js
└── controllers/           # Express Routers (route + handler colocated)
    ├── authController.js
    ├── userController.js
    ├── chatController.js
    └── messageController.js
```

**Boot sequence**

1. `server.js` loads `dotenv` from `./config.env`
2. Requires `dbConfig` (starts Mongo connection)
3. Requires `app.js` (exports HTTP `server` with Socket.IO attached)
4. `server.listen(process.env.PORT || process.env.PORT_NUMBER || 5000)`

---

## 2. Layering

| Layer | Responsibility | Files |
|-------|----------------|-------|
| Transport | HTTP + WebSocket | `app.js` |
| Routing / use-cases | Request validation-ish + orchestration | `controllers/*` |
| Auth gate | JWT parse/verify | `authMiddleware.js` |
| Persistence | Schemas / queries | `models/*` |
| External media | Upload | `cloudinary.js` |

There is **no** separate service/repository layer — controllers talk to Mongoose models directly (typical for this app’s size).

---

## 3. Data model (ER)

Full diagram + field dictionary: [07-er-diagram.md](./07-er-diagram.md).

```text
┌──────────────┐         members[]          ┌──────────────┐
│    users     │◄──────────────────────────►│    chats     │
│──────────────│                            │──────────────│
│ firstname    │                            │ members[]    │
│ lastname     │         lastMessage        │ lastMessage  │──┐
│ email        │◄───────────────────────────│ unreadCount  │  │
│ password     │                            │ timestamps   │  │
│ profilePic   │                            └──────┬───────┘  │
│ timestamps   │                                   │          │
└──────┬───────┘                                   │ chatId   │
       │ sender                                    ▼          │
       │                              ┌────────────────┐      │
       └─────────────────────────────►│   messages     │◄─────┘
                                      │────────────────│
                                      │ chatId         │
                                      │ sender         │
                                      │ text?          │
                                      │ image?         │
                                      │ read           │
                                      │ timestamps     │
                                      └────────────────┘
```

### 3.1 Collection: `users`

| Field | Type | Notes |
|-------|------|-------|
| firstname | String, required | |
| lastname | String, required | |
| email | String, required | Uniqueness enforced in signup handler (not schema unique index) |
| password | String, required | bcrypt hash |
| profilePic | String, optional | Cloudinary `secure_url` |
| createdAt / updatedAt | Date | `timestamps: true` |

### 3.2 Collection: `chats`

| Field | Type | Notes |
|-------|------|-------|
| members | ObjectId[] → users | Typically length 2 for 1:1 |
| lastMessage | ObjectId → messages | Updated on send |
| unreadMessageCount | Number, default 0 | Incremented on each new message |
| createdAt / updatedAt | Date | List sorted by `updatedAt` desc |

### 3.3 Collection: `messages`

| Field | Type | Notes |
|-------|------|-------|
| chatId | ObjectId → chats | |
| sender | ObjectId → users | |
| text | String, optional | |
| image | String, optional | Often a data URL / base64 string |
| read | Boolean, default false | Bulk-set true on clear-unread |
| createdAt / updatedAt | Date | Fetched ascending by `createdAt` |

---

## 4. Cross-cutting: Auth middleware

**File:** `middlewares/authMiddleware.js`

```text
Authorization: Bearer <jwt>
        │
        ▼
  split(' ')[1]
        │
        ▼
  jwt.verify(token, SECRET_KEY) → { userId }
        │
        ▼
  req.body.userId = userId
        │
        ▼
      next()
```

| Success | Failure |
|---------|---------|
| Calls `next()` | `{ success: false, message }` (often without HTTP 401) |

**JWT payload:** `{ userId: <Mongo ObjectId string> }`  
**Expiry:** `1d` (set at login)

---

## 5. REST API specification

Base path examples assume host `https://<server>`.

### 5.1 Auth — `/api/auth` (public)

#### `POST /api/auth/signup`

**Body**

```json
{
  "firstname": "string",
  "lastname": "string",
  "email": "string",
  "password": "string"
}
```

**Logic**

1. `User.findOne({ email })` — if exists → `success: false`
2. `bcrypt.hash(password, 10)`
3. `new User(req.body).save()`
4. `201` + success message (**no token**)

#### `POST /api/auth/login`

**Body**

```json
{ "email": "string", "password": "string" }
```

**Logic**

1. Find user by email
2. `bcrypt.compare`
3. `jwt.sign({ userId }, SECRET_KEY, { expiresIn: "1d" })`
4. Return `{ success, token, message }`

---

### 5.2 User — `/api/user` (JWT required)

#### `GET /api/user/get-logged-user`

- Uses `req.body.userId` from middleware
- Returns full user document (includes password hash today — interview note)

#### `GET /api/user/get-all-users`

- `User.find({ _id: { $ne: userId } })`
- Returns all other users

#### `POST /api/user/upload-profile-pic`

**Body**

```json
{ "image": "<base64 or data URL>" }
```

**Logic**

1. `cloudinary.uploader.upload(image, { folder: 'quick-chat' })`
2. `User.findByIdAndUpdate(userId, { profilePic: secure_url }, { new: true })`
3. Return updated user

---

### 5.3 Chat — `/api/chat` (JWT required)

#### `POST /api/chat/create-new-chat`

**Body (typical)**

```json
{ "members": ["<userIdA>", "<userIdB>"] }
```

- Saves chat, `populate('members')`, returns chat

#### `GET /api/chat/get-all-chats`

- `Chat.find({ members: { $in: userId } })`
- `.populate('members').populate('lastMessage')`
- `.sort({ updatedAt: -1 })`

#### `POST /api/chat/clear-unread-message`

**Body**

```json
{ "chatId": "<id>" }
```

**Logic**

1. Set `unreadMessageCount = 0` on chat
2. `Message.updateMany({ chatId, read: false }, { read: true })`
3. Return populated chat

---

### 5.4 Message — `/api/message` (JWT required)

#### `POST /api/message/new-message`

**Body**

```json
{
  "chatId": "<id>",
  "sender": "<userId>",
  "text": "optional",
  "image": "optional"
}
```

**Logic**

1. Save `Message`
2. `Chat.findOneAndUpdate({ _id: chatId }, { lastMessage: msgId, $inc: { unreadMessageCount: 1 } })`
3. Return saved message (`201`)

#### `GET /api/message/get-all-messages/:chatId`

- `Message.find({ chatId }).sort({ createdAt: 1 })`
- No pagination (loads full history)

---

## 6. Socket.IO LLD

**Attachment:** Socket.IO server created on the same HTTP server in `app.js`.  
**CORS:** `origin: process.env.CLIENT_URL || '*'`.

### 6.1 Room model

- Client emits `join-room` with `userId`
- Server: `socket.join(userid)`
- Targeting: `io.to(memberId0).to(memberId1).emit(...)`

### 6.2 Event catalog

| Inbound (client → server) | Payload (conceptual) | Outbound | Recipients |
|---------------------------|----------------------|----------|------------|
| `join-room` | `userId` | — | — |
| `send-message` | message + `members[2]` | `receive-message`, `set-message-count` | both members |
| `clear-unread-messages` | `{ chatId, members }` | `message-count-cleared` | both members |
| `user-typing` | `{ members, ... }` | `started-typing` | both members |
| `user-login` | `userId` | `online-users` | **emitting socket only** |
| `user-offline` | `userId` | `online-users-updated` | **all sockets** |

### 6.3 Online presence algorithm

```text
onlineUser = []   // process memory

on user-login(userId):
  if userId not in onlineUser → push
  emit online-users to THIS socket only

on user-offline(userId):
  splice userId from onlineUser
  broadcast online-users-updated to ALL
```

**Limitations (document for interviews)**

- Lost on process restart
- Not shared across multiple Render instances
- `user-login` does not broadcast to other users (only returns list to self); peers rely on later updates / their own fetches

---

## 7. Important algorithms

### 7.1 Unread count

1. Every `new-message` increments chat `unreadMessageCount` by 1 (including when sender is you — UI filters display)
2. Opening a chat (client) calls `clear-unread-message` when last message is from the other user
3. Clear sets count to 0 and marks messages `read: true`

### 7.2 Password hashing

- Algorithm: bcrypt  
- Salt rounds: **10**  
- Compare on login only; JWT carries no password

---

## 8. Error & response conventions

Most handlers return JSON shaped as:

```json
{
  "success": true | false,
  "message": "human readable",
  "data": { }
}
```

HTTP status codes are used inconsistently (`201` / `200` / `400` / default). Interview improvement: standardize statuses + never return password hashes.

---

## 9. Configuration

| Variable | Used by | Purpose |
|----------|---------|---------|
| `PORT` / `PORT_NUMBER` | `server.js` | Listen port (Render injects `PORT`) |
| `CONN_STRING` | `dbConfig.js` | MongoDB URI |
| `SECRET_KEY` | auth + middleware | JWT signing/verify |
| `CLIENT_URL` | Socket CORS | Allowed frontend origin |

Cloudinary: `cloud_name`, `api_key`, `api_secret` in `cloudinary.js`.

---

## 10. Backend class/module responsibilities (summary)

| Module | Owns |
|--------|------|
| `authController` | Signup / login crypto + token issuance |
| `userController` | Current user, directory, profile upload |
| `chatController` | Chat lifecycle + unread clear |
| `messageController` | Message persist + history |
| `app.js` sockets | Real-time fan-out + presence array |

---

## 11. Suggested backend improvements (LLD backlog)

1. Strip `password` from user responses  
2. Unique index on `email`  
3. Prevent duplicate 1:1 chats for same member pair  
4. Message pagination (`limit` / `before` cursor)  
5. Auth middleware should not mutate only `req.body` (use `req.user`) — GET-safe  
6. Redis adapter for Socket.IO + presence  
7. Move Cloudinary secrets to env  
8. Consistent HTTP status codes + rate limiting
