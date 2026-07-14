# Quick Chat — Sequence Diagrams Pack

Companion to [HLD](./01-HLD-architecture.md) and [Backend LLD](./02-LLD-backend.md).  
Diagrams use Mermaid (`sequenceDiagram`) and match current code behavior.

---

## SD-01 — User signup

```mermaid
sequenceDiagram
    autonumber
    actor U as User (Browser)
    participant FE as React Client
    participant API as Express /api/auth
    participant DB as MongoDB (users)

    U->>FE: Submit signup form
    FE->>API: POST /api/auth/signup<br/>{firstname, lastname, email, password}
    API->>DB: findOne({ email })
    alt email already exists
        DB-->>API: user document
        API-->>FE: { success: false, message: "User already exists." }
        FE-->>U: Toast error
    else new email
        DB-->>API: null
        API->>API: bcrypt.hash(password, 10)
        API->>DB: save new User
        DB-->>API: saved
        API-->>FE: 201 { success: true }
        FE-->>U: Navigate to /login
    end
```

---

## SD-02 — User login + JWT storage

```mermaid
sequenceDiagram
    autonumber
    actor U as User (Browser)
    participant FE as React Client
    participant API as Express /api/auth
    participant DB as MongoDB (users)
    participant LS as localStorage

    U->>FE: Submit login form
    FE->>API: POST /api/auth/login<br/>{email, password}
    API->>DB: findOne({ email })
    alt user not found / bad password
        API-->>FE: { success: false, message }
        FE-->>U: Toast error
    else valid credentials
        API->>API: bcrypt.compare
        API->>API: jwt.sign({ userId }, SECRET_KEY, 1d)
        API-->>FE: { success: true, token }
        FE->>LS: setItem("token", token)
        FE-->>U: Navigate to /
    end
```

---

## SD-03 — Enter protected app (bootstrap)

```mermaid
sequenceDiagram
    autonumber
    actor U as User (Browser)
    participant FE as ProtectedRoute
    participant AX as Axios (+ Bearer)
    participant API as Express API
    participant DB as MongoDB
    participant RX as Redux Store
    participant SK as Socket.IO Client
    participant IO as Socket.IO Server

    U->>FE: Open / (Home)
    FE->>FE: Read localStorage.token
    alt no token
        FE-->>U: Redirect /login
    else token present
        par Load session data
            FE->>AX: getLoggedUser()
            AX->>API: GET /api/user/get-logged-user
            API->>API: jwt.verify → userId
            API->>DB: find user by userId
            API-->>FE: { success, data: user }
            FE->>RX: setUser(user)
        and
            FE->>AX: getAllUsers()
            AX->>API: GET /api/user/get-all-users
            API->>DB: find users ≠ self
            API-->>FE: { success, data: users[] }
            FE->>RX: setAllUsers
        and
            FE->>AX: getAllChats()
            AX->>API: GET /api/chat/get-all-chats
            API->>DB: find chats + populate
            API-->>FE: { success, data: chats[] }
            FE->>RX: setAllChats
        end
        FE-->>U: Render Home
        Note over SK,IO: Home mounts
        SK->>IO: join-room(userId)
        SK->>IO: user-login(userId)
        IO-->>SK: online-users(list)
    end
```

---

## SD-04 — Create new 1:1 chat

```mermaid
sequenceDiagram
    autonumber
    actor U as User A
    participant UL as UserList UI
    participant RX as Redux
    participant API as Express /api/chat
    participant DB as MongoDB (chats)

    U->>UL: Search user B → Start Chat
    UL->>API: POST /api/chat/create-new-chat<br/>{ members: [A, B] } + Bearer
    API->>API: authMiddleware (JWT)
    API->>DB: save Chat
    API->>DB: populate members
    API-->>UL: 201 { success, data: chat }
    UL->>RX: setAllChats([...prev, chat])
    UL->>RX: setSelectedChat(chat)
    UL-->>U: Chat pane opens
```

---

## SD-05 — Send message (REST + Socket)

