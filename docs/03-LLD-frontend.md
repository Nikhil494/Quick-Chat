# Quick Chat — Frontend Low Level Design (LLD)

| Field | Value |
|-------|--------|
| **Document** | Frontend LLD |
| **Code root** | `client/src/` |
| **Runtime** | React 18 · React Router 6 · Redux Toolkit · Axios · Socket.IO client |

---

## 1. Module map

```text
client/src/
├── index.js                 # React root + Redux Provider
├── App.js                   # Router, Toaster, global Loader
├── apiCalls/
│   ├── index.js             # base URL + axiosInstance (Bearer token)
│   ├── auth.js
│   ├── users.js
│   ├── chat.js
│   └── message.js
├── components/
│   ├── protectedRoute.js    # Auth gate + bootstrap data fetch
│   └── loader.js
├── pages/
│   ├── login/
│   ├── signup/
│   ├── profile/
│   └── home/
│       ├── index.js         # Socket lifecycle + layout shell
│       └── components/
│           ├── header.js
│           ├── sidebar.js
│           ├── search.js
│           ├── userList.js
│           └── chat.js      # Message pane
└── redux/
    ├── store.js
    ├── usersSlice.js
    └── loaderSlice.js
```

---

## 2. Application shell

### 2.1 Routing (`App.js`)

| Path | Guard | Page |
|------|-------|------|
| `/` | `ProtectedRoute` | Home (chat UI) |
| `/profile` | `ProtectedRoute` | Profile pic upload |
| `/login` | Public | Login |
| `/signup` | Public | Signup |

**Global overlays**

- `react-hot-toast` toaster  
- Redux-driven `<Loader />` when `loaderReducer.loader === true`

### 2.2 Auth gate (`ProtectedRoute`)

```text
mount
  │
  ├─ no localStorage.token → navigate('/login')
  │
  └─ has token
        ├─ GET get-logged-user  → setUser
        ├─ GET get-all-users    → setAllUsers
        └─ GET get-all-chats    → setAllChats
        on failure → login redirect / toast
  │
  └─ render children
```

---

## 3. State management LLD

### 3.1 Redux store

```text
store
├── loaderReducer  → { loader: boolean }
└── userReducer    → {
      user: User | null,
      allUsers: User[],
      allChats: Chat[],
      selectedChat: Chat | null
    }
```

#### `usersSlice` actions

| Action | Effect |
|--------|--------|
| `setUser` | Logged-in user |
| `setAllUsers` | Directory of others |
| `setAllChats` | Sidebar chat list |
| `setSelectedChat` | Active conversation |

#### `loaderSlice`

| Action | Effect |
|--------|--------|
| `showLoader` / `hideLoader` | Toggle global spinner |

### 3.2 Local component state (not Redux)

| Location | State | Why local |
|----------|-------|-----------|
| `home/index.js` | `onlineUser[]` | Ephemeral presence |
| `chat.js` | `allMessages`, typing flags, emoji open, input | Per-conversation UI |
| `search.js` / `userList` | search text / filters | Transient UI |
| login/signup/profile forms | form fields | Uncontrolled until submit |

**Guideline:** shared cross-page session data → Redux; conversation UI ephemera → local state.

---

## 4. API client LLD

### 4.1 Base URL normalization (`apiCalls/index.js`)

```text
REACT_APP_API_URL || "http://localhost:5000"
        │
        ▼
 always ensure trailing "/"
        │
        ▼
 url + "api/...."
```

**Why:** prevents `https://hostapi/...` when env has no trailing slash.

### 4.2 Axios instance

```text
axiosInstance
  headers.authorization = `Bearer ${localStorage.token}`
```

**Note:** header is captured at module init / request construction times depending on Axios create pattern — token must exist before protected calls (true after login + refresh). Improving this with an interceptor is a known enhancement.

### 4.3 API function map

| Module | Function | HTTP |
|--------|----------|------|
| auth | `signupUser` | `POST api/auth/signup` |
| auth | `loginUser` | `POST api/auth/login` |
| users | `getLoggedUser` | `GET api/user/get-logged-user` |
| users | `getAllUsers` | `GET api/user/get-all-users` |
| users | `uploadProfilePic` | `POST api/user/upload-profile-pic` |
| chat | `getAllChats` | `GET api/chat/get-all-chats` |
| chat | `createNewChat` | `POST api/chat/create-new-chat` |
| chat | `clearUnreadMessageCount` | `POST api/chat/clear-unread-message` |
| message | `createNewMessage` | `POST api/message/new-message` |
| message | `getAllMessages` | `GET api/message/get-all-messages/:chatId` |

Errors: most wrappers `catch` and return the error object (caller checks `response.success`).

---

## 5. Page & component LLD

### 5.1 Login / Signup

| Concern | Behavior |
|---------|----------|
| Form | Controlled inputs (email/password/name) |
| Submit | Call `loginUser` / `signupUser` |
| Success (login) | `localStorage.setItem('token', token)` → navigate `/` |
| Success (signup) | Navigate to login |
| UX | Toasts + loader dispatch |

### 5.2 Home shell (`pages/home/index.js`)

**Responsibilities**

1. Create Socket.IO client: `io(REACT_APP_API_URL || localhost:5000)`
2. On `user` available: emit `join-room`, `user-login`; subscribe to online events
3. Compose layout: `Header` + `Sidebar` + conditional `ChatArea`

