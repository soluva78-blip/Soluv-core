// getPosts.ts
import connectDB from "./src/config/db";
import { Post } from "./src/models/posts";
import { writeFileSync } from "fs";

const getFirstHundredPosts = async () => {
  await connectDB();

  const posts = await Post.find({}, { title: 1, body: 1, _id: 0 })
    .limit(100)
    .lean();

  return posts;
};

const redditPosts = await getFirstHundredPosts();
writeFileSync("redditPosts.json", JSON.stringify(redditPosts, null, 2));
