import { allowedOrigins } from "@/config/cors";

const mains = () => {
  console.log("hey");
  console.log({ allowedOrigins });
};

mains();