```text
┌─────────────────────────────────────────────┐
│ Header (user chip, logout, profile link)    │
├──────────────┬──────────────────────────────┤
│ Sidebar      │ ChatArea (if selectedChat)   │
│  Search      │  messages · input · emoji    │
│  UserList    │                              │
└──────────────┴──────────────────────────────┘
```

### 5.3 Header

- Shows logged-in identity / avatar  
- Logout: remove token, emit `user-offline`, navigate login  
- Link to `/profile`

### 5.4 Sidebar + Search + UserList

| Mode | Data source | Action |
|------|-------------|--------|
| Empty search | `allChats` | Select existing chat (`setSelectedChat`) |
| Non-empty search | filter `allUsers` by name | “Start chat” → `createNewChat` if needed |

**Online UI:** avatar styling when user id ∈ `onlineUser`.

**Unread UI:** badge from `chat.unreadMessageCount` when last sender ≠ current user.

### 5.5 Chat area (`chat.js`) — core logic

| Behavior | Implementation outline |
|----------|------------------------|
| Load history | On `selectedChat` change → `getAllMessages` → local `allMessages` |
| Clear unread | If last message not from self → REST clear + socket `clear-unread-messages` |
| Send text | Build message object → socket `send-message` + REST `createNewMessage` → refresh chats |
| Send image | FileReader → data URL on `message.image` |
| Receive | Listen `receive-message` → append if chat open; update chat list / counts |
| Typing | On input emit `user-typing`; listen `started-typing` → show indicator ~2s |
| Emoji | `emoji-picker-react` inserts into text |
| Read ticks | Based on message `read` flag |

### 5.6 Profile

- Pick image → FileReader → `uploadProfilePic` → update Redux user / reload

---

## 6. Socket client LLD

**Lifetime lifetime:** module-level socket in `home/index.js` (single connection for Home tree).

| Emit | When |
|------|------|
| `join-room` | User loaded |
| `user-login` | User loaded |
| `user-offline` | Logout |
| `send-message` | Sending a message |
| `clear-unread-messages` | Opening chat with unread |
| `user-typing` | Composer input |

| Listen | UI effect |
|--------|-----------|
| `online-users` / `online-users-updated` | Update `onlineUser` state |
| `receive-message` | Append message / update lists |
| `set-message-count` | Unread badges |
| `message-count-cleared` | Reset peer unread display |
| `started-typing` | Typing label |

---

## 7. Key frontend sequence: open app after login

```text
Browser                ProtectedRoute           API                Redux
   │                        │                    │                   │
   │  GET /                 │                    │                   │
   │───────────────────────►│ token?             │                   │
   │                        │── get-logged-user ►│                   │
   │                        │◄──────────────────│                   │
   │                        │───────────────────────────────────────►│ setUser
   │                        │── get-all-users ─►│                   │
   │                        │───────────────────────────────────────►│ setAllUsers
   │                        │── get-all-chats ─►│                   │
   │                        │───────────────────────────────────────►│ setAllChats
   │  render Home           │                    │                   │
   │───────────────────────►│                    │                   │
   │  socket join/login     │                    │                   │
```

---

## 8. Key frontend sequence: send message

```text
Chat UI                     API (REST)              Socket                Peer UI
   │                           │                      │                     │
   │ createNewMessage ────────►│ persist              │                     │
   │◄──────────────────────────│                      │                     │
   │ send-message ───────────────────────────────────►│                     │
   │                           │                      │── receive-message ─►│
   │                           │                      │── set-message-count►│
   │ update local messages     │                      │                     │
   │ refresh allChats          │                      │                     │
```

Exact ordering in code may emit socket around the REST call; both channels are used.

---

## 9. UI states & edge cases

| Scenario | Frontend behavior |
|----------|-------------------|
| No token | Redirect login |
| API auth fail in ProtectedRoute | Toast + force login |
| No `selectedChat` | Sidebar only / empty chat pane |
| Backend cold start (Render free) | Slow first request; loader may show long |
| SPA deep link `/login` | Needs host rewrite `/* → /index.html` |

---

## 10. Build & env

| Item | Detail |
|------|--------|
| Tooling | `react-scripts` (CRA) |
| Prod build | `npm run build` → `client/build` |
| Critical env | `REACT_APP_API_URL=https://<backend-host>` (no reliance on trailing slash after normalization) |
| Deploy | Render Static Site, publish `build` |

---

## 11. Frontend improvement backlog

1. Axios request interceptor to always read fresh token  
2. Move socket to context/provider; disconnect on unmount  
3. Message virtualization / pagination for long threads  
4. Optimistic UI with rollback on REST failure  
5. Fix eslint hook dependency warnings properly  
6. Don’t store/display sensitive fields from user payload  
7. TypeScript + shared API types with backend  

---

## 12. Component ownership matrix

| Component | Reads Redux | Writes Redux | Socket | REST |
|-----------|-------------|--------------|--------|------|
| ProtectedRoute | user (unused largely) | user, allUsers, allChats, loader | — | ✓ |
| Home | user, selectedChat | — | ✓ | — |
| Header | user | clears via logout nav | offline emit | — |
| UserList | users/chats/selected | selectedChat, allChats | online list | create chat |
| Chat | user, selectedChat, allChats | allChats, selectedChat | ✓ | ✓ |
| Profile | user | user | — | ✓ |
| Login/Signup | — | loader | — | ✓ |
