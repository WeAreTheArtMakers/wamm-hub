import path from "node:path";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { orderRouter } from "./routes/orders.js";
import { studioRouter } from "./routes/studio.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));

app.use(
  "/media",
  express.static(path.resolve(process.cwd(), "content"), {
    fallthrough: false,
    maxAge: "1d",
  }),
);

app.use(
  "/generated",
  express.static(path.resolve(process.cwd(), "public/generated"), {
    fallthrough: false,
    maxAge: "7d",
  }),
);

app.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api", catalogRouter);
app.use("/api/orders", orderRouter);
app.use("/api/studio", studioRouter);

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed.",
      errors: error.flatten(),
    });
    return;
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ message: "Uploaded file is too large." });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
