import { config } from "@/config";
import Snoowrap = require("snoowrap");

const redditClient = new Snoowrap({
  userAgent: config.reddit.userAgent,
  clientId: config.reddit.clientId,
  clientSecret: config.reddit.clientSecret,
  username: config.reddit.userName,
  password: config.reddit.password,
});

redditClient.config({ requestDelay: 50 });

export { redditClient };
