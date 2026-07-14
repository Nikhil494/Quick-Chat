# Quick Chat — Design Docs Index

| Document | Description |
|----------|-------------|
| [01 — Architectural HLD](./01-HLD-architecture.md) | System context, components, deploy topology, NFRs |
| [02 — Backend LLD](./02-LLD-backend.md) | Modules, ER models, REST, Socket.IO, algorithms |
| [03 — Frontend LLD](./03-LLD-frontend.md) | Routes, Redux, components, API/socket clients |
| [04 — Sequence diagrams](./04-sequence-diagrams.md) | Mermaid sequences for auth, chat, sockets, profile |
| [05 — OpenAPI (Swagger)](./05-openapi.yaml) | REST API contract (OpenAPI 3.0) |
| [06 — Socket.IO events](./06-socket-events.md) | Real-time event contract (not in OpenAPI) |
| [07 — ER diagram](./07-er-diagram.md) | MongoDB collections, relationships, field dictionary |

**View OpenAPI**

- Paste `docs/05-openapi.yaml` into [Swagger Editor](https://editor.swagger.io/)
- Or use a VS Code / Cursor OpenAPI preview extension

**Live deployment (reference)**

- Frontend: `https://quick-chat-client-juig.onrender.com`
- Backend: `https://quick-chat-server-7crx.onrender.com`
