import { NextRequest } from "next/server";

const handler = (req: NextRequest) => {
  
  const storedSecret = process.env.ADMIN_SECRET;  
  const secret = req.headers.get("x-admin-secret");
  console.log(secret, storedSecret);

  if (secret !== storedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  return new Response("OK", { status: 200 });
}

export { handler as GET, handler as POST };