import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/db/index";
import { users } from "../src/db/schema";
import { hashString, decrypt } from "../src/lib/crypto";
import { eq, or } from "drizzle-orm";

async function run() {
  const db = getDb();
  const arg = process.argv[2];

  if (!arg) {
    console.log("\n=== Current Users in Database ===");
    try {
      const allUsers = await db.select().from(users);
      if (allUsers.length === 0) {
        console.log("No users found in database.");
      } else {
        allUsers.forEach((u) => {
          const name = u.encryptedName ? decrypt(u.encryptedName) : "N/A";
          const phone = u.encryptedPhone ? decrypt(u.encryptedPhone) : "N/A";
          const email = u.encryptedEmail ? decrypt(u.encryptedEmail) : "N/A";
          console.log(`ID: ${u.id} | Name: ${name} | Phone: ${phone} | Email: ${email} | Role: ${u.role} | Created: ${u.createdAt}`);
        });
      }
      console.log("\nTo delete a user, run:");
      console.log("  npx tsx scripts/delete_user.ts <phone_or_email_or_id>\n");
    } catch (error) {
      console.error("Failed to list users:", error);
    }
    process.exit(0);
  }

  // Deletion logic
  console.log(`Searching for user matching: "${arg}"...`);
  const hashed = hashString(arg);
  
  try {
    // Try to find by UUID directly, or by hashed phone/email
    let userToDelete = null;
    
    // Check if UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(arg)) {
      const results = await db.select().from(users).where(eq(users.id, arg));
      if (results.length > 0) userToDelete = results[0];
    }

    if (!userToDelete) {
      // Find by hashed phone or hashed email
      const results = await db.select().from(users).where(
        or(
          eq(users.phoneHash, hashed),
          eq(users.emailHash, hashed)
        )
      );
      if (results.length > 0) userToDelete = results[0];
    }

    if (!userToDelete) {
      // Last resort: decrypt and search (useful if we didn't store hash or format differs)
      const all = await db.select().from(users);
      for (const u of all) {
        const phone = u.encryptedPhone ? decrypt(u.encryptedPhone) : "";
        const email = u.encryptedEmail ? decrypt(u.encryptedEmail) : "";
        if (phone === arg || email === arg || phone.replace(/\s+/g, "") === arg.replace(/\s+/g, "")) {
          userToDelete = u;
          break;
        }
      }
    }

    if (!userToDelete) {
      console.log(`No user found matching "${arg}".`);
      process.exit(1);
    }

    const decryptedPhone = userToDelete.encryptedPhone ? decrypt(userToDelete.encryptedPhone) : "N/A";
    const decryptedEmail = userToDelete.encryptedEmail ? decrypt(userToDelete.encryptedEmail) : "N/A";
    console.log(`Found User ID: ${userToDelete.id} (Phone: ${decryptedPhone}, Email: ${decryptedEmail}). Deleting...`);
    
    await db.delete(users).where(eq(users.id, userToDelete.id));
    console.log("Successfully deleted user.");
  } catch (error) {
    console.error("Failed to delete user:", error);
    process.exit(1);
  }
}

run();
