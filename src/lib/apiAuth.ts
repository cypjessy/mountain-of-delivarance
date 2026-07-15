/**
 * API route authentication helper.
 * Verifies Firebase ID tokens using Firebase's REST API.
 * This avoids needing `firebase-admin` and a service account key.
 */

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

export interface VerifiedUser {
  uid: string;
  email: string | null;
}

/**
 * Verify a Firebase ID token from an Authorization header.
 * Calls Firebase's Identity Toolkit REST API to look up the user.
 *
 * Returns the VerifiedUser on success, or null if the token is invalid.
 */
export async function verifyFirebaseToken(
  authHeader: string | null
): Promise<VerifiedUser | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.slice(7); // Remove "Bearer "

  if (!idToken || !FIREBASE_API_KEY) {
    return null;
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!res.ok) {
      console.warn("[API Auth] Token verification failed:", res.status);
      return null;
    }

    const data = await res.json();
    const user = data.users?.[0];

    if (!user) return null;

    return {
      uid: user.localId,
      email: user.email || null,
    };
  } catch (err) {
    console.error("[API Auth] Error verifying token:", err);
    return null;
  }
}
