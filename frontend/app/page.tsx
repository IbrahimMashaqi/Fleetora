import { redirect } from "next/navigation";

// The workspace is the product's front door; its session gate sends signed-out
// visitors to /login, so the root never shows starter content.
export default function Home() {
  redirect("/app");
}
