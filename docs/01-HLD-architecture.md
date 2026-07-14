# Quick Chat — High Level Design (HLD)

| Field | Value |
|-------|--------|
| **Product** | Quick Chat — real-time 1:1 messaging web app |
| **Document** | Architectural HLD |
| **Scope** | System context, components, data stores, deployments, NFRs |
| **Stack** | React · Express · MongoDB · Socket.IO · Cloudinary · Render |

---

## 1. Purpose

Quick Chat lets authenticated users discover other users, create/open 1:1 chats, exchange text/images in real time, see typing and online status, manage unread counts, and upload profile pictures.

---

## 2. System context

```text
┌─────────────┐     HTTPS / WSS      ┌──────────────────────┐
│  Browser    │◄───────────────────►│  Quick Chat Platform │
│  (User)     │                      └──────────┬───────────┘
└─────────────┘                                 │
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           ▼
            ┌───────────────┐        ┌─────────────────┐        ┌─────────────────┐
            │ MongoDB Atlas │        │   Cloudinary    │        │  (DNS / CDN via │
            │  (primary DB) │        │ (profile media) │        │   Render static)│
            └───────────────┘        └─────────────────┘        └─────────────────┘
```

**External actors**

| Actor | Interaction |
|-------|-------------|
| End user | Uses React SPA in browser |
| MongoDB Atlas | Persists users, chats, messages |
| Cloudinary | Stores profile image assets; returns HTTPS URLs |
| Render | Hosts API (Web Service) and SPA (Static Site) |

---

## 3. Logical architecture

```text
┌──────────────────────────────── CLIENT (SPA) ────────────────────────────────┐
│  React Router pages · Redux store · Axios REST · Socket.IO client            │
│  ProtectedRoute gate · Toast / Loader UX                                     │
└───────────────────────────────┬───────────────────┬──────────────────────────┘
                                │ REST (JSON)       │ Socket.IO (events)
                                ▼                   ▼
┌──────────────────────────────── SERVER (Node) ───────────────────────────────┐
│  Express HTTP API  +  same process Socket.IO attached to HTTP server         │
│  Auth middleware (JWT) · Controllers · Mongoose models                       │
│  In-memory online-user list (process local)                                  │
└───────────────────────────────┬───────────────────┬──────────────────────────┘
                                │                   │
                                ▼                   ▼
                         MongoDB Atlas         Cloudinary API
```

**Design principle:** dual channel

| Channel | Responsibility |
|---------|----------------|
| **REST** | Auth, CRUD persistence, durability of messages/chats/users |
| **Socket.IO** | Low-latency fan-out: new messages, unread sync, typing, presence |

---

## 4. Deployed topology (as built)

| Service | Host | Example URL | Role |
|---------|------|-------------|------|
| Frontend | Render Static Site | `https://quick-chat-client-*.onrender.com` | Serves CRA `build/`; SPA rewrite to `index.html` |
| Backend | Render Web Service | `https://quick-chat-server-*.onrender.com` | Express + Socket.IO; `PORT` from host |
| Database | MongoDB Atlas | `mongodb+srv://...` | Managed cluster |
| Media | Cloudinary | HTTPS CDN URLs | Profile pics folder `quick-chat` |

**Client config (build-time)**

- `REACT_APP_API_URL` → backend origin (REST + Socket base)

**Server config (runtime)**

- `CONN_STRING`, `SECRET_KEY`, optional `CLIENT_URL`, `PORT` / `PORT_NUMBER`
- Cloudinary credentials (currently in `cloudinary.js`)

---

## 5. Major use cases (HLD view)

| ID | Use case | Primary path |
|----|----------|--------------|
| UC1 | Sign up / log in | REST auth → JWT in `localStorage` |
| UC2 | Enter app | ProtectedRoute loads user, users, chats → Redux |
| UC3 | Start chat | REST create chat → select in UI |
| UC4 | Send message | REST persist + Socket emit to both member rooms |
| UC5 | Receive message | Socket `receive-message` / unread events → UI |
| UC6 | Clear unread | REST + Socket notify peer |
| UC7 | Typing / online | Socket only (ephemeral) |
| UC8 | Profile pic | REST → Cloudinary → User.profilePic URL |

---

## 6. High-level message send flow

```text
User A (open chat)                    Server                         User B
       │                                │                               │
       │  POST /api/message/new-message │                               │
       │───────────────────────────────►│ save Message                  │
       │                                │ update Chat.lastMessage       │
       │                                │ $inc unreadMessageCount       │
       │◄───────────────────────────────│ 201 + saved message           │
       │                                │                               │
       │  socket: send-message          │                               │
       │───────────────────────────────►│ rooms[A], rooms[B]            │
       │                                │── receive-message ───────────►│
       │                                │── set-message-count ─────────►│
       │◄─ (local append / sync) ───────│                               │
```

---

## 7. Security (HLD)

| Concern | Approach in this system |
|---------|-------------------------|
| Password storage | bcrypt hash (cost factor 10) |
| Session | Stateless JWT (`userId`, 1d expiry), Bearer header |
| API authorization | `authMiddleware` on user/chat/message routes |
| Transport | HTTPS on Render |
| CORS | Express `cors()` open; Socket.IO `CLIENT_URL` or `*` |
| Secrets | Env vars preferred; `config.env` / Cloudinary keys must not be public |

**Gaps to call out in interviews:** no refresh tokens, no rate limiting, secrets historically in repo, chat images as base64 in DB/payload (not Cloudinary).

---

## 8. Non-functional characteristics

| NFR | Current state |
|-----|----------------|
| Availability | Free Render sleeps after idle → cold start latency |
| Scalability | Single Node process; online list is **in-memory** (not multi-instance safe) |
| Consistency | Messages durable in MongoDB; presence is best-effort |
| Payload size | JSON body limit **50mb** (supports data-URL images) |
| Observability | Console logs only; no APM/metrics pipeline in repo |

---

## 9. Technology decisions (rationale)

| Decision | Why |
|----------|-----|
| MERN | Familiar full-stack JS; fast CRUD with Mongoose |
| Socket.IO on same server | Shared process simplifies deploy for a portfolio/MVP |
| UserId as socket room | Simple targeting of 1:1 peers without chat-room abstraction |
| Redux Toolkit | Centralize shared session/chat list across Home/Sidebar/Chat |
| Cloudinary for avatars only | Quick profile pics; chat images kept inline for MVP simplicity |

---

## 10. Related documents

| Doc | Content |
|-----|---------|
| [LLD — Backend](./02-LLD-backend.md) | Modules, models, APIs, sockets, algorithms |
| [LLD — Frontend](./03-LLD-frontend.md) | Pages, components, state, API/socket clients |
| [Sequence diagrams](./04-sequence-diagrams.md) | End-to-end Mermaid flows |
| [OpenAPI](./05-openapi.yaml) | REST contract |
| [Socket events](./06-socket-events.md) | Real-time event contract |
| [ER diagram](./07-er-diagram.md) | Database entity relationships |

---

## 11. Future architecture (optional interview depth)

```text
┌────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────────┐
│ React  │──►│ API tier   │──►│ MongoDB      │   │ Redis       │
│        │──►│ (N nodes)  │   │              │   │ presence +  │
│        │──►│ Socket GW  │◄──┤              │   │ pub/sub     │
└────────┘   └────────────┘   └──────────────┘   └─────────────┘
```

Scale path: sticky sessions or Socket.IO Redis adapter; move presence to Redis; paginate messages; upload chat media to object storage; API gateway + rate limits.
