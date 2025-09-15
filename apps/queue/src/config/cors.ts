import type { CorsOptions } from "cors";

export const allowedOrigins: string | RegExp | (string | RegExp)[] = [
  "http://localhost:3000",
];

const allowedMethods: string[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

const allowedHeaders: string[] = ["Content-Type", "Authorization"];

export const corsOptions: CorsOptions = {
  methods: allowedMethods,
  allowedHeaders,
  origin: allowedOrigins,
  credentials: true,
};
