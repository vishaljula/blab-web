import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDb } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { hashString, encrypt, decrypt } from "./lib/crypto";
import { verifyOTP } from "./lib/sms";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        phone: { label: "Phone", type: "text" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials) return null;

        const { phone, code } = credentials;

        if (!phone) {
          throw new Error("Phone number is required");
        }

        const phoneStr = phone as string;

        // Verify using SMS OTP code (Twilio / MSG91 routing engine)
        const isVerified = await verifyOTP(phoneStr, code as string);
        if (!isVerified) {
          throw new Error("Invalid OTP code");
        }

        const phoneHash = hashString(phoneStr);
        const db = getDb();

        // Query existing user
        let user = await db.query.users.findFirst({
          where: eq(users.phoneHash, phoneHash),
        });

        // Insert new user if they don't exist yet (progressive signup)
        if (!user) {
          const [newUser] = await db
            .insert(users)
            .values({
              phoneHash,
              encryptedPhone: encrypt(phoneStr),
              role: "buyer", // Defaults to standard buyer
            })
            .returning();
          user = newUser;
        }

        // Return user with decrypted details for JWT token session
        return {
          id: user.id,
          role: user.role,
          phone: phoneStr,
          name: user.encryptedName ? decrypt(user.encryptedName) : null,
          email: user.encryptedEmail ? decrypt(user.encryptedEmail) : null,
          reraNumber: user.reraNumber || null,
          companyName: user.companyName || null,
          projectCount: user.projectCount || null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.phone = (user as any).phone;
        token.name = user.name;
        token.email = user.email;
        token.reraNumber = (user as any).reraNumber;
        token.companyName = (user as any).companyName;
        token.projectCount = (user as any).projectCount;
      }

      // Handle session updates from frontend update() call
      if (trigger === "update" && session) {
        token.name = session.name !== undefined ? session.name : token.name;
        token.email = session.email !== undefined ? session.email : token.email;
        token.role = session.role !== undefined ? session.role : token.role;
        token.reraNumber = session.reraNumber !== undefined ? session.reraNumber : token.reraNumber;
        token.companyName = session.companyName !== undefined ? session.companyName : token.companyName;
        token.projectCount = session.projectCount !== undefined ? session.projectCount : token.projectCount;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).phone = token.phone;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        (session.user as any).reraNumber = token.reraNumber;
        (session.user as any).companyName = token.companyName;
        (session.user as any).projectCount = token.projectCount;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days session
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
});
