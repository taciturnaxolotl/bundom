import { Elysia } from "elysia";
import { ip } from "elysia-ip";

new Elysia()
  .use(ip())
  .onBeforeHandle(({ ip, headers }) => {
    console.log(`Request from IP: ${ip}`);
    console.log(headers);
  })
  .get("/*", "hi")
  .listen(process.env.PORT || 3000);

console.log("Server started on port 3000");
