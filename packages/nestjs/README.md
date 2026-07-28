# @graphrefly/nestjs

NestJS boundary bindings for GraphReFly.

- `@graphrefly/nestjs` provides the structural boundary and decorator contract.
- `@graphrefly/nestjs/native` provides HTTP, guard, filter, cron, and lifecycle bridges.
- `@graphrefly/nestjs/microservices` provides message transport bridges.
- `@graphrefly/nestjs/websockets` provides WebSocket bridges.

Host request, response, socket, and cancellation handles remain private to the adapter.
