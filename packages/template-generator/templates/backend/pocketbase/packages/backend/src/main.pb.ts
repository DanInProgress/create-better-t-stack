/// <reference path="../pocketbase.d.ts" />

routerAdd("GET", "/hello", (c) => {
    return c.json(200, { "message": "Hello from PocketBase TypeScript hooks!" })
})

onRecordBeforeCreateRequest((e) => {
    // Example hook logic
    const admin = e.httpContext.get("admin")
    if (!admin) {
        // e.record.set("status", "pending")
    }
}, "users")
