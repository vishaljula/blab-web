import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Compile regular expressions once at startup rather than on every HTTP request
const LOCAL_IP_192 = /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/;
const LOCAL_IP_10 = /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/;
const LOCAL_IP_172 = /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/;

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  
  // CORS Security: Validate the origin before reflecting it.
  // Wildcard reflection with Allow-Credentials can be exploited.
  const isAllowed = 
    origin === "http://localhost:8081" ||
    origin === "http://localhost:3000" ||
    LOCAL_IP_192.test(origin) ||
    LOCAL_IP_10.test(origin) ||
    LOCAL_IP_172.test(origin);

  // Handle preflight OPTIONS requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowed) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
    }
    return response;
  }

  const response = NextResponse.next();
  
  // Set CORS headers for the actual API response
  if (isAllowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  }
  
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