```mermaid
sequenceDiagram
    autonumber
    actor A as User A
    participant CA as Chat UI (A)
    participant API as Express /api/message
    participant DB as MongoDB
    participant IO as Socket.IO Server
    participant CB as Chat UI (B)

    A->>CA: Type text / attach image → Send
    CA->>CA: Build message object<br/>(chatId, sender, text?, image?, members)

    Note over CA,API: Persistence path
    CA->>API: POST /api/message/new-message + Bearer
    API->>DB: insert Message
    API->>DB: update Chat<br/>lastMessage + $inc unreadMessageCount
    API-->>CA: 201 { success, data: savedMessage }

    Note over CA,IO: Real-time path
    CA->>IO: emit send-message(message)
    IO->>IO: to(members[0]).to(members[1])
    IO-->>CA: receive-message / set-message-count
    IO-->>CB: receive-message / set-message-count

    CA->>CA: Append to allMessages / refresh chats
    CB->>CB: If chat open → append;<br/>else bump unread UI
```

---

## SD-06 — Open chat & clear unread

```mermaid
sequenceDiagram
    autonumber
    actor A as User A
    participant UI as Chat / UserList
    participant API as Express /api/chat & /message
    participant DB as MongoDB
    participant IO as Socket.IO Server
    participant B as User B client

    A->>UI: Select existing chat
    UI->>UI: setSelectedChat(chat)
    UI->>API: GET /api/message/get-all-messages/:chatId
    API->>DB: find messages sort createdAt asc
    API-->>UI: { data: messages[] }
    UI->>UI: Render history

    alt lastMessage.sender !== currentUser
        UI->>API: POST /api/chat/clear-unread-message<br/>{ chatId }
        API->>DB: unreadMessageCount = 0
        API->>DB: updateMany messages read=true
        API-->>UI: { data: updatedChat }
        UI->>IO: emit clear-unread-messages
        IO-->>B: message-count-cleared
        UI->>UI: Update Redux allChats badge = 0
    end
```

---

## SD-07 — Typing indicator

```mermaid
sequenceDiagram
    autonumber
    actor A as User A
    participant CA as Chat UI (A)
    participant IO as Socket.IO Server
    participant CB as Chat UI (B)

    A->>CA: Keypress in composer
    CA->>IO: emit user-typing({ members, ... })
    IO->>IO: to both member rooms
    IO-->>CB: started-typing
    CB->>CB: Show "typing..." (~2s timeout)
    Note over CA,CB: No DB write (ephemeral only)
```

---

## SD-08 — Online / offline presence

```mermaid
sequenceDiagram
    autonumber
    actor A as User A
    participant FE as Home / Header
    participant IO as Socket.IO Server
    participant Mem as onlineUser[] (in-memory)
    participant Peer as Other clients

    Note over FE,IO: Login to Home
    FE->>IO: user-login(userId)
    IO->>Mem: push userId if absent
    IO-->>FE: online-users(list)  %% to this socket only

    Note over FE,IO: Logout
    FE->>IO: user-offline(userId)
    FE->>FE: localStorage.removeItem(token)
    IO->>Mem: splice userId
    IO-->>Peer: online-users-updated(list)  %% broadcast all
```

---

## SD-09 — Upload profile picture

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant PF as Profile Page
    participant API as Express /api/user
    participant CL as Cloudinary
    participant DB as MongoDB (users)
    participant RX as Redux

    U->>PF: Select image file
    PF->>PF: FileReader → data URL / base64
    PF->>API: POST /api/user/upload-profile-pic<br/>{ image } + Bearer
    API->>API: jwt.verify
    API->>CL: uploader.upload(image, folder=quick-chat)
    CL-->>API: secure_url
    API->>DB: update user.profilePic = secure_url
    API-->>PF: { success, data: user }
    PF->>RX: setUser(updated)
    PF-->>U: Show new avatar
```

---

## SD-10 — Logout

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant HD as Header
    participant LS as localStorage
    participant IO as Socket.IO Server
    participant R as React Router

    U->>HD: Click logout
    HD->>IO: emit user-offline(userId)
    HD->>LS: removeItem("token")
    HD->>R: navigate /login
    Note over HD,R: Redux may retain stale user until refresh;<br/>next ProtectedRoute requires token
```

---

## How to present in interviews

1. Start with **SD-02 + SD-03** (auth session).  
2. Then **SD-05** (hybrid REST + Socket — strongest design point).  
3. Mention **SD-08** limitation: in-memory presence, not multi-instance safe.  
4. Point reviewers to OpenAPI for exact payloads: [05-openapi.yaml](./05-openapi.yaml).
