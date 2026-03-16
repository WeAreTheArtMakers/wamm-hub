# Backend Structure

```txt
backend/
  prisma/
    schema.prisma
    seed.js
  src/
    lib/
      auth.js
      content.js
      content-import.js
      prisma.js
      serializers.js
      text.js
    routes/
      auth.js
      catalog.js
      orders.js
      studio.js
    server.js
```

## Data model highlights

- `User` + `Artist` owner relation (artist onboarding)
- `Release` with `status`, `isForSale`, `sourceRepo`
- `Track` with preview/high/original URLs + extracted cover metadata
- `Order` for purchase/download access

## Runtime static serving

- `/media/*` -> `content/*` audio/source files
- `/generated/*` -> `public/generated/*` extracted covers
